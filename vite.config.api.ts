import { defineConfig } from "vite";
import path from "path";

// Bundles the Express app (server/index.ts) into ONE ES module for the Vercel
// function. The repo is "type": "module", and Node's ESM loader rejects the
// extensionless/directory imports used across server/** (ERR_UNSUPPORTED_DIR_IMPORT),
// so api/index.ts must import this pre-bundled file instead of the TS sources.
// npm dependencies stay external (traced into the function from node_modules).
export default defineConfig({
  publicDir: false, // do not copy public/ into api/
  build: {
    ssr: path.resolve(__dirname, "server/index.ts"),
    outDir: "api",
    emptyOutDir: false,
    target: "node22",
    minify: false,
    rollupOptions: {
      output: { format: "es", entryFileNames: "_server.mjs" },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./client"),
      "@shared": path.resolve(__dirname, "./shared"),
    },
  },
});
