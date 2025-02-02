import {
  IAgentRuntime,
  elizaLogger,
  type HandlerCallback,
  type ActionExample,
} from "@elizaos/core";
import fetch from "node-fetch";

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

function transformBlockberryData(data: any): any[] {
  if (!data?.content) return [];
  
  const filtered = data.content.filter((tx: any) => {
    if (tx.txStatus !== "SUCCESS") return false;

    const hasCoins = (tx.details?.detailsDto?.coins?.length ?? 0) > 0;
    const isNFT = tx.details?.type === "NFT" && !!tx.details?.detailsDto?.nftType;

    return hasCoins || isNFT;
  });

  return filtered.map((tx: any) => {
    const activity = Array.isArray(tx.activityType) ? tx.activityType : [tx.activityType];
    const timestamp = tx.timestamp;

    if (tx.details?.type === "NFT" && tx.details?.detailsDto?.nftType) {
      return {
        type: activity,
        timestamp: timestamp,
        coinType: [tx.details.detailsDto.nftType],
        amount: [tx.details.detailsDto.price ?? 0],
      };
    }

    const coinTypes: string[] = [];
    const amounts: number[] = [];

    (tx.details?.detailsDto?.coins ?? []).forEach((coin: any) => {
      if (coin?.coinType && coin.amount !== undefined) {
        coinTypes.push(coin.coinType);
        amounts.push(coin.amount);
      }
    });

    return {
      type: activity,
      timestamp: timestamp,
      coinType: coinTypes.length ? coinTypes : ["UNKNOWN"],
      amount: amounts.length ? amounts : [0],
    };
  });
}

async function fetchTransactionsFromBlockberry(walletAddress: string): Promise<any[]> {
  const options = {
    method: "GET",
    headers: {
      accept: "*/*",
      "x-api-key": process.env.BLOCKBERRY_API_KEY ?? "",
    },
  };

  let hasNextPage = true;
  const transactions: any[] = [];
  let nextCursor: string | null = null;
  let consecutive429Count = 0;
  const MAX_429_RETRIES = 5;
  const MAX_PAGES = 5; // Limit to 5 pages
  let pageCount = 0;   // Track fetched pages

  while (hasNextPage && pageCount < MAX_PAGES) {
    const url = `https://api.blockberry.one/sui/v1/accounts/${walletAddress}/activity?${
      nextCursor ? `nextCursor=${nextCursor}&` : ""
    }size=20&orderBy=DESC`;

    console.log(`Fetching page ${pageCount + 1}:`, url);

    try {
      const response = await fetch(url, options);

      if (response.status === 429) {
        consecutive429Count++;
        if (consecutive429Count >= MAX_429_RETRIES) {
          console.error("Too many 429s in a row. Stopping requests.");
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
      const transformedTx = transformBlockberryData(data);

      transactions.push(...transformedTx);

      hasNextPage = data.hasNextPage;
      nextCursor = data.nextCursor;
      pageCount++; // Increase page count

      console.log(`Fetched page ${pageCount}. hasNextPage:`, hasNextPage, "nextCursor:", nextCursor);

      if (hasNextPage && pageCount < MAX_PAGES) {
        await sleep(1500);
      }
    } catch (error: any) {
      console.error("Error fetching transactions from blockchain:", error);
      hasNextPage = false;
    }
  }

  console.log(`Total pages fetched: ${pageCount}`);
  return transactions;
}

export default {
  name: "GET_ACCOUNT_ACTIVITY",
  similes: ["GET_ACTIVITY", "WALLET_ACTIVITY", "FETCH_ACTIVITY"],
  description: "Fetches recent Sui wallet transactions.",
  validate: async (_runtime: IAgentRuntime, _message: any) => true,
  handler: async (
    runtime: IAgentRuntime,
    message: any,
    _unused: any,
    _options: { [key: string]: unknown },
    callback?: HandlerCallback
  ): Promise<boolean> => {
    elizaLogger.log("Starting GET_ACCOUNT_ACTIVITY (with token prices and balances)...");

    try {
      const walletAddressMatch = message?.content?.text?.match(/0x[a-fA-F0-9]{64}/);
      const walletAddress = walletAddressMatch?.[0] || process.env.DEFAULT_WALLET_ADDRESS;

      if (!walletAddress) {
        elizaLogger.error("No wallet address found.");
        callback?.({ text: "No valid wallet address found.", content: { error: "Missing wallet address" } });
        return false;
      }

      elizaLogger.log(`Using wallet address: ${walletAddress}`);

      // Fetch transactions and balances concurrently
      const [transactions] = await Promise.all([
        fetchTransactionsFromBlockberry(walletAddress)
      ]);

      if (!transactions.length) {
        callback?.({
          text: `No recent transactions found for wallet ${walletAddress}.`,
          content: { transactions: [] },
        });
        return true;
      }
      
      // Extract unique tokens for price fetching
      const uniqueTokens = Array.from(
        new Set(transactions.flatMap((tx) => tx.coinType).filter((token) => token !== "UNKNOWN"))
      );

      // Fetch token prices
      const tokenPrices = await fetchTokenPrices(uniqueTokens);

      // Attach token prices to transactions
      transactions.forEach((tx) => {
        tx.prices = tx.coinType.map((token) => tokenPrices[token] || "N/A");
      });

      // Final response including transactions and token prices
      if (callback) {
        const formattedResponse = JSON.stringify({ transactions }, null, 2);
        callback({
          text: `Fetched transactions, balances, and token prices for wallet ${walletAddress}:\n\n${formattedResponse}`,
          content: { transactions },
        });
      }
      
      return true;
    } catch (error: any) {
      console.error("Error fetching wallet data:", error);
      callback?.({ text: `Error fetching wallet data: ${error.message}`, content: { error: error.message } });
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
                type: ["Deposit"],
                timestamp: 1737743524190,
                coinType: ["0x2::sui::SUI"],
                amount: [900.00174788]
              },
              {
                type: ["Swap"],
                timestamp: 1737743524190,
                coinType: [
                  "0xea65bb5a79ff34ca83e2995f9ff6edd0887b08da9b45bf2e31f930d3efb82866::s::S",
                  "0x2::sui::SUI",
                ],
                amount: [-4095.527057723, 9.313302043]
              },
            ],
            balances: {
              "0x2::sui::SUI": {
                balance: 125.4
              },
              "0xea65bb5a79ff34ca83e2995f9ff6edd0887b08da9b45bf2e31f930d3efb82866::s::S": {
                balance: 5000
              },
            },
          },
        },
      },
    ],
  ] as ActionExample[][],
};
