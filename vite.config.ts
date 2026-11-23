import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
// Dev-only: the Arena Editor's save endpoint. Not part of a production build.
import { arenaEditorPlugin } from "./tools/vite-arena-editor.mjs";

export default defineConfig({
  plugins: [vue(), arenaEditorPlugin()],
  /**
   * No public directory. Every shipped file is bundled - models, textures,
   * fonts and audio through the glob in src/data/assets.ts, the rest through
   * direct imports - so a file ships only if the game can name it. The
   * Blender originals in assets/source are inputs to the asset pipeline and
   * never reach the bundle.
   */
  publicDir: false,
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
});
