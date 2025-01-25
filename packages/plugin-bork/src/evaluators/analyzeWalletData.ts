/**
 * Analyzes the fetched transactions to infer wallet behavior.
 * @param transactions Array of transaction objects from `fetchWalletData`.
 * @returns An analysis object with a description, heuristic evaluation, and raw data.
 */
const analyzeWalletData = (transactions: any[]): { summary: string; insights: any[] } => {
  if (transactions.length === 0) {
      return {
          summary: "No transactions found for this wallet.",
          insights: [],
      };
  }

  const insights: any[] = [];
  let totalTransfers = 0;
  let highValueTransactions = 0;
  const highValueThreshold = 1000; // Adjust threshold for what you consider "high value"

  transactions.forEach((transaction) => {
      const { timestamp, details } = transaction;

      // Example: Count high-value transactions
      if (details.amount && parseFloat(details.amount) > highValueThreshold) {
          highValueTransactions++;
      }

      // Example: Count total transfers
      if (details.type === "transfer") {
          totalTransfers++;
      }

      // Push a general insight for each transaction
      insights.push({
          timestamp,
          detailSummary: `Transaction of type ${details.type} with value ${details.amount || "unknown"}`,
      });
  });

  // Generate a summary based on the analysis
  let summary = `This wallet has ${transactions.length} recent transactions. `;
  if (highValueTransactions > 0) {
      summary += `It contains ${highValueTransactions} high-value transactions (>$${highValueThreshold}). `;
  }
  summary += `There are ${totalTransfers} transfers in total.`;

  return {
      summary,
      insights,
  };
};

export default analyzeWalletData;
