/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ["googleapis", "google-auth-library"],
  },
};

export default nextConfig;
