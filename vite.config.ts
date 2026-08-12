import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { execSync } from "child_process";

/**
 * Which commit this bundle was built from.
 *
 * ── Why this is worth a build step ────────────────────────────────────────
 *
 * The native shells bundle the client rather than fetching it — see webDir in
 * capacitor.config.ts — so a Vercel deploy does nothing for a phone. That is
 * the correct design and it has one sharp edge: "I pushed the fix" and "I am
 * looking at my phone and the fix is not there" are both true at once, and
 * telling them apart took an hour of unpacking an .aab to grep its assets.
 *
 * Stamped at build time and shown in Settings, so the question "what is this
 * phone actually running" has an answer on the phone.
 *
 * Wrapped because a build must never fail for want of a git checkout — CI,
 * a tarball, or a shallow clone all legitimately have no .git.
 */
function gitSha(): string {
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

export default defineConfig({
  define: {
    __BUILD_SHA__: JSON.stringify(gitSha()),
    __BUILT_AT__: JSON.stringify(new Date().toISOString()),
  },
  plugins: [
    react(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        // Split the vendors that never change from the app that changes every
        // push. One blob meant a first visit downloaded everything serially
        // and every deploy invalidated the lot.
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (id.includes("react-dom") || id.includes("/react/") || id.includes("scheduler")) return "vendor-react";
          if (id.includes("framer-motion") || id.includes("popmotion") || id.includes("style-value-types")) return "vendor-motion";
          if (id.includes("@radix-ui")) return "vendor-radix";
          if (id.includes("@tanstack")) return "vendor-query";
          if (id.includes("lucide-react")) return "vendor-icons";
        },
      },
    },
  },
  server: {
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
