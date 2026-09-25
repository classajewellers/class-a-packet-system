/** A path we can send someone back to after sign-in. Rejects off-site targets. */
export function safeInternalPath(raw: string | null | undefined): string | null {
  if (!raw) return null;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return null;
  if (raw.includes("\\") || raw.includes("://") || raw.includes("\n") || raw.includes("\r")) return null;
  const path = raw.split("?")[0]?.split("#")[0] ?? "";
  if (path === "/login" || path.startsWith("/login/") || path === "/api" || path.startsWith("/api/")) return null;
  return raw;
}
