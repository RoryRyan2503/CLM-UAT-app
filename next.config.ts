import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  basePath: "/clm-uat",
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
