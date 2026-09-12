import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Optional development-only same-origin proxy. Production builds are
  // static assets and never include this server configuration.
  ...(process.env.IMAGEX_API_PROXY_TARGET
    ? {
        server: {
          proxy: {
            "/api-proxy": {
              target: process.env.IMAGEX_API_PROXY_TARGET,
              changeOrigin: true,
              secure: true,
              // The rewrite below explicitly includes the target's path
              // prefix (commonly `/v1`), so avoid Vite prepending it again.
              prependPath: false,
              rewrite: (requestPath: string) => {
                const target = process.env.IMAGEX_API_PROXY_TARGET || "";
                let targetPath = "";
                try {
                  targetPath = new URL(target).pathname.replace(/\/$/, "");
                } catch {
                  // Leave the target path empty when an invalid proxy target
                  // is supplied; Vite will surface the connection error.
                }
                return `${targetPath}${requestPath.replace(/^\/api-proxy/, "")}` || "/";
              },
            },
          },
        },
      }
    : {}),
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("node_modules/react") || id.includes("node_modules/react-dom")) return "react";
          if (id.includes("node_modules/@radix-ui") || id.includes("node_modules/radix-ui")) return "radix-ui";
          if (id.includes("node_modules/lucide-react")) return "icons";
          return "vendor";
        },
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    // App.test.tsx targets the pre-redesign UI (removed protocol tabs,
    // legacy selectors and the former single-column layout). Keep it in the
    // tree for historical reference, but exclude it from the default CI run
    // until that suite is rewritten against the current interface.
    exclude: ["src/App.test.tsx", "gpt_image_playground-main/**", "dist/**", "node_modules/**"],
  },
});
