<template>
  <MainMenu v-if="screen === 'menu'" @launch="launch" />
  <CombatTest2 v-else-if="screen === 'combat2'" @exit="exit" />
  <Game v-else @exit="exit" />
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
const Game = defineAsyncComponent({
  loader: () => import('./Game.vue'),
  // GameScene clears to this sky blue, so the placeholder hands over to the
  // live canvas without a flash. Kept as a literal rather than imported from
  // the renderer, which would drag Babylon back into this chunk.
  loadingComponent: () => h(SceneLoading, { background: '#87b0d6' }),
  // The menu already fills the screen, so there is nothing to shift; showing
  // the placeholder immediately reads as a response to the keypress.
  delay: 0,
});

/** Combat System Test 2.0. Babylon again, so loaded on demand as well. */
const CombatTest2 = defineAsyncComponent({
  loader: () => import('./CombatTest2.vue'),
  // Matches the 2.0 scene's clear colour, for the same no-flash handover.
  loadingComponent: () => h(SceneLoading, { background: '#08080d' }),
  delay: 0,
});

type Screen = 'menu' | 'game' | 'combat2';

/** Menu routes that open a screen of their own. */
const SCREEN_BY_ROUTE: Record<string, Screen> = {
  'test.combat_system': 'game',
  'test.combat_system_2': 'combat2',
};

/** Deep links straight to a combat test, skipping the menu. */
const HASH_BY_SCREEN: Partial<Record<Screen, string>> = {
  game: '#combat',
  combat2: '#combat2',
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
 * The menu is the root screen. The two combat tests are the features it can
 * currently launch, from Commissioner -> Smackdown Mall.
 *
 * The screen is mirrored into the URL hash, so a refresh stays put and the
 * browser test scripts can open the prototype directly rather than driving
 * four menu keystrokes before every run.
 */
export default defineComponent({
  name: 'App',

  components: { CombatTest2, Game, MainMenu },

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
      this.screen = SCREEN_BY_ROUTE[route] ?? 'game';
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
