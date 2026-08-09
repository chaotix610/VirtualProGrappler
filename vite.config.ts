import { fileURLToPath, URL } from "node:url";
// vitest/config re-exports Vite's defineConfig widened with the `test` key.
import { defineConfig } from "vitest/config";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  plugins: [vue()],
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
    // Babylon is large; the warning is expected and not actionable here.
    chunkSizeWarningLimit: 4000,
  },
  test: {
    include: ["tests/unit/**/*.test.ts"],
  },
});
