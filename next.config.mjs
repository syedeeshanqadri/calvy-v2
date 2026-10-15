/** @type {import('next').NextConfig} */
const nextConfig = {
  // Required by Next 14 to load instrumentation.ts (startup env check).
  experimental: { instrumentationHook: true },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "ui-avatars.com" },
    ],
  },
};

export default nextConfig;
