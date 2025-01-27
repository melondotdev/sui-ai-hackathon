import {
  IAgentRuntime,
  elizaLogger,
  type HandlerCallback,
  type ActionExample,
} from "@elizaos/core";
import fetch from "node-fetch";

function transformBlockberryData(data: any): string[] {
  if (!data?.content) return [];

  const filtered = data.content.filter((item: any) => item.txStatus === "SUCCESS");
  
  return filtered.map((tx: any) => {
    const activity = Array.isArray(tx.activityType)
      ? tx.activityType.join(",")
      : tx.activityType;

    const timestamp = tx.timestamp;

    // Collect coin changes
    const coins = (tx.details?.detailsDto?.coins ?? []).map((coin: any) => {
      const amt = coin.amount;
      const symbol = coin.symbol || "???";
      return `${amt >= 0 ? "+" : ""}${amt} ${symbol}`;
    });
    
    const coinPart = coins.length ? `(${coins.join(", ")})` : "(no coins)";

    return `${activity} | ${timestamp} | ${coinPart}`;
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
        // You may also lengthen this to ~2-5s to reduce rate-limit hits
        await sleep(2000);
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
  description: "Fetches the recent data of the user's Sui wallet without using Memory or State.",
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
            transactions: [
              "Deposit,Stake | 1737743524190 | (+900.00174788 SUI)",
              "Swap | 1737743524190 | (-4095.527057723 S, +9.313302043 SUI)",
            ],
          },
        },
      },
    ],
  ] as ActionExample[][],
};
