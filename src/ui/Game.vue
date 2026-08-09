<template>
  <div class="game">
    <canvas ref="canvas" class="game__canvas" />

    <!-- Character selection overlay, shown until a character is chosen. -->
    <div v-if="!started" class="overlay">
      <h1 class="overlay__title">Choose your character</h1>

      <div class="roster">
        <button
          v-for="character in characters"
          :key="character.id"
          class="roster__card"
          :class="{ 'roster__card--busy': loadingId !== null }"
          :disabled="loadingId !== null"
          @click="choose(character)"
        >
          <span
            class="roster__swatch"
            :style="{ background: character.swatch }"
          />
          <span class="roster__name">{{ character.label }}</span>
          <span class="roster__tone">{{ character.tone }}</span>
          <span v-if="loadingId === character.id" class="roster__loading">
            Loading&hellip;
          </span>
        </button>
      </div>

      <p v-if="error" class="overlay__error">{{ error }}</p>

      <button class="overlay__back" @click="$emit('exit')">
        Back to Main Menu
      </button>
    </div>

    <CombatDebug
      v-if="started && game"
      :source="() => game?.matchSnapshot() ?? null"
      :frame-source="() => game?.simFrame ?? 0"
    />

    <!-- Controls legend, shown once playing. -->
    <div v-if="started" class="hud">
      <div class="hud__keys">
        <span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> Move</span>
        <span><kbd>Shift</kbd> Run</span>
        <span><kbd>J</kbd> Punch</span>
        <span><kbd>K</kbd> Kick</span>
        <span><kbd>L</kbd> Jump</span>
        <span><kbd>P</kbd> Block</span>
        <span><kbd>Shift</kbd>+<kbd>P</kbd> Roll</span>
      </div>
      <button class="hud__change" @click="reset">Change character</button>
      <button class="hud__change" @click="$emit('exit')">Main menu</button>
      <p class="hud__hint">
        <kbd>Shift</kbd> alone runs straight ahead; press a direction first to
        run that way. Only a run takes the ropes &mdash; throw a move to break
        the chain.
      </p>
      <p v-if="warning" class="hud__warning">{{ warning }}</p>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, markRaw } from "vue";
import { GameScene } from "@/renderer/GameScene";
import { CHARACTERS, CharacterDefinition } from "@/game/config";
import CombatDebug from "./CombatDebug.vue";

export default defineComponent({
  name: "Game",

  components: { CombatDebug },

  emits: ["exit"],

  data() {
    return {
      characters: CHARACTERS,
      started: false,
      loadingId: null as string | null,
      error: "" as string,
      warning: "" as string,
      // markRaw keeps Vue from proxying the whole Babylon scene graph, which
      // would be both slow and subtly break engine internals.
      game: null as GameScene | null,
    };
  },

  mounted() {
    const canvas = this.$refs.canvas as HTMLCanvasElement;
    this.game = markRaw(new GameScene(canvas));
  },

  beforeUnmount() {
    this.game?.dispose();
    this.game = null;
  },

  methods: {
    async choose(character: CharacterDefinition) {
      if (this.loadingId) return;
      this.loadingId = character.id;
      this.error = "";
      this.warning = "";

      try {
        const missing = await this.game!.loadCharacter(character);
        if (missing.length) {
          this.warning = `Missing animation clips: ${missing.join(", ")}`;
        }
        this.started = true;
        // Clicks land on the canvas so keyboard input reaches the window.
        (this.$refs.canvas as HTMLCanvasElement).focus();
      } catch (err) {
        this.error = `Could not load ${character.label}: ${String(err)}`;
      } finally {
        this.loadingId = null;
      }
    },

    reset() {
      this.started = false;
      this.warning = "";
    },
  },
});
</script>

<style scoped>
.game {
  position: relative;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  background: #0f1319;
}

.game__canvas {
  width: 100%;
  height: 100%;
  display: block;
  outline: none;
  touch-action: none;
}

.overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1.5rem;
  padding: 2rem 1rem;
  box-sizing: border-box;
  overflow-y: auto;
  background: rgba(12, 16, 22, 0.92);
  color: #f2f5f8;
  font-family: Avenir, Helvetica, Arial, sans-serif;
}

.overlay__title {
  margin: 0;
  font-size: clamp(1.4rem, 4vw, 2.2rem);
  letter-spacing: 0.02em;
}

.overlay__error {
  color: #ff8a80;
  max-width: 40rem;
  text-align: center;
}

.roster {
  display: grid;
  /* An explicit width is required: as a centred flex item the grid would
     otherwise shrink to its content and auto-fit could never wrap. */
  width: min(100%, 46rem);
  grid-template-columns: repeat(auto-fit, minmax(8.5rem, 1fr));
  gap: 1rem;
  justify-content: center;
}

.roster__card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  padding: 1.1rem 0.75rem;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 0.75rem;
  background: rgba(255, 255, 255, 0.05);
  color: inherit;
  font: inherit;
  cursor: pointer;
  transition: transform 0.15s ease, border-color 0.15s ease,
    background 0.15s ease;
}

.roster__card:hover:not(:disabled) {
  transform: translateY(-3px);
  border-color: #6ea8ff;
  background: rgba(110, 168, 255, 0.14);
}

.roster__card:disabled {
  cursor: progress;
  opacity: 0.6;
}

.roster__swatch {
  width: 3rem;
  height: 3rem;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.35);
}

.roster__name {
  font-weight: 600;
}

.roster__tone {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  opacity: 0.6;
}

.roster__loading {
  font-size: 0.75rem;
  opacity: 0.8;
}

.overlay__back {
  padding: 0.45rem 1.1rem;
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 0.4rem;
  background: rgba(255, 255, 255, 0.08);
  color: inherit;
  font: inherit;
  cursor: pointer;
}

.overlay__back:hover {
  background: rgba(255, 255, 255, 0.18);
}

.hud {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem 1.25rem;
  padding: 0.75rem 1rem;
  background: linear-gradient(transparent, rgba(10, 14, 20, 0.75));
  color: #eef2f6;
  font-family: Avenir, Helvetica, Arial, sans-serif;
  font-size: 0.85rem;
  pointer-events: none;
}

.hud__keys {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem 1rem;
}

kbd {
  display: inline-block;
  min-width: 1.4rem;
  padding: 0.1rem 0.35rem;
  margin-right: 0.15rem;
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-bottom-width: 2px;
  border-radius: 0.25rem;
  background: rgba(255, 255, 255, 0.1);
  font-family: inherit;
  font-size: 0.78rem;
  text-align: center;
}

.hud__change {
  margin-left: auto;
  padding: 0.35rem 0.8rem;
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 0.4rem;
  background: rgba(255, 255, 255, 0.1);
  color: inherit;
  font: inherit;
  cursor: pointer;
  pointer-events: auto;
}

.hud__change:hover {
  background: rgba(255, 255, 255, 0.2);
}

.hud__hint {
  flex-basis: 100%;
  margin: 0;
  opacity: 0.65;
  font-size: 0.78rem;
}

.hud__warning {
  flex-basis: 100%;
  margin: 0;
  color: #ffcc80;
  font-size: 0.78rem;
}
</style>
