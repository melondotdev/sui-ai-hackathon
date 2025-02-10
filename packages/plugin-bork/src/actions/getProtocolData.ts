import {
  IAgentRuntime,
  elizaLogger,
  type HandlerCallback,
  type ActionExample,
} from "@elizaos/core";
import fetch from "node-fetch";

async function fetchDexProtocols(): Promise<any[]> {
  const url = "https://api.llama.fi/protocols";
  elizaLogger.log("Fetching protocols from:", url);

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Error fetching DEX protocols: ${response.status}`);
    }
    const data = await response.json();
    return data;
  } catch (error) {
    elizaLogger.error("Error in fetchDexProtocols:", error);
    return [];
  }
}

export default {
  name: "GET_PROTOCOL_DATA",
  similes: ["PROTOCOL_DATA", "GET_DEFI_DATA", "FETCH_DEX_PROTOCOLS"],
  description:
    "Fetches decentralized exchange protocols from Defi Llama for a specified blockchain.",
  validate: async (_runtime: IAgentRuntime, _message: any) => true,
  handler: async (
    runtime: IAgentRuntime,
    message: any,
    _unused: any,
    _options: { [key: string]: unknown },
    callback?: HandlerCallback
  ): Promise<boolean> => {
    elizaLogger.log("Starting GET_PROTOCOL_DATA...");

    try {
      // Determine the chain from the message.
      // First, check if the message content has an explicit 'chain' property.
      let chain: string =
        message?.content?.chain ||
        // Alternatively, try to extract a chain from the text using regex.
        (message?.content?.text?.match(/\b(sui|solana|ethereum|binance|polygon)\b/i)?.[0] as string) ||
        "sui"; // default chain

      chain = chain.toLowerCase();
      elizaLogger.log(`Fetching protocols for chain: ${chain}`);

      // Fetch all protocols from Defi Llama.
      const protocols = await fetchDexProtocols();

      // Filter protocols based on the chain.
      // Some protocols have a single chain in `chain` while others have an array in `chains`.
      const filteredProtocols = protocols.filter((protocol: any) => {
        const protocolChain = (protocol.chain || "").toLowerCase();
        const protocolChains: string[] = (protocol.chains || []).map((c: string) =>
          c.toLowerCase()
        );
        return protocolChain === chain || protocolChains.includes(chain);
      });
      
      // Prepare the summarized response.
      const summary = {
        chain,
        totalProtocols: filteredProtocols.length,
        protocols: filteredProtocols.map((protocol: any) => ({
          name: protocol.name,
          url: protocol.url,
          description: protocol.description,
          tvl: protocol.tvl,
          slug: protocol.slug,
          logoUrl: protocol.logo,
          change_1h: protocol.change_1h,
          change_1d: protocol.change_1d,
          change_7d: protocol.change_7d,
        })),
      };

      if (callback) {
        callback({
          text: `Fetched ${filteredProtocols.length} protocols for chain "${chain}".`,
          content: summary,
        });
        console.log("Full callback response:", summary);        
      }
      return true;
    } catch (error: any) {
      elizaLogger.error("Error fetching dex data:", error);
      callback?.({
        text: `Error fetching dex data: ${error.message}`,
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
          text: "Get protocol data for chain Sui",
          chain: "Sui",
        },
      },
      {
        user: "{{user2}}",
        content: {
          text: "Fetching PROTOCOL protocol data...",
          action: "GET_PROTOCOL_DATA",
        },
      },
      {
        user: "{{user2}}",
        content: {
          text: "Fetched PROTOCOL data successfully.",
          content: {
            chain: "sui",
            totalProtocols: 10,
            protocols: [
              {
                name: "Kriya Strats",
                url: "https://app.kriya.finance/strategies",
                description:
                  "Vaults that provide retail investors tokenized access to sophisticated DeFi strategies such as leverage lending, reward auto-compounding and CLMM LP management",
                logo: "https://icons.llama.fi/kriya-strats.png",
                slug: "kriya-strats",
                tvl: 4305282.216298877,
                change_1h: -2.275015366924876,
                change_1d: 11.863464863460592,
                change_7d: -18.757762218171834,
              },
            ],
          },
        },
      },
    ],
  ] as ActionExample[][],
};
