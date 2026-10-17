import type { NextConfig } from "next";
import { APP_BASE_PATH } from "./lib/constants";

const nextConfig: NextConfig = {
  basePath: APP_BASE_PATH,
  experimental: {
    serverActions: {
      bodySizeLimit: "11mb",
    },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
