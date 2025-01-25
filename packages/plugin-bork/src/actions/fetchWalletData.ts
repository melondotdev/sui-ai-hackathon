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

const fetchTransactionsFromBlockchain = async (
  walletAddress: string,
  afterCursor: string | null = null
): Promise<any[]> => {
  let hasNextPage = true;
  let endCursor = afterCursor;
  const transactions = [];

  while (hasNextPage) {
      const query = `query {
          events(
              first: 10
              after: ${endCursor ? `"${endCursor}"` : "null"}
              filter: {
                  emittingModule: "${walletAddress}"
              }
          ) {
              pageInfo {
                  hasNextPage
                  endCursor
              }
              nodes {
                  timestamp
                  json
              }
          }
      }`;

      try {
          const response = await fetch("https://sui-mainnet.mystenlabs.com/graphql", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ query }),
          });

          if (!response.ok) {
              throw new Error(`Failed to fetch data: ${response.statusText}`);
          }

          const jsonData = await response.json();
          const nodes = jsonData.data.events.nodes;

          transactions.push(
              ...nodes.map((node: any) => ({
                  timestamp: node.timestamp,
                  details: node.json,
              }))
          );

          hasNextPage = jsonData.data.events.pageInfo.hasNextPage;
          endCursor = jsonData.data.events.pageInfo.endCursor;
      } catch (error) {
          console.error("Error fetching transactions from blockchain:", error);
          hasNextPage = false;
      }
  }

  return transactions;
};

export default {
  name: "FETCH_WALLET_DATA",
  similes: ["GET_TRANSACTIONS", "WALLET_TRANSACTIONS", "FETCH_TRANSACTIONS"],
  description: "Fetches the recent transactions of the user's Sui wallet.",
  validate: async (_runtime: IAgentRuntime, _message: Memory) => {
      // Add any necessary validation logic, if required.
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
          const walletAddress = runtime.getSetting("WALLET_ADDRESS");

          if (!walletAddress) {
              if (callback) {
                  callback({
                      text: "Wallet address not configured. Please set a valid wallet address to fetch transactions.",
                      content: { error: "No wallet address" },
                  });
              }
              return false;
          }

          const transactions = await fetchTransactionsFromBlockchain(walletAddress);

          if (transactions.length === 0) {
              if (callback) {
                  callback({
                      text: `No recent transactions found for wallet ${walletAddress}.`,
                      content: { transactions: [] },
                  });
              }
              return true;
          }

          if (callback) {
              callback({
                  text: `Fetched recent transactions for wallet ${walletAddress}.`,
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
              content: { text: "Fetch my wallet transactions." },
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
                          { timestamp: "2025-01-01T00:00:00Z", details: { type: "transfer", amount: "10" } },
                          { timestamp: "2025-01-01T00:01:00Z", details: { type: "mint", amount: "5" } }
                      ]
                  },
              },
          },
      ],
  ] as ActionExample[][],
} as Action;