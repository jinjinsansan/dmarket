import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // 親ディレクトリの無関係な lockfile を root と誤認しないよう固定
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
