import { IAgentRuntime } from "@elizaos/core";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import fetch from "node-fetch";

/**
 * parseAccount returns an Ed25519Keypair based on the runtime settings.
 */
const parseAccount = (runtime: IAgentRuntime): Ed25519Keypair => {
  const privateKey = runtime.getSetting("SUI_PRIVATE_KEY");
  if (!privateKey) {
    throw new Error("SUI_PRIVATE_KEY is not set");
  } else if (privateKey.startsWith("suiprivkey")) {
    return Ed25519Keypair.fromSecretKey(privateKey);
  } else {
    return Ed25519Keypair.deriveKeypairFromSeed(privateKey);
  }
};

/**
 * Retries a fetch call with exponential backoff.
 */
export async function fetchWithRetry(
  url: string,
  options: any,
  maxRetries = 4,
  initialDelay = 3000
): Promise<Response | null> {
  let delay = initialDelay;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const res = await fetch(url, options);
      if (res.ok) {
        return res as any;
      } else {
        console.error(
          `Attempt ${attempt + 1} for ${url} failed with status: ${res.status}`
        );
      }
    } catch (error) {
      console.error(
        `Attempt ${attempt + 1} for ${url} threw an error:`,
        error
      );
    }
    if (attempt < maxRetries - 1) {
      await new Promise((resolve) => setTimeout(resolve, delay));
      delay *= 2;
    }
  }
  return null;
}

/**
 * Fetch the latestPrice for an NFT using its objectId.
 */
export async function fetchLatestPrice(objectId: string): Promise<number | null> {
  const options = {
    method: "GET",
    headers: {
      accept: "*/*",
      "x-api-key": process.env.BLOCKBERRY_API_KEY || "",
    },
  };
  const url = `https://api.blockberry.one/sui/v1/nfts/${objectId}`;
  const res = await fetchWithRetry(url, options);
  if (!res) {
    console.error(`All retry attempts failed for ${objectId}`);
    return null;
  }
  try {
    const data = await res.json();
    return data.latestPrice ?? null;
  } catch (error) {
    console.error(`Error parsing response for ${objectId}:`, error);
    return null;
  }
}

/**
 * Fetch the floor price for a given collection.
 */
export async function fetchFloorPrice(collectionId: string): Promise<number | null> {
  const options = {
    method: "POST",
    headers: {
      accept: "*/*",
      "content-type": "application/json",
      "x-api-key": process.env.BLOCKBERRY_API_KEY || "",
    },
    body: JSON.stringify({
      eventTypes: ["List"],
      marketplaces: ["BlueMove", "TradePort", "Hyperspace"],
    }),
  };
  const collectionIdEncoded = encodeURIComponent(collectionId);
  const url = `https://api.blockberry.one/sui/v1/events/collection/${collectionIdEncoded}?page=0&size=20&orderBy=DESC&sortBy=AGE`;
  const res = await fetchWithRetry(url, options);
  if (!res) {
    console.error(`All retry attempts failed for floor price of collection ${collectionId}`);
    return null;
  }
  try {
    const data = await res.json();
    if (!data.content || data.content.length === 0) return null;
    const prices = data.content
      .filter((event: any) => typeof event.latestPrice === "number")
      .map((event: any) => event.latestPrice);
    if (prices.length === 0) return null;
    return Math.min(...prices);
  } catch (err) {
    console.error(`Error parsing floor price for ${collectionId}:`, err);
    return null;
  }
}

/**
 * Fetch metadata (e.g., imgUrl) for a list of NFT object IDs.
 */
export async function fetchMetadataForNFTs(objectIds: string[]): Promise<any | null> {
  const options = {
    method: "POST",
    headers: {
      accept: "*/*",
      "content-type": "application/json",
      "x-api-key": process.env.BLOCKBERRY_API_KEY || "",
    },
    body: JSON.stringify({ hashes: objectIds }),
  };
  const url = "https://api.blockberry.one/sui/v1/metadata/objects";
  const res = await fetchWithRetry(url, options);
  if (!res) {
    console.error("All retry attempts failed for metadata.");
    return null;
  }
  try {
    const metadataData = await res.json();
    return metadataData;
  } catch (error) {
    console.error("Error parsing metadata response:", error);
    return null;
  }
}

export { parseAccount };
