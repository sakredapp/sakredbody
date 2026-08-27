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

/**
 * When this bundle was built — as the commit's own date, not the clock.
 *
 * ── Why not `new Date()` ──────────────────────────────────────────────────
 *
 * It was, and it made the client irreproducible. This string lands in
 * MemberDashboard, so a second build of an unchanged tree gives that chunk a
 * new hash, which renames it, which changes every chunk that imports it, which
 * changes the entry, which changes everything. Measured: two builds three
 * seconds apart shared 11 of 56 filenames, and 54 of 55 chunks were
 * byte-identical once the hashes were normalised out. One timestamp moved the
 * whole graph.
 *
 * That is not cosmetic. `build-aab.sh` rebuilds the client, so an iOS sync
 * followed by an Android build produced a release pair from one commit
 * carrying two separately built applications. Semantically the same and
 * provably neither: nothing downstream could show they matched.
 *
 * The commit's own date answers the same question — "what is this phone
 * running" — is stable for a given SHA, and cannot drift from the SHA printed
 * beside it. `SOURCE_DATE_EPOCH` is honoured first, which is the convention
 * for exactly this, so a CI that sets it stays reproducible too.
 *
 * The fallback is a constant rather than the clock. A build with no git and no
 * epoch should say it does not know, not quietly reintroduce the defect.
 */
function builtAt(): string {
  const epoch = process.env.SOURCE_DATE_EPOCH;
  if (epoch && /^\d+$/.test(epoch)) return new Date(Number(epoch) * 1000).toISOString();
  try {
    return new Date(
      execSync("git log -1 --format=%cI", { encoding: "utf8" }).trim(),
    ).toISOString();
  } catch {
    return "unknown";
  }
}

export default defineConfig({
  define: {
    __BUILD_SHA__: JSON.stringify(gitSha()),
    __BUILT_AT__: JSON.stringify(builtAt()),
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
