import {
  ActionExample,
  HandlerCallback,
  IAgentRuntime,
  Memory,
  State,
  elizaLogger,
  type Action,
} from "@elizaos/core";

import fetch from "node-fetch"; // Ensure fetch is available for node environments

/********************************
 * 1) Define a helper function  *
 ********************************/
function transformBlockberryData(data: any): any[] {
  if (!data?.content) return [];

  // Filter only SUCCESS transactions and remove icons, iconUrl, projectImg, poolCoins, isIndexed, securityMessage, gasFee, AND remove all package info
  // Keep only: activityType, details (type, coins), timestamp, digest, txStatus
  return data.content
    .filter((item: any) => item.txStatus === "SUCCESS")
    .map((item: any) => {
      return {
        activityType: item.activityType,
        details: {
          coins: (item.details?.detailsDto?.coins ?? []).map((coin: any) => ({
            amount: coin.amount,
            coinType: coin.coinType,
            symbol: coin.symbol,
          })),
        },
        timestamp: item.timestamp
      };
    });
}

/*************************************************
 * 2) Use transformBlockberryData in the fetcher *
 *************************************************/

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const fetchTransactionsFromBlockberry = async (
  walletAddress: string
): Promise<any[]> => {
  const options = {
    method: "GET",
    headers: { 
      accept: "*/*", 
      "x-api-key": process.env.BLOCKBERRY_API_KEY ?? "" 
    },
  };
  
  let hasNextPage = true;
  const transactions: any[] = [];
  let nextCursor: string | null = null;

  // Limit the max pages or keep infinite while if desired
  while (hasNextPage) {
    // Construct the URL each iteration
    const url = `https://api.blockberry.one/sui/v1/accounts/${walletAddress}/activity?${
      nextCursor ? `nextCursor=${nextCursor}&` : ""
    }size=20&orderBy=DESC`;

    console.log("Fetching URL:", url);
    
    try {
      const response = await fetch(url, options);

      // If there's a 429 error, handle it gracefully with a delay
      if (response.status === 429) {
        console.warn("HTTP 429: Too many requests. Backing off...");
        // Back off for 3 seconds (adjust as needed) and then continue
        await sleep(3000);
        continue; // or break; depending on your approach
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

      console.log(
        "Fetched batch. hasNextPage:",
        hasNextPage,
        "nextCursor:",
        nextCursor
      );

      // Add a short delay to avoid hammering the API
      if (hasNextPage) {
        await sleep(1500); // 1.5 second delay between calls
      }
    } catch (error: any) {
      console.error("Error fetching transactions from blockchain:", error);

      // If the error text includes "Too many requests", do a longer delay or stop
      if (typeof error.message === "string" && error.message.includes("Too many requests")) {
        console.error("Rate limit exceeded. Stopping further requests.");
        // You can either break out of the loop or continue with a longer sleep
        break;
      }
      // Decide whether to break or keep trying:
      // break;
      // or set hasNextPage = false if you want to stop on error
      hasNextPage = false;
    }
  }

  return transactions;
};

/****************************************************************
 * 3) The Action that uses the above function
 ****************************************************************/
export default {
  name: "FETCH_WALLET_DATA",
  similes: ["GET_DATA", "WALLET_DATA", "FETCH_DATA"],
  description: "Fetches the recent data of the user's Sui wallet.",
  validate: async (_runtime: IAgentRuntime, _message: Memory) => {
    return true;
  },
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State,
    _options: { [key: string]: unknown },
    callback?: HandlerCallback
  ): Promise<boolean> => {
    elizaLogger.log("Starting FETCH_WALLET_DATA handler...");

    try {
      const walletAddressMatch =
        message.content.text?.match(/0x[a-fA-F0-9]{64}/);
      const walletAddress =
        walletAddressMatch?.[0] || runtime.getSetting("WALLET_ADDRESS");

      if (!walletAddress) {
        elizaLogger.error("Wallet address not provided or configured.");
        if (callback) {
          callback({
            text: "I couldn't find a wallet address in your request. Please provide a valid 32-byte Sui address (e.g., 0x...) in your message.",
            content: { error: "No wallet address" },
          });
        }
        return false;
      }

      elizaLogger.log(`Using wallet address: ${walletAddress}`);
      const transactions = await fetchTransactionsFromBlockberry(walletAddress);

      if (transactions.length === 0) {
        if (callback) {
          callback({
            text: `No recent SUCCESS transactions found for wallet ${walletAddress}.`,
            content: { transactions: [] },
          });
        }
        return true;
      }

      if (callback) {
        const formattedTransactions = JSON.stringify(transactions, null, 2); // Pretty-print the JSON
        callback({
          text: `Fetched recent (SUCCESS) transactions for wallet ${walletAddress}:\n\n${formattedTransactions}`,
          content: { transactions },
        });
      }

      return true;
    } catch (error: any) {
      console.error("Error fetching wallet data:", error);

      if (callback) {
        callback({
          text: `Error fetching wallet data: ${error.message}`,
          content: { error: error.message },
        });
      }

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
          text: "Fetching the 10 most recent transactions for your wallet...",
          action: "FETCH_WALLET_DATA",
        },
      },
      {
        user: "{{user2}}",
        content: {
          text: "Fetched recent transactions successfully.",
          content: {
            content: [
              {
                activityType: ["Deposit", "Stake"],
                details: {
                  type: "OTHER",
                  detailsDto: {
                    coins: [
                      {
                        amount: 900.00174788,
                        coinType: "0x2::sui::SUI",
                      },
                    ],
                  },
                },
                timestamp: 1737743524190,
              },
              {
                activityType: ["Swap"],
                details: {
                  type: "DEX",
                  detailsDto: {
                    poolId:
                      "0x1de5cc16141c21923bfca33db9bb6c604de5760e4498e75ecdfcf80d62fb5818",
                    sender:
                      "0xdc9d3855fb66bb34abcd4c18338bca6c568b7beaf3870c5dd3f9d3441c2cf11d",
                    securityMessage: null,
                    txHash: "Ck9eXMhMuoFigsgnbqL3CgWs8PnDw1CE6iuZiW2yt32M",
                    coins: [
                      {
                        amount: -4095.527057723,
                        coinType:
                          "0xea65bb5a79ff34ca83e2995f9ff6edd0887b08da9b45bf2e31f930d3efb82866::s::S",
                      },
                      {
                        amount: 9.313302043,
                        coinType: "0x2::sui::SUI",
                      },
                    ],
                  },
                },
                timestamp: 1737743524190,
              },
            ],
          },
        },
      },
    ],
  ] as ActionExample[][],
} as Action;
