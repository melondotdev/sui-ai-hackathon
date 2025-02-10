import {
  ActionExample,
  HandlerCallback,
  IAgentRuntime,
  Memory,
  State,
  elizaLogger,
  type Action,
} from "@elizaos/core";
import { kioskProvider } from "../providers/kiosk";
import {
  fetchLatestPrice,
  fetchMetadataForNFTs,
} from "../utils";

export default {
  name: "GET_NFTS",
  similes: ["FETCH_NFTS", "LIST_NFTS", "SHOW_NFTS", "DISPLAY_NFTS"],
  validate: async (_runtime: IAgentRuntime, message: Memory) => {
    console.log("Validating NFT fetch from user:", message.userId);
    return true;
  },
  description:
    "Fetch all NFTs (with latestPrice, floor price, and metadata imgUrl) from a user-specified kiosk address or fallback",
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State,
    _options: { [key: string]: unknown },
    callback?: HandlerCallback
  ): Promise<boolean> => {
    elizaLogger.log("Starting GET_NFTS handler...");

    // Get the kiosk NFT data.
    const kioskJson = await kioskProvider.get(runtime, message, state);
    if (!kioskJson) {
      callback?.({ text: "Unable to fetch kiosk NFTs information." });
      return false;
    }
    
    // Parse the kiosk data.
    let kioskData;
    try {
      kioskData = JSON.parse(kioskJson);
    } catch (error) {
      console.error("Error parsing kiosk data:", error);
      callback?.({ text: "Error processing kiosk NFTs data." });
      return false;
    }

    // Enrich each NFT with latestPrice and collect collection IDs.
    const collectionIds = new Set<string>();
    for (const kiosk of kioskData.kiosks) {
      for (const item of kiosk.items) {
        item.latestPrice = await fetchLatestPrice(item.objectId);
        collectionIds.add(item.collectionId);
      }
    }
    
    // Collect all NFT object IDs and fetch their metadata.
    const objectIds: string[] = [];
    for (const kiosk of kioskData.kiosks) {
      for (const item of kiosk.items) {
        objectIds.push(item.objectId);
      }
    }
    const metadataData = await fetchMetadataForNFTs(objectIds);
    if (metadataData) {
      for (const kiosk of kioskData.kiosks) {
        for (const item of kiosk.items) {
          item.imgUrl = metadataData[item.objectId]?.imgUrl || null;
        }
      }
    }
    
    // Save the enriched data to state and return via callback.
    state.kioskInfo = kioskData;
    callback?.({
      text: `Fetched NFTs: ${JSON.stringify(kioskData, null, 2)}`,
      content: { kioskInfo: kioskData },
    });
    return true;
  },

  examples: [
    [
      {
        user: "{{user1}}",
        content: {
          text: "Show me all NFTs for 0x4f2e63be8e7fe287836e29cde6f3d5cbc96eefd0c0e3f3747668faa2ae7324b0",
        },
      },
      {
        user: "{{user2}}",
        content: {
          text: "Fetching your NFTs...",
          action: "GET_NFTS",
        },
      },
      {
        user: "{{user2}}",
        content: {
          text: "Here are your NFTs: [NFT details in JSON]",
        },
      },
    ],
  ] as ActionExample[][],
} as Action;
