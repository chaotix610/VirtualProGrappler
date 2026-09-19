import { fileURLToPath, URL } from "node:url";
// vitest/config re-exports Vite's defineConfig widened with the `test` key.
import { defineConfig } from "vitest/config";
import vue from "@vitejs/plugin-vue";
// Dev-only: the Arena Editor's save endpoint. Not part of a production build.
import { arenaEditorPlugin } from "./tools/vite-arena-editor.mjs";

export default defineConfig({
  plugins: [vue(), arenaEditorPlugin()],
  /**
   * Only assets/runtime is served and shipped. The Blender originals and raw
   * animation libraries in assets/source stay out of the bundle - they are
   * inputs to the asset pipeline, not to the game.
   */
  publicDir: "assets/runtime",
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "#data": fileURLToPath(new URL("./data", import.meta.url)),
    },
  },
  server: {
    port: 8080,
    host: "localhost",
  },
  build: {
    // Babylon no longer ships with the menu - the screens that need it are
    // async components, so it splits into its own lazily fetched chunks. The
    // largest of those is still a few MB, which is inherent to the engine
    // rather than something this app can trim, so the limit stays raised.
    chunkSizeWarningLimit: 4000,
  },
  test: {
    include: ["tests/unit/**/*.test.ts"],
  },
});
