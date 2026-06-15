// Nivoda integration pending — awaiting correct API credentials from Nivoda support.
// Restore full auth logic once credentials are confirmed.

export const NIVODA_ENDPOINT = "https://integrations.nivoda.net/graphql-loupe360";

export function clearNivodaTokenCache(): void {
  // no-op while pending
}

export async function getNivodaToken(_skipCache = false): Promise<string> {
  throw new Error("Nivoda integration pending configuration");
}
