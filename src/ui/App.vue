<template>
  <MainMenu v-if="screen === 'menu'" @launch="launch" />
  <CombatTest v-else @exit="exit" />
</template>

<script lang="ts">
import { defineAsyncComponent, defineComponent, h } from 'vue';
import MainMenu from './MainMenu.vue';
import SceneLoading from './SceneLoading.vue';
import { loadSavedBindings } from '@/data/controls';
import { loadSavedAudioSettings } from '@/audio/menuAudio';

/**
 * The combat screen pulls in Babylon, which dwarfs everything else in the
 * bundle. Loading it on demand keeps the engine out of the menu's download,
 * so the first screen paints without waiting on a renderer it never uses.
 */
const CombatTest = defineAsyncComponent({
  loader: () => import('./CombatTest.vue'),
  // Matches the scene's clear colour, so the placeholder hands over to the
  // live canvas without a flash.
  loadingComponent: () => h(SceneLoading, { background: '#08080d' }),
  // The menu already fills the screen, so there is nothing to shift; showing
  // the placeholder immediately reads as a response to the keypress.
  delay: 0,
});

type Screen = 'menu' | 'combat';

/** Menu routes that open a screen of their own. */
const SCREEN_BY_ROUTE: Record<string, Screen> = {
  'test.combat_system': 'combat',
};

/** Deep links straight to the combat test, skipping the menu. */
const HASH_BY_SCREEN: Partial<Record<Screen, string>> = {
  combat: '#combat',
};

function screenFromLocation(): Screen {
  if (typeof location === 'undefined') return 'menu';
  const match = Object.entries(HASH_BY_SCREEN).find(
    ([, hash]) => hash === location.hash
  );
  return (match?.[0] as Screen | undefined) ?? 'menu';
}

/**
 * Application shell.
 *
 * The menu is the root screen. The combat test is the feature it can
 * currently launch, from Commissioner -> Smackdown Mall.
 *
 * The screen is mirrored into the URL hash, so a refresh stays put and the
 * browser test scripts can open the prototype directly rather than driving
 * four menu keystrokes before every run.
 */
export default defineComponent({
  name: 'App',

  components: { CombatTest, MainMenu },

  data() {
    return {
      screen: screenFromLocation(),
    };
  },

  created() {
    // Applied before any screen reads a binding, so a saved remap is in force
    // from the first keypress.
    loadSavedBindings();
    // Likewise for mute and volume: the first cue must already obey them.
    loadSavedAudioSettings();
  },

  methods: {
    launch(route: string) {
      this.screen = SCREEN_BY_ROUTE[route] ?? 'combat';
      this.syncHash();
    },

    exit() {
      this.screen = 'menu';
      this.syncHash();
    },

    syncHash() {
      if (typeof history === 'undefined') return;
      // replaceState rather than assigning location.hash, so moving between
      // menu and game does not leave a trail of back-button entries.
      const url = HASH_BY_SCREEN[this.screen] ?? location.pathname;
      history.replaceState(null, '', url);
    },
  },
});
</script>

<style>
/* Fonts and the shared design tokens are declared in index.html, so they are
   in force before this bundle parses. */
html,
body,
#app {
  margin: 0;
  padding: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
  font-family: Avenir, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
</style>
