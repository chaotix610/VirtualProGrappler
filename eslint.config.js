import js from "@eslint/js";
import globals from "globals";
import pluginVue from "eslint-plugin-vue";
import {
  defineConfigWithVueTs,
  vueTsConfigs,
} from "@vue/eslint-config-typescript";

/**
 * The old .eslintrc.js declared `env: { node: true }` for the whole repo, which
 * quietly handed browser code Node's globals and vice versa. Flat config lets
 * each area of the tree declare only what it actually runs against, so a stray
 * `process.env` in renderer code is now an error rather than a silent pass.
 */
const production = process.env.NODE_ENV === "production";

export default defineConfigWithVueTs(
  {
    name: "vpg/ignores",
    // assets/ is art and Blender output; dist/ is build product; data/ is JSON.
    ignores: ["dist/**", "assets/**", "docs/**"],
  },

  js.configs.recommended,
  // `essential` only — same tier the .eslintrc.js used. Moving up to
  // strongly-recommended is a separate, opinionated change.
  pluginVue.configs["flat/essential"],
  vueTsConfigs.recommended,

  {
    name: "vpg/browser",
    files: ["src/**/*.{ts,vue}"],
    languageOptions: { globals: globals.browser },
  },

  {
    name: "vpg/node-tooling",
    files: ["tools/**/*.{mjs,mts}", "vite.config.ts", "*.config.js"],
    languageOptions: { globals: globals.node },
  },

  {
    // Playwright drivers: Node at the top level, browser globals inside the
    // page.evaluate() callbacks that get serialised into the page.
    name: "vpg/browser-tests",
    files: ["tests/browser/**/*.mjs"],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
  },

  {
    name: "vpg/unit-tests",
    files: ["tests/unit/**/*.ts"],
    languageOptions: { globals: globals.node },
  },

  {
    name: "vpg/rules",
    rules: {
      "no-console": production ? "warn" : "off",
      "no-debugger": production ? "warn" : "off",

      // The rule already exempts App.vue and index.vue as top-level shells.
      // Game.vue is the third: it is the other half of App.vue's v-if, not a
      // reusable component, so it carries no collision risk. Every component
      // below these still has to be multi-word.
      "vue/multi-word-component-names": ["error", { ignores: ["Game"] }],
    },
  },
);
