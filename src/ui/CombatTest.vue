<template>
  <div class="combat">
    <canvas ref="canvas" class="combat__canvas" tabindex="0" />

    <div v-if="loading" class="overlay">
      <p class="overlay__label">Loading the RAW arena&hellip;</p>
    </div>

    <div v-else-if="error" class="overlay">
      <p class="overlay__error">{{ error }}</p>
      <button class="overlay__button" @click="$emit('exit')">
        Back to Main Menu
      </button>
    </div>

    <template v-else>
      <CombatDebug
        v-if="game"
        :source="() => game?.matchSnapshot() ?? null"
        :frame-source="() => game?.simFrame ?? 0"
        strike-hint="press B"
      />

      <!-- The legend names pad buttons, not keys: whatever the Control
           Mapper binds to a button is what drives it. -->
      <div class="hud">
        <div class="hud__keys">
          <span v-for="row in legend" :key="row.action" class="hud__row">
            <span class="hud__chip">
              <img class="hud__icon" :src="row.icon" :alt="row.button" />
              <span v-if="row.letter" class="hud__letter">{{ row.letter }}</span>
            </span>
            <span class="hud__action">{{ row.action }}</span>
            <span v-if="row.note" class="hud__note">{{ row.note }}</span>
          </span>
        </div>
        <p class="hud__hint">
          Hold Run into the ropes to rebound off them, or into a corner to
          climb it. Let go of Run on the top rope to dive.
        </p>
        <p class="hud__hint">
          Drag with the mouse to turn the camera; scroll to zoom.
        </p>
        <p v-if="warning" class="hud__warning">{{ warning }}</p>
      </div>

      <div v-if="paused" class="overlay overlay--pause">
        <h1 class="overlay__title">Paused</h1>
        <ul class="pause">
          <li
            v-for="(option, index) in pauseOptions"
            :key="option.id"
            class="pause__option"
            :class="{ 'pause__option--active': index === pauseCursor }"
            @click="choosePause(index)"
          >
            {{ option.label }}
          </li>
        </ul>
        <p class="overlay__note">
          <img class="overlay__icon" :src="icons.a" alt="A" /> selects
          &middot;
          <img class="overlay__icon" :src="icons.start" alt="Start" /> resumes
        </p>
      </div>
    </template>
  </div>
</template>

<script lang="ts">
import { defineComponent, markRaw } from "vue";
import { CombatTestScene } from "@/renderer/CombatTestScene";
import dpadIcon from "../../assets/textures/ui/controller/ButtonIcon-N64-D-Pad.svg";
import cDownIcon from "../../assets/textures/ui/controller/ButtonIcon-N64-C-Down.svg";
import aIcon from "../../assets/textures/ui/controller/ButtonIcon-N64-A.svg";
import bIcon from "../../assets/textures/ui/controller/ButtonIcon-N64-B.svg";
import lIcon from "../../assets/textures/ui/controller/ButtonIcon-N64-L.svg";
import rIcon from "../../assets/textures/ui/controller/ButtonIcon-N64-R.svg";
import startIcon from "../../assets/textures/ui/controller/ButtonIcon-N64-Start.svg";
import { isMenuDown, isMenuUp, virtualInputFor } from "@/game/VirtualController";
import { playMenuCue } from "@/audio/menuAudio";
import CombatDebug from "./CombatDebug.vue";

interface LegendRow {
  action: string;
  button: string;
  icon: string;
  /** Stamped over art that carries no letter of its own (the shoulders). */
  letter?: string;
  note?: string;
}

/**
 * The on-screen legend. Fixed to the pad layout PadInput reads (D-Pad moves,
 * C-Down runs, and so on); the keys behind each button are the mapper's.
 */
const LEGEND: LegendRow[] = [
  { action: "Move", button: "D-Pad", icon: dpadIcon },
  { action: "Run", button: "C-Down", icon: cDownIcon },
  { action: "Strike", button: "B", icon: bIcon },
  { action: "Grapple", button: "A", icon: aIcon, note: "not yet animated" },
  { action: "Block", button: "R", icon: rIcon, letter: "R" },
  { action: "Evade", button: "L", icon: lIcon, letter: "L" },
  { action: "Pause", button: "Start", icon: startIcon },
];

const PAUSE_OPTIONS = [
  { id: "resume", label: "Resume" },
  { id: "exit", label: "Main Menu" },
] as const;

/**
 * Combat System Test.
 *
 * Austin against an idle Austin in the RAW arena. Gameplay input goes through
 * the control mapper's bindings (see PadInput), and so does the pause menu,
 * which is driven like every other menu: Start opens and closes it, the stick
 * or d-pad moves, A selects and B backs out.
 */
