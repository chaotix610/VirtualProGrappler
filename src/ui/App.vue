<template>
  <MainMenu v-if="screen === 'menu'" @launch="launch" />
  <Game v-else @exit="exit" />
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import Game from './Game.vue';
import MainMenu from './MainMenu.vue';
import { loadSavedBindings } from '@/data/controls';

type Screen = 'menu' | 'game';

/** Deep link straight to the combat prototype, skipping the menu. */
const COMBAT_HASH = '#combat';

function screenFromLocation(): Screen {
  if (typeof location === 'undefined') return 'menu';
  return location.hash === COMBAT_HASH ? 'game' : 'menu';
}

/**
 * Application shell.
 *
 * The menu is the root screen; the combat test is the one feature it can
 * currently launch, from Commissioner -> Smackdown Mall.
 *
 * The screen is mirrored into the URL hash, so a refresh stays put and the
 * browser test scripts can open the prototype directly rather than driving
 * four menu keystrokes before every run.
 */
export default defineComponent({
  name: 'App',

  components: { Game, MainMenu },

  data() {
    return {
      screen: screenFromLocation(),
    };
  },

  created() {
    // Applied before any screen reads a binding, so a saved remap is in force
    // from the first keypress.
    loadSavedBindings();
  },

  methods: {
    launch() {
      this.screen = 'game';
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
      const url = this.screen === 'game' ? COMBAT_HASH : location.pathname;
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
