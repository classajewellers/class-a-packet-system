/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ["googleapis", "google-auth-library"],
  },

  // ── Preview → Production redirect ──────────────────────────────────────────
  // Vercel sets VERCEL_PROJECT_PRODUCTION_URL on every deployment (build time).
  // Preview deployments get a different *.vercel.app hostname, so we redirect
  // any *.vercel.app request that isn't the production host back to production.
  //
  // To use a custom domain instead of the default vercel.app URL, set:
  //   NEXT_PUBLIC_SITE_URL=yourdomain.com   (in Vercel → Settings → Env Vars,
  //                                          Production environment only)
  // ───────────────────────────────────────────────────────────────────────────
  async redirects() {
    // Prefer an explicit custom domain if set, fall back to Vercel's auto URL.
    const productionHost =
      process.env.NEXT_PUBLIC_SITE_URL ||
      process.env.VERCEL_PROJECT_PRODUCTION_URL;

    // No redirect in local dev (neither var is set).
    if (!productionHost) return [];

    // Escape dots for use in a regex value matcher.
    const escapedHost = productionHost.replace(/\./g, "\\.");

    return [
      {
        // Match every path on any *.vercel.app host that is NOT the production host.
        source: "/:path*",
        has: [
          {
            type: "host",
            value: `(?!${escapedHost}).*\\.vercel\\.app`,
          },
        ],
        destination: `https://${productionHost}/:path*`,
        permanent: false, // 307 — don't let browsers cache in case domain changes
      },
    ];
  },
};

export default nextConfig;
