<template>
  <div class="viewer">
    <canvas ref="canvas" class="viewer__canvas" :data-active="sceneOpen" />

    <!-- Selection UI, hidden once an arena is on screen. -->
    <div v-if="!sceneOpen" class="select">
      <h1 class="select__title">Arena Viewer</h1>

      <div class="select__layout">
        <ul class="rows">
          <li
            v-for="(arena, index) in arenas"
            :key="arena.id"
            class="row"
            :class="{ 'row--active': index === cursor }"
            @click="choose(index)"
            @mouseenter="cursor = index"
          >
            {{ arena.displayName }}
          </li>
          <li
            class="row row--back"
            :class="{ 'row--active': cursor === backIndex }"
            @click="choose(backIndex)"
            @mouseenter="cursor = backIndex"
          >
            Back
          </li>
        </ul>

        <div class="preview">
          <img
            v-if="previewUrl"
            class="preview__image"
            :src="previewUrl"
            :alt="`${selected?.displayName} preview`"
          />
          <div v-else class="preview__empty">No preview</div>
        </div>
      </div>

      <p class="select__hint">
        <kbd>&uarr;</kbd><kbd>&darr;</kbd> move &middot; <kbd>Enter</kbd> view
        &middot; <kbd>Esc</kbd> back
      </p>
      <p v-if="status" class="select__status">{{ status }}</p>
    </div>

    <!-- Overlay while a scene is open. -->
    <div v-else class="hud">
      <span class="hud__name">{{ selected?.displayName }}</span>
      <span class="hud__keys">
        <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> rotate &middot;
        <kbd>I</kbd>/<kbd>K</kbd> zoom &middot; <kbd>Esc</kbd> close
      </span>
      <span v-if="warnings.length" class="hud__warning">
        {{ warnings.join(" / ") }}
      </span>
    </div>

    <div v-if="loading" class="loading">Loading&hellip;</div>
  </div>
</template>

<script lang="ts">
import { defineComponent, markRaw } from "vue";
import { ArenaSummary, availableArenas } from "@/data/arenas";
import { ArenaScene } from "@/renderer/ArenaScene";
import { isMenuDown, isMenuUp, virtualInputFor } from "@/game/VirtualController";

/** Inputs the camera responds to while a scene is open. */
const CAMERA_INPUTS = [
  "stickUp",
  "stickDown",
  "stickLeft",
  "stickRight",
  "cUp",
  "cDown",
];

export default defineComponent({
  name: "ArenaViewer",

  emits: ["back"],

  data() {
    return {
      arenas: availableArenas(),
      cursor: 0,
      sceneOpen: false,
      loading: false,
      status: "",
      warnings: [] as string[],
      // markRaw keeps Vue from proxying the Babylon scene graph, which would
      // be slow and subtly break engine internals.
      scene: null as ArenaScene | null,
      /** Guards against an older load finishing after a newer one. */
      loadToken: 0,
    };
  },

  computed: {
    /** The Back row sits after the arenas. */
    backIndex(): number {
      return this.arenas.length;
    },

    selected(): ArenaSummary | null {
      return this.arenas[this.cursor] ?? null;
    },

    previewUrl(): string | null {
      return this.selected?.previewUrl ?? null;
    },
  },

  mounted() {
    window.addEventListener("keydown", this.onKeyDown);
  },

  beforeUnmount() {
    window.removeEventListener("keydown", this.onKeyDown);
    this.scene?.dispose();
    this.scene = null;
  },

  methods: {
    onKeyDown(event: KeyboardEvent) {
      const input = virtualInputFor(event);
      if (!input) return;
      event.preventDefault();

      if (this.sceneOpen) {
        if (input === "b") return this.closeScene();
        if (CAMERA_INPUTS.includes(input)) this.scene?.moveCamera(input);
        return;
      }

      if (isMenuUp(input)) return this.move(-1);
      if (isMenuDown(input)) return this.move(1);
      if (input === "a") return this.choose(this.cursor);
      if (input === "b") return this.$emit("back");
      // Left and right stay inert, as they are in the menus.
    },

    move(delta: number) {
      // The arenas plus the Back row.
      const count = this.arenas.length + 1;
      this.cursor = (this.cursor + delta + count) % count;
      this.status = "";
    },

    choose(index: number) {
      this.cursor = index;
      if (index === this.backIndex) return this.$emit("back");
      const arena = this.arenas[index];
      if (arena) void this.open(arena.id);
    },

    async open(arenaId: string) {
      const token = ++this.loadToken;
      this.loading = true;
      this.status = "";
      this.warnings = [];
      // Shown before loading so the canvas has its full size when the engine
      // measures it; a hidden canvas would come back with a zero viewport.
      this.sceneOpen = true;
      await this.$nextTick();

      try {
        if (!this.scene) {
          const canvas = this.$refs.canvas as HTMLCanvasElement;
          this.scene = markRaw(new ArenaScene(canvas));
        }
        const report = await this.scene.load(arenaId);
        if (token !== this.loadToken) return;
        this.warnings = report.warnings;
      } catch (error) {
        if (token !== this.loadToken) return;
        this.sceneOpen = false;
        this.status = `Could not load ${arenaId}: ${String(error)}`;
      } finally {
        if (token === this.loadToken) this.loading = false;
      }
    },

    closeScene() {
      // Invalidates any load still in flight.
      this.loadToken += 1;
      this.scene?.dispose();
      this.scene = null;
      this.sceneOpen = false;
      this.loading = false;
      this.warnings = [];
    },
  },
});
</script>

