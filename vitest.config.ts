import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config";

/**
 * Vitest settings, layered on the app's Vite config so tests resolve the same
 * `@/` and `#data/` aliases and compile `.vue` files the same way.
 *
 * Only `*.test.ts` files run here. The `.mjs` scripts in tests/browser and
 * tests/browser-combat drive a real Chromium and are run by hand.
 */
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      include: ["tests/**/*.test.ts"],
    },
  })
);
