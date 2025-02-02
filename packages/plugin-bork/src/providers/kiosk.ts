// kiosk.ts
import {
  IAgentRuntime,
  ICacheManager,
  Memory,
  Provider,
  State,
} from "@elizaos/core";
import { KioskClient } from "@mysten/kiosk";
import { getFullnodeUrl, SuiClient } from "@mysten/sui/client";
import NodeCache from "node-cache";
import * as path from "path";

interface KioskNFT {
  objectId: string;
  type: string;
  isLocked: boolean;
  kioskId: string;
  listing?: any;
  data: any;
  // These properties will be filled in later by the blockberry functions
  latestPrice?: number | null;
  floorPrice?: number | null;
}

interface KioskContent {
  items: KioskNFT[];
  itemIds: string[];
  listingIds: string[];
  extensions: any[];
  kiosk: any;
}

type SuiNetwork = "mainnet" | "testnet" | "devnet" | "localnet";

export class KioskProvider {
  private cache: NodeCache;
  private cacheKey = "sui/kiosk";

  constructor(
    private kioskClient: KioskClient,
    private cacheManager: ICacheManager
  ) {
    this.cache = new NodeCache({ stdTTL: 300 }); // Cache TTL set to 5 minutes
  }

  private async readFromCache<T>(key: string): Promise<T | null> {
    const cached = await this.cacheManager.get<T>(path.join(this.cacheKey, key));
    return cached;
  }

  private async writeToCache<T>(key: string, data: T): Promise<void> {
    await this.cacheManager.set(path.join(this.cacheKey, key), data, {
      expires: Date.now() + 5 * 60 * 1000,
    });
  }

  private async getCachedData<T>(key: string): Promise<T | null> {
    const cachedData = this.cache.get<T>(key);
    if (cachedData) return cachedData;
    const fileCachedData = await this.readFromCache<T>(key);
    if (fileCachedData) {
      this.cache.set(key, fileCachedData);
      return fileCachedData;
    }
    return null;
  }

  private async setCachedData<T>(cacheKey: string, data: T): Promise<void> {
    this.cache.set(cacheKey, data);
    await this.writeToCache(cacheKey, data);
  }
  
  /**
   * Fetch kiosk NFTs for a specified wallet address.
   * (No blockberry enrichment happens here.)
   */
  async fetchKioskNFTs(address: string): Promise<KioskContent[]> {
    try {
      const cacheKey = `kiosk-nfts-${address}`;
      const cachedValue = await this.getCachedData<KioskContent[]>(cacheKey);
      if (cachedValue) {
        console.log("Cache hit for fetchKioskNFTs", cachedValue);
        return cachedValue;
      }
      console.log("Cache miss for fetchKioskNFTs");

      // Query all kioskIds owned by this wallet address.
      const { kioskIds } = await this.kioskClient.getOwnedKiosks({ address });

      const kioskContents = await Promise.all(
        kioskIds.map(async (kioskId) => {
          const res = await this.kioskClient.getKiosk({
            id: kioskId,
            options: { withListingPrices: true },
          });
          // Map items without blockberry enrichment.
          const items = res.items.map((item) => ({
            objectId: item.objectId,
            type: item.type,
            isLocked: item.isLocked,
            kioskId: item.kioskId,
            listing: item.listing,
            data: item.data || {},
            latestPrice: null,
            floorPrice: null,
          }));
          return { ...res, items, kiosk: res.kiosk || {} };
        })
      );

      await this.setCachedData(cacheKey, kioskContents);
      console.log("Fetched kiosk NFTs:", kioskContents);
      return kioskContents;
    } catch (error) {
      console.error("Error fetching kiosk NFTs:", error);
      throw error;
    }
  }

  /**
   * Format the kiosk NFTs as JSON.
   * (The blockberry price values will be null at this point.)
   */
  formatKioskNFTs(
    runtime: IAgentRuntime,
    address: string,
    kioskContents: KioskContent[],
    floorPrice: number | null
  ): string {
    const output = {
      walletAddress: address,
      kiosks: kioskContents.map((kioskContent, index) => ({
        kioskIndex: index + 1,
        items: kioskContent.items.map((item) => ({
          objectId: item.objectId,
          collectionId: item.type,
          latestPrice: item.latestPrice,
          floorPrice: floorPrice,
        })),
      })),
    };
    return JSON.stringify(output, null, 2);
  }

  /**
   * Get a formatted JSON string of all kiosk NFTs for a given wallet address.
   * (Blockberry price enrichment is handled later.)
   */
  async getFormattedKioskNFTs(
    runtime: IAgentRuntime,
    address: string
  ): Promise<string> {
    try {
      const kioskContents = await this.fetchKioskNFTs(address);
      // Since we are not enriching prices here, pass null as floorPrice.
      return this.formatKioskNFTs(runtime, address, kioskContents, null);
    } catch (error) {
      console.error("Error generating kiosk NFTs report:", error);
      return "Unable to fetch kiosk NFTs information. Please try again later.";
    }
  }
}

/**
 * kioskProvider implementing the Provider interface.
 */
const kioskProvider: Provider = {
  get: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state?: State
  ): Promise<string | null> => {
    try {
      const text = message?.content?.text ?? "";
      // Look for an address of the form 0x followed by 64 hex characters.
      const match = text.match(/0x[a-fA-F0-9]{64}/);
      const fallbackAddress = runtime.getSetting("DEFAULT_SUI_ADDRESS") as string;
      const address = match?.[0] || fallbackAddress;

      if (!address) {
        console.error("No valid wallet address found.");
        return "No valid wallet address found.";
      }
      
      const suiClient = new SuiClient({
        url: getFullnodeUrl(runtime.getSetting("SUI_NETWORK") as SuiNetwork),
      });
      const kioskClient = new KioskClient({
        client: suiClient,
        network: runtime.getSetting("SUI_NETWORK") as any,
      });

      const provider = new KioskProvider(kioskClient, runtime.cacheManager);
      const result = await provider.getFormattedKioskNFTs(runtime, address);
      return result;
    } catch (error) {
      console.error("Error in kiosk provider:", error);
      return null;
    }
  },
};

export { kioskProvider };