<style scoped>
.viewer {
  position: absolute;
  inset: 0;
  background: #0b0e14;
  color: #f2f5f8;
  font-family: var(--vpg-font-body);
}

.viewer__canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
  outline: none;
  touch-action: none;
  opacity: 0;
  visibility: hidden;
}

.viewer__canvas[data-active="true"] {
  opacity: 1;
  visibility: visible;
}

.select {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1.25rem;
  padding: 2rem 1rem;
  box-sizing: border-box;
  overflow-y: auto;
}

.select__title {
  margin: 0;
  font-family: var(--vpg-font-display);
  font-size: clamp(1.6rem, 4vw, 2.4rem);
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.select__layout {
  display: grid;
  grid-template-columns: minmax(220px, 26vw) minmax(280px, 30rem);
  gap: clamp(24px, 5vw, 64px);
  align-items: center;
}

.rows {
  margin: 0;
  padding: 0;
  list-style: none;
}

.row {
  padding: 4px 12px;
  color: var(--vpg-item-color-idle);
  font-family: var(--vpg-font-menu-item);
  font-size: clamp(18px, 1.8vw, 24px);
  font-weight: 700;
  letter-spacing: -1px;
  -webkit-text-stroke-width: 0.5px;
  -webkit-text-stroke-color: var(--vpg-item-stroke);
  cursor: pointer;
  transition: -webkit-text-fill-color var(--vpg-state-transition),
    -webkit-text-stroke-width var(--vpg-state-transition);
}

.row--back {
  margin-top: 0.5rem;
}

.row--active {
  -webkit-text-fill-color: var(--vpg-item-color-active);
  -webkit-text-stroke-width: 1.5px;
  animation: glowPulse 1s ease-in-out infinite;
}

.preview__image {
  width: 100%;
  aspect-ratio: 16 / 9;
  object-fit: cover;
  display: block;
  border: 1px solid rgba(255, 255, 255, 0.18);
}

.preview__empty {
  width: 100%;
  aspect-ratio: 16 / 9;
  display: grid;
  place-items: center;
  border: 1px dashed rgba(255, 255, 255, 0.25);
  opacity: 0.5;
  font-size: 0.85rem;
}

.select__hint {
  margin: 0;
  font-size: 0.8rem;
  opacity: 0.6;
}

.select__status {
  margin: 0;
  color: var(--vpg-item-color-active);
  font-size: 0.85rem;
  max-width: 40rem;
  text-align: center;
}

.hud {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 1.25rem;
  padding: 0.75rem 1rem;
  background: linear-gradient(transparent, rgba(10, 14, 20, 0.8));
  font-size: 0.82rem;
  pointer-events: none;
}

.hud__name {
  font-family: var(--vpg-font-menu-item);
  font-weight: 700;
  font-size: 1.1rem;
  letter-spacing: -1px;
}

.hud__keys {
  opacity: 0.75;
}

.hud__warning {
  flex-basis: 100%;
  color: #ffcc80;
}

.loading {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  background: rgba(6, 8, 12, 0.6);
  font-family: var(--vpg-font-menu-item);
  font-size: 1.2rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  pointer-events: none;
}

kbd {
  display: inline-block;
  min-width: 1.3rem;
  padding: 0.05rem 0.3rem;
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-bottom-width: 2px;
  border-radius: 0.25rem;
  background: rgba(255, 255, 255, 0.1);
  font-family: var(--vpg-font-body);
  font-size: 0.75rem;
  text-align: center;
}
</style>
