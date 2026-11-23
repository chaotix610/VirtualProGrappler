<template>
  <!-- Screens wait for the local save, so bindings and audio are in force
       from the first frame rather than changing under the player. -->
  <div v-if="!saves.status.ready" class="session-screen" role="status">
    Loading local save…
  </div>
  <template v-else>
    <MainMenu v-if="screen === 'menu'" @launch="launch" />
    <CombatTest v-else @exit="exit" />
  </template>
  <div v-if="storageNotice" class="storage-status" role="status">
    {{ storageNotice }}
  </div>
</template>

<script lang="ts">
import { defineAsyncComponent, defineComponent, h, markRaw } from 'vue';
import MainMenu from './MainMenu.vue';
import SceneLoading from './SceneLoading.vue';
import { saves, startSaves } from '@/data/save/runtime';

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
      // markRaw: the coordinator keeps its own reactive status, and wrapping
      // the whole object in another proxy would only slow every read.
      saves: markRaw(saves),
    };
  },

  computed: {
    /**
     * The banner shown when this session cannot keep what the player
     * changes - a second tab, blocked storage - or a write has failed.
     */
    storageNotice(): string {
      const status = this.saves.status;
      if (!status.ready) return '';
      if (status.error) return `Local save needs attention: ${status.error}`;
      if (status.mode === 'temporary') {
        const why = status.reason ? ` ${status.reason}` : '';
        return `Temporary session - settings changed here will not be kept after this tab closes.${why}`;
      }
      return '';
    },
  },

  created() {
    // Opens the local save, moving any settings still in localStorage into it
    // the first time, and applies the saved bindings and audio before the
    // first screen renders. Asynchronous: the template shows a loading screen
    // until the save is open or a safe temporary session has been made.
    void startSaves();
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
.session-screen {
  position: absolute;
  inset: 0;
  display: grid;
  place-content: center;
  gap: 1rem;
  text-align: center;
  background: #0b0e14;
  color: #f2f5f8;
}

/* Over everything, but never in the way of a click. */
.storage-status {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 100;
  padding: 0.35rem 0.75rem;
  background: #503421;
  color: #fff1dd;
  text-align: center;
  font-size: 0.85rem;
  pointer-events: none;
}

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
