/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The team's API Gateway. In `npm run dev:live`, the browser calls /api/... on
// localhost and Vite forwards it here server-side, so the API's CORS list
// doesn't need to include localhost. Override with API_PROXY_TARGET.
const API_ORIGIN = process.env.API_PROXY_TARGET ?? "https://a34gvnw0hg.execute-api.ap-southeast-1.amazonaws.com";

// base: "./" keeps asset URLs relative, so the same build works from the
// CloudFront root, an S3 sub-path, or a local file preview.
export default defineConfig({
  plugins: [react()],
  base: "./",
  build: {
    outDir: "dist",
    sourcemap: false,
    assetsDir: "assets",
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
  },
  server: {
    port: 5173,
    // src/api/rule.ts reads the backend's calibration file from ../models.
    fs: { allow: [".", "../models"] },
    proxy: {
      "/api": {
        target: API_ORIGIN,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
        // Drop the browser's Origin header: this is a server-to-server call.
        configure: (proxy) => proxy.on("proxyReq", (req) => req.removeHeader("origin")),
      },
    },
  },
});
