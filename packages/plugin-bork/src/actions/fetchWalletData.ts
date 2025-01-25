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

const fetchTransactionsFromBlockberry = async (
  walletAddress: string
): Promise<any[]> => {
  const options = {
    method: 'GET',
    headers: { accept: '*/*', 'x-api-key': process.env.BLOCKBERRY_API_KEY },
  };

  // let hasNextPage = true;
  const transactions = [];
  let nextCursor = null;

  // while (hasNextPage) {
    try {
      // Ensure cursor comes before size in the query parameters
      const url = `https://api.blockberry.one/sui/v1/accounts/${walletAddress}/activity?${
        nextCursor ? `nextCursor=${nextCursor}&` : ''
      }size=10&orderBy=DESC`;
      
      const response = await fetch(url, options);

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`HTTP error ${response.status}: ${text}`);
      }

      const data = await response.json();

      if (data.content) {
        transactions.push(
          ...data.content.map((transaction: any) => ({
            timestamp: new Date(transaction.timestamp).toISOString(),
            type: transaction.activityType.join(", "),
            amount: transaction.details.detailsDto.coins.length > 0
              ? transaction.details.detailsDto.coins[0].amount
              : null,
            coinType: transaction.details.detailsDto.coins.length > 0
              ? transaction.details.detailsDto.coins[0].coinType
              : null,
            digest: transaction.digest,
            status: transaction.txStatus,
            gasFee: transaction.gasFee,
          }))
        );
      }
      
      // hasNextPage = data.hasNextPage;
      nextCursor = data.nextCursor; // Update the cursor for the next request
    } catch (error) {
      console.error("Error fetching transactions from blockchain:", error);
      if (error.message.includes("Too many requests")) {
        throw new Error("Rate limit exceeded. Please try again later.");
      }
      // hasNextPage = false; // Stop fetching if an error occurs
    }
  // }

  return transactions;
};

// const fetchTransactionsFromMysten = async (
//   walletAddress: string
// ): Promise<any[]> => {
//   const options = {
//     method: 'GET',
//     headers: { accept: '*/*', 'x-api-key': process.env.BLOCKBERRY_API_KEY },
//   };
  
//   let hasNextPage = true;
//   const transactions = [];
//   let nextCursor = null;

//   while (hasNextPage) {
//     try {
//       // Ensure cursor comes before size in the query parameters
//       const url = `https://api.blockberry.one/sui/v1/accounts/${walletAddress}/activity?${
//         nextCursor ? `nextCursor=${nextCursor}&` : ''
//       }size=2&orderBy=DESC`;

//       const response = await fetch(url, options);

//       if (!response.ok) {
//         const text = await response.text();
//         throw new Error(`HTTP error ${response.status}: ${text}`);
//       }

//       const data = await response.json();

//       if (data.content) {
//         transactions.push(
//           ...data.content.map((transaction: any) => ({
//             timestamp: new Date(transaction.timestamp).toISOString(),
//             type: transaction.activityType.join(", "),
//             amount: transaction.details.detailsDto.coins.length > 0
//               ? transaction.details.detailsDto.coins[0].amount
//               : null,
//             coinType: transaction.details.detailsDto.coins.length > 0
//               ? transaction.details.detailsDto.coins[0].coinType
//               : null,
//             digest: transaction.digest,
//             status: transaction.txStatus,
//             gasFee: transaction.gasFee,
//           }))
//         );
//       }

//       hasNextPage = data.hasNextPage;
//       nextCursor = data.nextCursor; // Update the cursor for the next request
//     } catch (error) {
//       console.error("Error fetching transactions from blockchain:", error);
//       if (error.message.includes("Too many requests")) {
//         throw new Error("Rate limit exceeded. Please try again later.");
//       }
//       hasNextPage = false; // Stop fetching if an error occurs
//     }
//   }

//   return transactions;
// };

export default {
  name: "FETCH_WALLET_DATA",
  similes: ["GET_TRANSACTIONS", "WALLET_TRANSACTIONS", "FETCH_TRANSACTIONS"],
  description: "Fetches the recent transactions of the user's Sui wallet.",
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
      const walletAddressMatch = message.content.text?.match(/0x[a-fA-F0-9]{64}/);
      const walletAddress = walletAddressMatch?.[0] || runtime.getSetting("WALLET_ADDRESS");

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
            text: `No recent transactions found for wallet ${walletAddress}.`,
            content: { transactions: [] },
          });
        }
        return true;
      }

      const formattedTransactions = transactions
        .map((tx, index) => {
          const type = tx.type || "Unknown";
          const amount = tx.amount !== null ? tx.amount : "N/A";
          const coinType = tx.coinType || "N/A";
          const gasFee = tx.gasFee || "N/A";
          const timestamp = tx.timestamp || "N/A";
          const digest = tx.digest || "N/A";
          const status = tx.status || "N/A";

          return `#${index + 1}
  **Type**: ${type}
  **Amount**: ${amount}
  **Coin Type**: ${coinType}
  **Gas Fee**: ${gasFee}
  **Timestamp**: ${timestamp}
  **Digest**: ${digest}
  **Status**: ${status}`;
        })
        .join("\n\n");

      if (callback) {
        callback({
          text: `Fetched recent transactions for wallet ${walletAddress}:\n\n${formattedTransactions}`,
          content: { transactions },
        });
      }

      return true;
    } catch (error) {
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
        content: { text: "Fetch transactions for wallet 0x02a212de6a9dfa3a69e22387acfbafbb1a9e591bd9d636e7895dcfc8de05f331." },
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
              { timestamp: "2025-01-01T00:00:00Z", type: "Send", amount: -900.00174788, coinType: "0x2::sui::SUI", digest: "XYZGiNy5hnkxDt7peZ2ywXsazQX7ZAxVKD1BNVbFSmR", status: "SUCCESS", gasFee: 0.00174788 },
              { timestamp: "2025-01-01T00:01:00Z", type: "Stake", amount: null, coinType: null, digest: "D5mVj1f3TTHizZ9RLVKsCdoRqWwrpn87BGwTPXxsJvNW", status: "SUCCESS", gasFee: 0 }
            ],
          },
        },
      },
    ],
  ] as ActionExample[][],
} as Action;

