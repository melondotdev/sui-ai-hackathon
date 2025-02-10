import {
  IAgentRuntime,
  elizaLogger,
  type HandlerCallback,
  type ActionExample,
} from "@elizaos/core";
import fetch from "node-fetch";

// A simple sleep helper for retries or pacing.
async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Fetch token prices from DexScreener.
async function fetchTokenPrices(uniqueTokens: string[]): Promise<Record<string, number>> {
  if (uniqueTokens.length === 0) return {};
  
  const url = `https://api.dexscreener.com/tokens/v1/sui/${uniqueTokens.join(",")}`;
  console.log("Fetching token prices from:", url);

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Error fetching token prices: ${response.status}`);
    }
    
    const data = await response.json();
    const prices: Record<string, number> = {};

    (data ?? []).forEach((entry: any) => {
      if (entry?.priceUsd) {
        prices[entry.baseToken.address] = parseFloat(entry.priceUsd);
      }
    });

    return prices;
  } catch (error) {
    console.error("Error fetching token prices:", error);
    return {};
  }
}

/**
 * Transform the Mysten GraphQL transaction blocks.
 *
 * Only return a transaction if:
 *   - The effects.status is "SUCCESS".
 *   - At least one balance change node has an owner matching walletAddress.
 *
 * In the final object we include only:
 *   - timestamp
 *   - coinType (an array of coin type repr values)
 *   - amount (an array of numeric amounts)
 *
 * @param nodes - Array of transaction block nodes.
 * @param walletAddress - The queried wallet address.
 */
function transformMystenData(nodes: any[], walletAddress: string): any[] {
  return nodes
    .filter((node: any) => {
      const effects = node.effects || {};
      // Only proceed if the status is SUCCESS.
      if (effects.status !== "SUCCESS") return false;
      // Check that at least one balance change node has an owner matching walletAddress.
      const balanceNodes = effects.balanceChanges?.nodes || [];
      const hasMatchingOwner = balanceNodes.some((c: any) =>
        c.owner?.address?.toLowerCase() === walletAddress.toLowerCase()
      );
      return hasMatchingOwner;
    })
    .map((node: any) => {
      const effects = node.effects || {};
      const coinTypes = effects.balanceChanges?.nodes?.map((c: any) => c.coinType?.repr) || [];
      const amounts = effects.balanceChanges?.nodes?.map((c: any) => parseFloat(c.amount)) || [];
      return {
        timestamp: effects.timestamp,
        coinType: coinTypes.length > 0 ? coinTypes : ["UNKNOWN"],
        amount: amounts.length > 0 ? amounts : [0],
      };
    });
}

/**
 * Fetch transactions from the Mysten GraphQL endpoint.
 *
 * This function loops over pages (up to MAX_PAGES) using the "after" cursor.
 * It returns an aggregated array of transformed transactions.
 *
 * @param walletAddress - The wallet address to use in the filter.
 */
async function fetchTransactionsFromMystenGraphQL(walletAddress: string): Promise<any[]> {
  const url = "https://sui-mainnet.mystenlabs.com/graphql";
  let hasNextPage = true;
  let transactions: any[] = [];
  let nextCursor: string | null = null;
  const MAX_PAGES = 5; // Adjust as needed
  let pageCount = 0;
  let consecutive429Count = 0;
  const MAX_429_RETRIES = 5;

  while (hasNextPage && pageCount < MAX_PAGES) {
    // Build the query; include the "after" cursor if available.
    const query = `
      query {
        transactionBlocks(
          filter: { affectedAddress: "${walletAddress}" }
          last: 50
          ${nextCursor ? `after: "${nextCursor}"` : ""}
          scanLimit: 100000000
        ) {
          nodes {
            effects {
              status
              timestamp
              balanceChanges {
                nodes {
                  owner {
                    address
                  }
                  amount
                  coinType {
                    repr
                  }
                }
              }
            }
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    `;
    console.log(`Fetching Mysten transactions page ${pageCount + 1} for wallet ${walletAddress}`);

    const options = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        accept: "*/*",
      },
      body: JSON.stringify({ query }),
    };

    try {
      const response = await fetch(url, options);

      if (response.status === 429) {
        consecutive429Count++;
        if (consecutive429Count >= MAX_429_RETRIES) {
          console.error("Too many 429 responses. Stopping requests.");
          break;
        }
        const waitMs = 3000 * 2 ** (consecutive429Count - 1);
        console.warn(`HTTP 429: Too many requests. Waiting ${waitMs}ms...`);
        await sleep(waitMs);
        continue;
      } else {
        consecutive429Count = 0;
      }

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`HTTP error ${response.status}: ${text}`);
      }

      const data = await response.json();
      if (!data || !data.data || !data.data.transactionBlocks) {
        console.error("Unexpected response structure:", data);
        break;
      }

      const { nodes, pageInfo } = data.data.transactionBlocks;
      const transformedTx = transformMystenData(nodes, walletAddress);
      transactions.push(...transformedTx);
      hasNextPage = pageInfo.hasNextPage;
      nextCursor = pageInfo.endCursor;
      pageCount++;
      console.log(`Fetched Mysten page ${pageCount}. hasNextPage: ${hasNextPage}, nextCursor: ${nextCursor}`);
      if (hasNextPage && pageCount < MAX_PAGES) {
        await sleep(1500);
      }
    } catch (error: any) {
      console.error("Error fetching transactions from Mysten GraphQL:", error);
      break;
    }
  }

  console.log(`Total Mysten pages fetched: ${pageCount}`);
  return transactions;
}

export default {
  name: "GET_ACCOUNT_ACTIVITY",
  similes: ["GET_ACTIVITY", "WALLET_ACTIVITY", "FETCH_ACTIVITY"],
  description: "Fetches recent Sui wallet transactions using Mysten GraphQL.",
  validate: async (_runtime: IAgentRuntime, _message: any) => true,
  handler: async (
    runtime: IAgentRuntime,
    message: any,
    _unused: any,
    _options: { [key: string]: unknown },
    callback?: HandlerCallback
  ): Promise<boolean> => {
    elizaLogger.log("Starting GET_ACCOUNT_ACTIVITY (using Mysten GraphQL)...");

    try {
      // Extract wallet address from message text or use default.
      const walletAddressMatch = message?.content?.text?.match(/0x[a-fA-F0-9]{64}/);
      const walletAddress = walletAddressMatch?.[0] || process.env.DEFAULT_WALLET_ADDRESS;

      if (!walletAddress) {
        elizaLogger.error("No wallet address found.");
        callback?.({
          text: "No valid wallet address found.",
          content: { error: "Missing wallet address" },
        });
        return false;
      }

      elizaLogger.log(`Using wallet address: ${walletAddress}`);

      // Fetch transactions from Mysten GraphQL.
      const transactions = await fetchTransactionsFromMystenGraphQL(walletAddress);

      if (!transactions.length) {
        callback?.({
          text: `No recent transactions found for wallet ${walletAddress}.`,
          content: { transactions: [] },
        });
        return true;
      }
      
      // Extract unique token addresses from the transactions (ignoring "UNKNOWN").
      const uniqueTokens = Array.from(
        new Set(transactions.flatMap((tx) => tx.coinType).filter((token) => token !== "UNKNOWN"))
      );

      // Fetch token prices.
      const tokenPrices = await fetchTokenPrices(uniqueTokens);
      
      // Attach token prices to each transaction.
      transactions.forEach((tx) => {
        tx.prices = tx.coinType.map((token) => tokenPrices[token] || "N/A");
      });

      // Return only the filtered transactions (without the status or owner details).
      if (callback) {
        callback({
          text: `Fetched transactions and token prices for wallet ${walletAddress}: ${JSON.stringify(transactions, null, 2)}`,
          content: { transactions },
        });
      }
      
      return true;
    } catch (error: any) {
      console.error("Error fetching wallet data:", error);
      callback?.({
        text: `Error fetching wallet data: ${error.message}`,
        content: { error: error.message },
      });
      return false;
    }
  },

  examples: [
    [
      {
        user: "{{user1}}",
        content: {
          text: "Fetch data for wallet 0x02a212de6a9dfa3a69e22387acfbafbb1a9e591bd9d636e7895dcfc8de05f331.",
        },
      },
      {
        user: "{{user2}}",
        content: {
          text: "Fetching recent transactions for your wallet...",
          action: "GET_ACCOUNT_ACTIVITY",
        },
      },
      {
        user: "{{user2}}",
        content: {
          text: "Fetched transactions successfully.",
          content: {
            transactions: [
              {
                timestamp: 1737743524190,
                coinType: ["0x2::sui::SUI"],
                amount: [900.00174788],
                prices: [125.4]
              },
              {
                timestamp: 1737743524190,
                coinType: [
                  "0xea65bb5a79ff34ca83e2995f9ff6edd0887b08da9b45bf2e31f930d3efb82866::s::S",
                  "0x2::sui::SUI"
                ],
                amount: [-4095.527057723, 9.313302043],
                prices: ["N/A", 125.4]
              },
            ],
          },
        },
      },
    ],
  ] as ActionExample[][],
};
