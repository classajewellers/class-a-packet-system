import withPWA from "next-pwa";

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ["googleapis", "google-auth-library", "puppeteer-core", "@sparticuz/chromium"],
  },
  eslint: {
    // ESLint warnings (missing deps, etc.) are surfaced locally; don't block Vercel builds
    ignoreDuringBuilds: true,
  },
};

export default withPWA({
  dest: "public",
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === "development",
})(nextConfig);
