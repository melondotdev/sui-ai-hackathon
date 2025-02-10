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
      } else if (res.status === 429) {
        // If the API provides a Retry-After header, use that delay (in seconds)
        const retryAfterHeader = res.headers.get("Retry-After");
        if (retryAfterHeader) {
          const retryAfterSeconds = parseInt(retryAfterHeader, 10);
          delay = retryAfterSeconds * 1000;
        }
        console.error(
          `Attempt ${attempt + 1} for ${url} returned 429 (Too Many Requests).`
        );
      } else {
        console.error(
          `Attempt ${attempt + 1} for ${url} failed with status: ${res.status}`
        );
      }
    } catch (error) {
      console.error(`Attempt ${attempt + 1} for ${url} threw an error:`, error);
    }
    if (attempt < maxRetries - 1) {
      console.log(`Waiting ${delay}ms before retrying...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
      delay *= 2; // Exponential backoff
    }
  }
  return null;
}

/**
 * Fetch the latestPrice for an NFT using its objectId.
 */
// export async function fetchLatestPrice(objectId: string): Promise<number | null> {
//   const options = {
//     method: "GET",
//     headers: {
//       accept: "*/*",
//       "x-api-key": process.env.BLOCKBERRY_API_KEY || "",
//     },
//   };
//   const url = `https://api.blockberry.one/sui/v1/nfts/${objectId}`;
//   const res = await fetchWithRetry(url, options);
//   if (!res) {
//     console.error(`All retry attempts failed for ${objectId}`);
//     return null;
//   }
//   try {
//     const data = await res.json();
//     return data.latestPrice ?? null;
//   } catch (error) {
//     console.error(`Error parsing response for ${objectId}:`, error);
//     return null;
//   }
// }

/**
 * Fetch the latestPrice for an NFT using its objectId via the Sui GraphQL endpoint.
 * It iterates through the balanceChanges until a negative amount is found,
 * then returns the absolute value of that negative number.
 */
export async function fetchLatestPrice(objectId: string): Promise<number | null> {
  // Build the GraphQL query.
  // Note: We inject the objectId into the affectedObject field.
  const query = `
    query {
      transactionBlocks(
        last: 1,
        scanLimit: 100000000,
        filter: {
          affectedObject: "${objectId}",
          kind: PROGRAMMABLE_TX
        }
      ) {
        nodes {
          digest
          effects {
            balanceChanges {
              nodes {
                owner {
                  address
                }
                amount
                coinType {
                  repr
                }
              }
            }
          }
        }
      }
    }
  `;

  const options = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      accept: "*/*",
    },
    body: JSON.stringify({ query }),
  };

  try {
    // Use fetchWithRetry (assumed to be defined elsewhere) to send the POST request.
    const res = await fetchWithRetry("https://sui-mainnet.mystenlabs.com/graphql", options);
    if (!res) {
      console.error(`All retry attempts failed for ${objectId}`);
      return null;
    }

    const jsonData = await res.json();

    // Ensure we got some transaction blocks back.
    const blocks = jsonData.data?.transactionBlocks?.nodes;
    if (!blocks || blocks.length === 0) {
      console.error(`No transaction blocks found for ${objectId}`);
      return null;
    }

    // Get the balanceChanges nodes from the latest transaction block.
    const balanceChanges = blocks[0].effects?.balanceChanges?.nodes;
    if (!balanceChanges || balanceChanges.length === 0) {
      console.error(`No balance changes found for ${objectId}`);
      return null;
    }

    // Iterate over balanceChanges until we hit a negative amount.
    for (const change of balanceChanges) {
      const amountNumber = Number(change.amount);
      if (amountNumber < 0) {
        // Return the flipped (absolute) value of the negative amount.
        return Math.abs(amountNumber);
      }
    }

    // If no negative balance change was found, log an error and return null.
    console.error(`No negative balance change found for ${objectId}`);
    return null;
  } catch (error) {
    console.error(`Error fetching or parsing GraphQL response for ${objectId}:`, error);
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
