import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Service worker a manifest jsou servírované ze /public
  reactStrictMode: true,
  // Přílohy úkolů se nahrávají přes server actions (výchozí limit je 1 MB).
  experimental: { serverActions: { bodySizeLimit: "4.4mb" } },
};

export default nextConfig;
