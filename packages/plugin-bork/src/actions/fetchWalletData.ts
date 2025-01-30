import {
  IAgentRuntime,
  elizaLogger,
  type HandlerCallback,
  type ActionExample,
} from "@elizaos/core";
import fetch from "node-fetch";

function transformBlockberryData(data: any): any[] {
  if (!data?.content) return [];

  // Filter out transactions that are not "SUCCESS" or lack coins and NFT data
  const filtered = data.content.filter((tx: any) => {
    if (tx.txStatus !== "SUCCESS") {
      return false;
    }

    const hasCoins = (tx.details?.detailsDto?.coins?.length ?? 0) > 0;
    const isNFT =
      tx.details?.type === "NFT" && !!tx.details?.detailsDto?.nftType;

    return hasCoins || isNFT;
  });

  // Transform transactions into the required JSON format
  return filtered.map((tx: any) => {
    const activity = Array.isArray(tx.activityType)
      ? tx.activityType
      : [tx.activityType];

    const timestamp = tx.timestamp;

    // Handle NFT data (prioritized over coins)
    if (tx.details?.type === "NFT" && tx.details?.detailsDto?.nftType) {
      return {
        type: activity,
        timestamp: timestamp,
        coinType: [tx.details.detailsDto.nftType],
        amount: [tx.details.detailsDto.price ?? 0],
      };
    }

    // Handle coin data (if no NFT data exists)
    const coinTypes: string[] = [];
    const amounts: number[] = [];

    (tx.details?.detailsDto?.coins ?? []).forEach((coin: any) => {
      if (coin && coin.coinType && coin.amount !== undefined) {
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

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

  while (hasNextPage) {
    const url = `https://api.blockberry.one/sui/v1/accounts/${walletAddress}/activity?${
      nextCursor ? `nextCursor=${nextCursor}&` : ""
    }size=10&orderBy=DESC`;

    console.log("Fetching URL:", url);

    try {
      const response = await fetch(url, options);

      if (response.status === 429) {
        consecutive429Count++;
        // Check if we've retried enough times
        if (consecutive429Count >= MAX_429_RETRIES) {
          console.error("Too many 429s in a row. Stopping requests.");
          break;
        }
        // Exponential backoff: 3s -> 6s -> 12s -> ...
        const waitMs = 3000 * 2 ** (consecutive429Count - 1);
        console.warn(`HTTP 429: Too many requests. Waiting ${waitMs}ms...`);
        await sleep(waitMs);
        continue;
      } else {
        // Reset counter if not a 429
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

      console.log("Fetched batch. hasNextPage:", hasNextPage, "nextCursor:", nextCursor);

      if (hasNextPage) {
        await sleep(1500);
      }
    } catch (error: any) {
      console.error("Error fetching transactions from blockchain:", error);

      // If the error text includes "Too many requests", do a longer delay or stop
      if (typeof error.message === "string" && error.message.includes("Too many requests")) {
        console.error("Rate limit exceeded. Stopping further requests.");
        break;
      }
      hasNextPage = false;
    }
  }

  return transactions;
}

/**
 * A simplified Action that does NOT require Memory or State
 */
export default {
  name: "FETCH_WALLET_DATA",
  similes: ["GET_DATA", "WALLET_DATA", "FETCH_DATA"],
  description: "Fetches the recent data of the user's Sui wallet without using Memory or State and returns it as a simplified json.",
  validate: async (_runtime: IAgentRuntime, _message: any) => {
    // We can simply return true, or do a minimal check if you like.
    return true;
  },
  handler: async (
    runtime: IAgentRuntime,
    message: any, // changed from Memory
    _unused: any, // ignoring State
    _options: { [key: string]: unknown },
    callback?: HandlerCallback
  ): Promise<boolean> => {
    elizaLogger.log("Starting FETCH_WALLET_DATA (no Memory/State) handler...");

    try {
      // 1) Extract wallet address via regex from message.content.text
      const walletAddressMatch =
        message?.content?.text?.match(/0x[a-fA-F0-9]{64}/);
      const walletAddress =
        walletAddressMatch?.[0] || process.env.DEFAULT_WALLET_ADDRESS; // fallback
      
      if (!walletAddress) {
        elizaLogger.error("No wallet address found.");
        if (callback) {
          callback({
            text: "No valid wallet address found in request.",
            content: { error: "Missing wallet address" },
          });
        }
        return false;
      }

      elizaLogger.log(`Using wallet address: ${walletAddress}`);

      // 2) Fetch transaction data
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

      // 3) Return final result
      if (callback) {
        const formattedTransactions = JSON.stringify(transactions, null, 2);
        callback({
          text: `Fetched recent (SUCCESS) transactions for wallet ${walletAddress} as a json:\n\n${formattedTransactions}`,
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
            transactions: [
              {
                "type": [
                  "Deposit",
                  "Stake"
                ],
                "timestamp": 1737743524190,
                "coinType": [
                  "0x2::sui::SUI"
                ],
                "amount": [
                  900.00174788
                ],
              },
              {
                "type": [
                  "Swap"
                ],
                "timestamp": 1737743524190,
                "coinType": [
                  "0xea65bb5a79ff34ca83e2995f9ff6edd0887b08da9b45bf2e31f930d3efb82866::s::S",
                  "0x2::sui::SUI"
                ],
                "amount": [
                  -4095.527057723,
                  9.313302043
                ],
              },
            ],
          },
        },
      },
    ],
  ] as ActionExample[][],
};
