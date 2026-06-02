import path from "path";
import { fileURLToPath } from "url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack(config) {
    /* Point the bare import directly at the pre-built ESM file,
       bypassing the restrictive exports field. */
    config.resolve.alias["@splinetool/react-spline"] = path.resolve(
      __dirname,
      "node_modules/@splinetool/react-spline/dist/react-spline.js"
    );
    return config;
  },
};

export default nextConfig;
