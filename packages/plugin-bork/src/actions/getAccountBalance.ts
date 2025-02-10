import {
  IAgentRuntime,
  elizaLogger,
  type HandlerCallback,
  type ActionExample,
} from "@elizaos/core";
import fetch from "node-fetch";

// --- DexScreener Price Fetch Function ---
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

// --- GraphQL Balance Fetch Function ---
async function fetchBalanceFromGraphQL(walletAddress: string): Promise<any> {
  const MAX_429_RETRIES = 3; // Maximum retries for 429 responses
  const BASE_WAIT_TIME_MS = 3000; // Initial wait time for exponential backoff

  const url = "https://sui-mainnet.mystenlabs.com/graphql";
  let aggregatedBalances: any[] = [];
  let hasNextPage = true;
  let endCursor: string | null = null;

  // Loop until there are no more pages
  while (hasNextPage) {
    // Build the GraphQL query with pagination parameters.
    // We request 50 items per page.
    const query = `
      query {
        address(address: "${walletAddress}") {
          balances(first: 50${endCursor ? `, after: "${endCursor}"` : ""}) {
            nodes {
              coinType {
                repr
              }
              coinObjectCount
              totalBalance
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
      }
    `;

    const options = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        accept: "*/*",
      },
      body: JSON.stringify({ query }),
    };

    // Retry logic for handling HTTP 429 responses for this query
    let attempts = 0;
    let consecutive429Count = 0;
    let response: any = null;
    while (attempts < MAX_429_RETRIES) {
      try {
        response = await fetch(url, options);
        if (response.status === 429) {
          consecutive429Count++;
          if (consecutive429Count >= MAX_429_RETRIES) {
            console.error("Too many consecutive 429 responses. Stopping requests.");
            return null;
          }
          const waitMs = BASE_WAIT_TIME_MS * 2 ** (consecutive429Count - 1);
          console.warn(`HTTP 429: Too many requests. Retrying in ${waitMs}ms...`);
          await new Promise((resolve) => setTimeout(resolve, waitMs));
          attempts++;
          continue; // Retry the request
        } else {
          consecutive429Count = 0;
          break;
        }
      } catch (error) {
        console.error(`Attempt ${attempts + 1} failed:`, error);
        attempts++;
      }
    }

    if (!response || !response.ok) {
      console.error("Failed to fetch balances from GraphQL.");
      return null;
    }

    const jsonData = await response.json();

    if (!jsonData.data || !jsonData.data.address || !jsonData.data.address.balances) {
      console.error("No balance data returned from GraphQL.");
      return null;
    }

    const balancesData = jsonData.data.address.balances;
    aggregatedBalances = aggregatedBalances.concat(balancesData.nodes);

    // Update pagination
    hasNextPage = balancesData.pageInfo.hasNextPage;
    endCursor = balancesData.pageInfo.endCursor;
  }

  return aggregatedBalances;
}

export default {
  name: "OBTAIN_WALLET_BALANCES",
  similes: ["GET_BALANCES", "WALLET_BALANCES", "OBTAIN_BALANCES"],
  description: "Fetches recent Sui wallet balances using GraphQL with pagination and enriches each token with its current price from DexScreener.",
  validate: async (_runtime: IAgentRuntime, _message: any) => true,
  handler: async (
    runtime: IAgentRuntime,
    message: any,
    _unused: any,
    _options: { [key: string]: unknown },
    callback?: HandlerCallback
  ): Promise<boolean> => {
    elizaLogger.log("Starting OBTAIN_WALLET_BALANCES...");

    try {
      // Extract wallet address from message text or environment.
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

      // Fetch balances using the GraphQL endpoint.
      const balances = await fetchBalanceFromGraphQL(walletAddress);

      if (!balances) {
        callback?.({
          text: `No balances found for wallet ${walletAddress}.`,
          content: { balances: {} },
        });
        return true;
      }

      // Extract unique tokens from the balances array.
      const uniqueTokens: string[] = Array.from(new Set(balances.map((b: any) => b.coinType.repr)));
      elizaLogger.log("Unique tokens:", uniqueTokens);

      // Fetch token prices from DexScreener.
      const prices = await fetchTokenPrices(uniqueTokens);
      elizaLogger.log("Fetched token prices:", prices);

      // Enrich each balance object with a 'price' field.
      const enrichedBalances = balances.map((b: any) => ({
        ...b,
        // Append a price field from the fetched prices. If not available, assign null.
        price: prices[b.coinType.repr] || null,
      }));

      // Return the final enriched balances in the callback.
      if (callback) {
        callback({
          text: `Fetched balances for wallet ${walletAddress}: ${JSON.stringify(enrichedBalances, null, 2)}`,
          content: { balances: enrichedBalances },
        });
      }

      return true;
    } catch (error: any) {
      console.error("Error fetching wallet balances:", error);
      callback?.({
        text: `Error fetching wallet balances: ${error.message}`,
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
          text: "Fetch balances for wallet 0x02a212de6a9dfa3a69e22387acfbafbb1a9e591bd9d636e7895dcfc8de05f331.",
        },
      },
      {
        user: "{{user2}}",
        content: {
          text: "Getting wallet balances...",
          action: "OBTAIN_WALLET_BALANCES",
        },
      },
      {
        user: "{{user2}}",
        content: {
          text: "Fetched wallet balances successfully.",
          content: {
            // Example output (structure similar to enriched balances)
            balances: [
              {
                coinType: { repr: "0x2::sui::SUI" },
                coinObjectCount: 1,
                totalBalance: "4504862384",
                price: 125.4
              },
              // ...
            ],
          },
        },
      },
    ],
  ] as ActionExample[][],
};
