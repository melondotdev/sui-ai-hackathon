import {
  ActionExample,
  HandlerCallback,
  IAgentRuntime,
  Memory,
  State,
  elizaLogger,
  type Action,
} from "@elizaos/core";

interface CoinStats {
  [activityType: string]: {
    [coinType: string]: number;
  };
}

interface NFTActivityStats {
  totalPrice: number;
  count: number;
  [nftType: string]: any;
}

interface NFTStats {
  [activityType: string]: NFTActivityStats;
}

interface BehaviorStats {
  amountsByActivity: CoinStats;
  nftsByActivity: NFTStats;
}

function initBehaviorStats(): BehaviorStats {
  return {
    amountsByActivity: {},
    nftsByActivity: {},
  };
}

function isNFTTransaction(tx: any): boolean {
  if (tx.details?.type === "NFT") {
    return true;
  }
  const eventType = tx.details?.detailsDto?.eventType || "";
  return !!eventType;
}

function getNFTPrice(tx: any): number {
  return tx.details?.detailsDto?.price ?? 0;
}

function getNFTType(tx: any): string | null {
  return tx.details?.detailsDto?.nftType || null;
}

function getCoinsArray(tx: any): Array<{ amount: number; coinType: string }> {
  return tx.details?.detailsDto?.coins || [];
}

function analyzeTransactions(rawTxs: any[]): BehaviorStats {
  const stats = initBehaviorStats();

  for (const raw of rawTxs) {
    const activityArr = raw.activityType || [];
    if (!Array.isArray(activityArr)) {
      continue;
    }

    const isNFT = isNFTTransaction(raw);

    if (isNFT) {
      const price = getNFTPrice(raw);
      const nftType = getNFTType(raw);
      for (const activityType of activityArr) {
        if (!stats.nftsByActivity[activityType]) {
          stats.nftsByActivity[activityType] = {
            totalPrice: 0,
            count: 0,
          };
        }
        stats.nftsByActivity[activityType].count += 1;
        if (price) {
          stats.nftsByActivity[activityType].totalPrice += price;
        }
        if (nftType) {
          if (!stats.nftsByActivity[activityType][nftType]) {
            stats.nftsByActivity[activityType][nftType] = 0;
          }
          stats.nftsByActivity[activityType][nftType] += 1;
        }
      }
    } else {
      const coins = getCoinsArray(raw);
      for (const activityType of activityArr) {
        if (!stats.amountsByActivity[activityType]) {
          stats.amountsByActivity[activityType] = {};
        }
        for (const c of coins) {
          const ct = c.coinType || "unknown";
          if (stats.amountsByActivity[activityType][ct] === undefined) {
            stats.amountsByActivity[activityType][ct] = 0;
          }
          stats.amountsByActivity[activityType][ct] += c.amount;
        }
      }
    }
  }

  return stats;
}

async function fetchTransactions(walletAddress: string): Promise<any[]> {
  const options = {
    method: "GET",
    headers: { accept: "*/*", "x-api-key": process.env.BLOCKBERRY_API_KEY },
  };

  let transactions: any[] = [];
  let nextCursor: string | null = null;
  let hasNextPage = true;

  // while (hasNextPage) {
    try {
      const url = `https://api.blockberry.one/sui/v1/accounts/${walletAddress}/activity?${
        nextCursor ? `nextCursor=${nextCursor}&` : ""
      }size=20&orderBy=DESC`;

      const response = await fetch(url, options);
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`HTTP error ${response.status}: ${text}`);
      }

      const data = await response.json();

      if (data.content) {
        transactions.push(
          ...data.content.map((transaction: any) => {
            // Safely optional-chain each property
            const coinsArray = transaction.details?.detailsDto?.coins || [];
            const firstCoin = coinsArray.length > 0 ? coinsArray[0] : null;
            
            return {
              timestamp: new Date(transaction.timestamp).toISOString(),
              type: Array.isArray(transaction.activityType)
                ? transaction.activityType.join(", ")
                : String(transaction.activityType ?? "Unknown"),
              amount: firstCoin ? firstCoin.amount : null,
              coinType: firstCoin ? firstCoin.coinType : null,
              digest: transaction.digest,
              status: transaction.txStatus,
              gasFee: transaction.gasFee,
            };
          })
        );        
      }
      
      hasNextPage = data.hasNextPage;
      nextCursor = data.nextCursor || null;
      console.log(hasNextPage)
    } catch (error) {
      console.error("Error fetching transactions:", error.message);
      throw error;
    }
  // }

  return transactions;
}

