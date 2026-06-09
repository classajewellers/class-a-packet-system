/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ["googleapis", "google-auth-library"],
  },
  eslint: {
    // ESLint warnings (missing deps, etc.) are surfaced locally; don't block Vercel builds
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