export default defineComponent({
  name: "CombatTest",

  components: { CombatDebug },

  emits: ["exit"],

  data() {
    return {
      loading: true,
      error: "",
      warning: "",
      paused: false,
      pauseCursor: 0,
      pauseOptions: PAUSE_OPTIONS,
      legend: LEGEND,
      icons: { a: aIcon, start: startIcon },
      // markRaw keeps Vue from proxying the whole Babylon scene graph, which
      // would be both slow and subtly break engine internals.
      game: null as CombatTestScene | null,
    };
  },


  async mounted() {
    window.addEventListener("keydown", this.onKeyDown);

    const canvas = this.$refs.canvas as HTMLCanvasElement;
    this.game = markRaw(new CombatTestScene(canvas));

    try {
      const report = await this.game.load();
      const notes: string[] = [];
      if (report.missingClips.length) {
        notes.push(`Missing animation clips: ${report.missingClips.join(", ")}`);
      }
      if (report.arenaWarnings.length) {
        console.warn("Arena warnings:", report.arenaWarnings);
      }
      this.warning = notes.join(" ");
      // Keyboard input is read from the window, but focusing the canvas keeps
      // a stray click from leaving focus on a button.
      canvas.focus();
    } catch (err) {
      this.error = `Could not load Combat System Test: ${String(err)}`;
    } finally {
      this.loading = false;
    }
  },

  beforeUnmount() {
    window.removeEventListener("keydown", this.onKeyDown);
    this.game?.dispose();
    this.game = null;
  },

  methods: {
    onKeyDown(event: KeyboardEvent) {
      if (this.loading || this.error || !this.game) return;
      const input = virtualInputFor(event);
      if (!input || event.repeat) return;

      if (!this.paused) {
        if (input !== "start") return;
        this.claim(event);
        this.setPaused(true);
        return;
      }

      // Paused: this screen owns the keys, so the wrestler does not move.
      this.claim(event);
      if (input === "start" || input === "b") return this.setPaused(false);
      if (isMenuUp(input)) return this.movePause(-1);
      if (isMenuDown(input)) return this.movePause(1);
      if (input === "a") return this.choosePause(this.pauseCursor);
    },

    /**
     * Keeps a key this screen used from also reaching the wrestler. This
     * listener is added before the scene's, so without it the B that resumes
     * a pause would land as a punch the moment input came back on.
     */
    claim(event: KeyboardEvent) {
      event.preventDefault();
      event.stopImmediatePropagation();
    },

    setPaused(paused: boolean) {
      this.paused = paused;
      this.pauseCursor = 0;
      this.game?.setPaused(paused);
      playMenuCue(paused ? "select" : "back");
    },

    movePause(delta: number) {
      const count = this.pauseOptions.length;
      this.pauseCursor = (this.pauseCursor + delta + count) % count;
      playMenuCue("move");
    },

    choosePause(index: number) {
      const option = this.pauseOptions[index];
      if (!option) return;
      if (option.id === "exit") {
        playMenuCue("select");
        this.$emit("exit");
        return;
      }
      this.setPaused(false);
    },
  },
});
</script>

<style scoped>
.combat {
  position: relative;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  background: #08080d;
}

.combat__canvas {
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
  gap: 1.25rem;
  padding: 2rem 1rem;
  box-sizing: border-box;
  background: rgba(8, 8, 13, 0.92);
  color: #f2f5f8;
  font-family: Avenir, Helvetica, Arial, sans-serif;
}

.overlay--pause {
  background: rgba(8, 8, 13, 0.7);
}

.overlay__title {
  margin: 0;
  font-size: clamp(1.4rem, 4vw, 2.2rem);
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.overlay__label,
.overlay__note {
  margin: 0;
  opacity: 0.75;
}

.overlay__icon {
  width: 1.4em;
  height: 1.4em;
  vertical-align: middle;
}

.overlay__error {
  color: #ff8a80;
  max-width: 40rem;
  text-align: center;
}

.overlay__button {
  padding: 0.45rem 1.1rem;
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 0.4rem;
  background: rgba(255, 255, 255, 0.08);
  color: inherit;
  font: inherit;
  cursor: pointer;
}

.pause {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin: 0;
  padding: 0;
  list-style: none;
  min-width: 12rem;
}

.pause__option {
  padding: 0.55rem 1rem;
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 0.4rem;
  text-align: center;
  cursor: pointer;
}

.pause__option--active {
  border-color: #ffd54f;
  background: rgba(255, 213, 79, 0.16);
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
  background: linear-gradient(transparent, rgba(8, 8, 13, 0.8));
  color: #eef2f6;
  font-family: Avenir, Helvetica, Arial, sans-serif;
  font-size: 0.82rem;
  pointer-events: none;
}

.hud__keys {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem 1.1rem;
}

.hud__row {
  display: inline-flex;
  gap: 0.35rem;
}

.hud__row {
  align-items: center;
}

/* The D-Pad, L and R art is grey, so each icon sits on a light chip to
   stay readable against the dark arena. */
.hud__icon {
  width: 1.9rem;
  height: 1.9rem;
  padding: 0.15rem;
  border-radius: 0.45rem;
  background: rgba(238, 242, 246, 0.85);
  object-fit: contain;
}

.hud__action {
  font-weight: 600;
}

.hud__chip {
  position: relative;
  display: inline-flex;
}

.hud__letter {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding-top: 0.2rem;
  color: #f2f5f8;
  font-weight: 700;
  font-size: 0.72rem;
  text-shadow: 0 0 2px #000, 0 0 2px #000;
}

.hud__note {
  opacity: 0.6;
  font-size: 0.72rem;
  font-style: italic;
}

.hud__hint {
  flex-basis: 100%;
  margin: 0;
  opacity: 0.65;
  font-size: 0.76rem;
}

.hud__warning {
  flex-basis: 100%;
  margin: 0;
  color: #ffcc80;
  font-size: 0.76rem;
}
</style>