export default {
  name: "ANALYZE_WALLET_DATA",
  similes: ["ANALYZE_TRANSACTIONS", "ANALYZE_NFT", "AGGREGATE_COINS"],
  description:
    "Fetches the user's transactions from BlockBerry and aggregates them by activity type, distinguishing NFT vs. coins.",
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
    elizaLogger.log("Starting ANALYZE_WALLET_DATA handler...");

    try {
      const walletAddressMatch = message.content.text?.match(/0x[a-fA-F0-9]{64}/);
      const walletAddress = walletAddressMatch?.[0] || runtime.getSetting("WALLET_ADDRESS");

      if (!walletAddress) {
        const errorMsg = "No valid wallet address found in your request.";
        elizaLogger.error(errorMsg);
        callback?.({
          text: errorMsg,
          content: { error: errorMsg },
        });
        return false;
      }

      elizaLogger.log(`Fetching transactions for wallet: ${walletAddress}`);
      const rawTransactions = await fetchTransactions(walletAddress);

      if (!rawTransactions.length) {
        const msg = `No recent transactions found for wallet ${walletAddress}.`;
        callback?.({ text: msg, content: { transactions: [] } });
        return true;
      }

      const stats = analyzeTransactions(rawTransactions);

      let summary = `**Non-NFT Amounts**:\n`;
      for (const [activityType, coinMap] of Object.entries(stats.amountsByActivity)) {
        summary += `- **${activityType}**:\n`;
        for (const [coinType, sumAmt] of Object.entries(coinMap)) {
          summary += `   - ${coinType}: ${sumAmt}\n`;
        }
      }

      summary += `\n**NFT Activities**:\n`;
      for (const [activityType, data] of Object.entries(stats.nftsByActivity)) {
        summary += `- **${activityType}**: count=${data.count}, totalPrice=${data.totalPrice}\n`;
      }

      callback?.({
        text: `Analysis for wallet ${walletAddress}:\n\n${summary}`,
        content: {
          stats,
          rawTransactions,
        },
      });

      return true;
    } catch (error: any) {
      console.error("Error in ANALYZE_WALLET_DATA:", error);
      callback?.({
        text: `Error analyzing wallet data: ${error.message}`,
        content: { error: error.message },
      });
      return false;
    }
  },
  examples: [
    [
      {
        user: "Alice",
        content: { text: "Analyze wallet 0xdc9d3855fb66bb34abcd4c18338bca6c568b7beaf3870c5dd3f9d3441c2cf11d" },
      },
      {
        user: "Bot",
        content: { text: "Analyzing transactions now...", action: "ANALYZE_WALLET_DATA" },
      },
      {
        user: "Bot",
        content: {
          text: "Analysis for wallet 0xdc9d3...\n\n**Non-NFT Amounts**:\n- Supply:\n   - 0x2::sui::SUI: -295\n...",
          content: {
            stats: {
              amountsByActivity: {
                Supply: { "0x2::sui::SUI": -295 },
              },
              nftsByActivity: {
                "Collection Bid Close": {
                  totalPrice: 142.69,
                  count: 1,
                  "0x034c162f6b59...": 1,
                },
              },
            },
          },
        },
      },
    ],
  ] as ActionExample[][],
} as Action;
