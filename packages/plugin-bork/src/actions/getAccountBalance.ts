import {
  IAgentRuntime,
  elizaLogger,
  type HandlerCallback,
  type ActionExample,
} from "@elizaos/core";
import fetch from "node-fetch";

async function fetchBalanceFromBlockberry(walletAddress: string): Promise<any> {
  const MAX_429_RETRIES = 3; // Maximum retries for 429 responses
  const BASE_WAIT_TIME_MS = 3000; // Initial wait time for exponential backoff
  
  const options = {
    method: "GET",
    headers: {
      accept: "*/*",
      "x-api-key": process.env.BLOCKBERRY_API_KEY ?? "",
    },
  };

  const url = `https://api.blockberry.one/sui/v1/accounts/${walletAddress}/balance`;

  console.log(`Fetching balance for wallet: ${walletAddress}`);

  let attempts = 0;
  let consecutive429Count = 0;

  while (attempts < MAX_429_RETRIES) {
    try {
      const response = await fetch(url, options);

      if (response.status === 429) {
        consecutive429Count++;
        if (consecutive429Count >= MAX_429_RETRIES) {
          console.error("Too many consecutive 429 responses. Stopping requests.");
          return null;
        }

        const waitMs = BASE_WAIT_TIME_MS * 2 ** (consecutive429Count - 1);
        console.warn(`HTTP 429: Too many requests. Retrying in ${waitMs}ms...`);
        await new Promise((resolve) => setTimeout(resolve, waitMs));
        continue; // Retry the request
      } else {
        consecutive429Count = 0; // Reset counter on a successful request
      }

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`HTTP error ${response.status}: ${text}`);
      }

      const balances = await response.json();
      console.log("Fetched balances:", balances);

      return balances;
    } catch (error: any) {
      console.error(`Attempt ${attempts + 1} failed:`, error);

      // Stop retries if the error isn't a 429
      if (error.message.includes("429")) {
        attempts++;
      } else {
        break; // Exit the loop for other errors
      }
    }
  }

  console.error("Max retries reached. Returning null.");
  return null;
}

export default {
  name: "FETCH_WALLET_BALANCES",
  similes: ["GET_BALANCES", "WALLET_BALANCES", "FETCH_BALANCES"],
  description: "Fetches recent Sui wallet balances.",
  validate: async (_runtime: IAgentRuntime, _message: any) => true,
  handler: async (
    runtime: IAgentRuntime,
    message: any,
    _unused: any,
    _options: { [key: string]: unknown },
    callback?: HandlerCallback
  ): Promise<boolean> => {
    elizaLogger.log("Starting FETCH_WALLET_BALANCES...");

    try {
      const walletAddressMatch = message?.content?.text?.match(/0x[a-fA-F0-9]{64}/);
      const walletAddress = walletAddressMatch?.[0] || process.env.DEFAULT_WALLET_ADDRESS;

      if (!walletAddress) {
        elizaLogger.error("No wallet address found.");
        callback?.({ text: "No valid wallet address found.", content: { error: "Missing wallet address" } });
        return false;
      }

      elizaLogger.log(`Using wallet address: ${walletAddress}`);

      // Fetch balances
      const balances = await fetchBalanceFromBlockberry(walletAddress);

      if (!balances) {
        callback?.({
          text: `No balances found for wallet ${walletAddress}.`,
          content: { balances: {} },
        });
        return true;
      }

      // Final response including only balances
      if (callback) {
        const formattedResponse = JSON.stringify({ balances }, null, 2);
        callback({
          text: `Fetched balances for wallet ${walletAddress}:\n\n${formattedResponse}`,
          content: { balances },
        });
      }

      return true;
    } catch (error: any) {
      console.error("Error fetching wallet balances:", error);
      callback?.({ text: `Error fetching wallet balances: ${error.message}`, content: { error: error.message } });
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
          text: "Fetching wallet balances...",
          action: "FETCH_WALLET_BALANCES",
        },
      },
      {
        user: "{{user2}}",
        content: {
          text: "Fetched wallet balances successfully.",
          content: {
            balances: {
              "0x2::sui::SUI": {
                balance: 125.4,
                priceUsd: 1.23,
              },
              "0xea65bb5a79ff34ca83e2995f9ff6edd0887b08da9b45bf2e31f930d3efb82866::s::S": {
                balance: 5000,
                priceUsd: 0.045,
              },
            },
          },
        },
      },
    ],
  ] as ActionExample[][],
};
