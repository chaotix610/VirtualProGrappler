<template>
  <div class="mapper">
    <h1 class="mapper__title">Controls</h1>
    <p class="mapper__hint">
      <template v-if="listeningFor">
        Press a key for <strong>{{ label(listeningFor) }}</strong
        >&hellip; <kbd>Esc</kbd> cancels.
      </template>
      <template v-else>
        Click a controller button, then press a key. <kbd>&uarr;</kbd><kbd>&darr;</kbd> select &middot; <kbd>Enter</kbd> rebind
        &middot; <kbd>Esc</kbd> back
      </template>
    </p>

    <div class="mapper__layout">
      <section class="controller-panel" aria-label="Interactive Nintendo 64 controller">
        <div class="controller">
          <img class="controller__body" :src="controllerImage" alt="Nintendo 64 controller" />
          <button
            v-for="target in targets"
            :key="target.control"
            type="button"
            class="controller__target"
            :class="{
              'controller__target--active': rows[cursor]?.key === target.control,
              'controller__target--listening': listeningFor === target.control,
              'controller__target--rear': target.rear,
            }"
            :style="{ left: target.x + '%', top: target.y + '%', width: target.width + '%', height: target.height + '%' }"
            :aria-label="`${label(target.control)}: ${keyLabel(target.control)}. Click to rebind.`"
            :title="`${label(target.control)} · ${keyLabel(target.control)}`"
            :disabled="!!conflict"
            @click="activateControl(target.control)"
          >
            <img v-if="target.rear" :src="icon(target.control)" alt="" />
            <span v-if="target.rear" class="controller__rear-key">{{ keyLabel(target.control) }}</span>
            <span v-else-if="target.control.startsWith('controlStick')" class="controller__direction" aria-hidden="true">{{ direction(target.control) }}</span>
            <span v-else class="sr-only">{{ label(target.control) }}</span>
          </button>
        </div>
        <p class="controller-panel__caption">L / R shoulder buttons · Z rear trigger</p>
        <div class="selection" aria-live="polite">
          <img :src="icon(selectedControl)" alt="" />
          <div>
            <strong>{{ label(selectedControl) }}</strong>
            <p>{{ listeningFor ? 'Press a key… Esc to cancel' : keyLabel(selectedControl) }}</p>
          </div>
        </div>
        <p class="controller-panel__save">Bindings save automatically.</p>
      </section>
    <ul class="rows" aria-label="Controller bindings and actions">
      <li v-for="(row, index) in rows" :key="row.key">
      <button
        type="button"
        class="row"
        :class="{
          'row--active': index === cursor,
          'row--action': row.kind === 'action',
          'row--listening': row.kind === 'binding' && listeningFor === row.control,
        }"
        :disabled="!!conflict"
        @focus="cursor = index"
        @click="activate(index)"
      >
        <img v-if="row.kind === 'binding'" class="row__icon" :src="icon(row.control)" alt="" />
        <span class="row__label">{{ row.label }}</span>
        <span v-if="row.kind === 'binding'" class="row__key">
          {{
            listeningFor === row.control
              ? "press a key"
              : keyLabel(row.control)
          }}
        </span>
      </button>
      </li>
    </ul>
    </div>

    <p class="mapper__status" role="status">{{ status }}</p>

    <!-- Conflict confirmation. -->
    <div v-if="conflict" class="modal">
      <div class="modal__box" role="dialog" aria-modal="true" aria-label="Replace existing binding?">
        <p class="modal__text">Replace existing binding?</p>
        <p class="modal__detail">
          <strong>{{ friendlyKey(conflict.code) }}</strong> is bound to
          <strong>{{ label(conflict.owner) }}</strong
          >. Assigning it to <strong>{{ label(conflict.control) }}</strong> will
          leave {{ label(conflict.owner) }} unbound.
        </p>
        <div class="modal__actions">
          <button class="modal__button" @click="confirmConflict">
            Replace (Enter)
          </button>
          <button class="modal__button" @click="cancelConflict">
            Cancel (Esc)
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import {
  PAD_CONTROLS,
  PAD_CONTROL_LABELS,
  PadControl,
  bindKey,
  conflictFor,
  exportMapping,
  keysForControl,
  resetBindings,
} from "@/data/controls";
import { eventCode, isMenuDown, isMenuUp, virtualInputFor } from "@/game/VirtualController";
import { playMenuCue } from "@/audio/menuAudio";

import controllerImage from "../../assets/textures/ui/controller/n64-controller.svg";

const controllerIcons = import.meta.glob<string>(
  "../../assets/textures/ui/controller/ButtonIcon-N64-*.svg",
  { eager: true, query: "?url", import: "default" }
);

interface Target {
  control: PadControl;
  x: number;
  y: number;
  width: number;
  height: number;
  rear?: boolean;
}

const targets: Target[] = [
  { control: "dpadUp", x: 23.35, y: 28.5, width: 6, height: 7 },
  { control: "dpadDown", x: 23.35, y: 38.5, width: 6, height: 7 },
  { control: "dpadLeft", x: 18.35, y: 33.5, width: 7, height: 6 },
  { control: "dpadRight", x: 28.35, y: 33.5, width: 7, height: 6 },
  { control: "controlStickUp", x: 51.35, y: 48, width: 9, height: 8 },
  { control: "controlStickDown", x: 51.35, y: 59, width: 9, height: 8 },
  { control: "controlStickLeft", x: 45.85, y: 53.5, width: 8, height: 9 },
  { control: "controlStickRight", x: 56.85, y: 53.5, width: 8, height: 9 },
  { control: "cUp", x: 81.7, y: 24.9, width: 6, height: 6 },
  { control: "cDown", x: 81.7, y: 35.6, width: 6, height: 6 },
  { control: "cLeft", x: 76.35, y: 30.25, width: 6, height: 6 },
  { control: "cRight", x: 87.05, y: 30.25, width: 6, height: 6 },
  { control: "a", x: 75.05, y: 41.4, width: 9, height: 9 },
  { control: "b", x: 68.62, y: 34.9, width: 9, height: 9 },
  { control: "start", x: 51.35, y: 34, width: 10, height: 10 },
  { control: "l", x: 20, y: 8, width: 18, height: 13, rear: true },
  { control: "r", x: 82, y: 8, width: 18, height: 13, rear: true },
  { control: "z", x: 77, y: 75, width: 18, height: 15, rear: true },
];

type Row =
  | { kind: "binding"; key: string; label: string; control: PadControl }
  | { kind: "action"; key: string; label: string; action: "reset" | "export" | "back" };

interface Conflict {
  control: PadControl;
  code: string;
  owner: PadControl;
}

export default defineComponent({
  name: "ControlMapper",

  emits: ["back"],

  data() {
    return {
      controllerImage,
      targets,
      cursor: 0,
      listeningFor: null as PadControl | null,
      conflict: null as Conflict | null,
      status: "",
      /** Bumped to force the key column to re-read the mapping after a bind. */
      revision: 0,
    };
  },

  computed: {
    selectedControl(): PadControl {
      const row = this.rows[this.cursor];
      return this.listeningFor ?? (row?.kind === "binding" ? row.control : "a");
    },
    rows(): Row[] {
      const bindings: Row[] = PAD_CONTROLS.map((control) => ({
        kind: "binding" as const,
        key: control,
        label: PAD_CONTROL_LABELS[control],
        control,
      }));
      return [
        ...bindings,
        { kind: "action", key: "reset", label: "Reset Defaults", action: "reset" },
        { kind: "action", key: "export", label: "Export JSON", action: "export" },
        { kind: "action", key: "back", label: "Back", action: "back" },
      ];
    },
  },

  watch: {
    // Keep keyboard selection visible on smaller screens.
    cursor() {
      this.$nextTick(() => {
        const row = this.$el?.querySelector?.(".row--active");
        row?.scrollIntoView({ block: "nearest" });
      });
    },
  },

  mounted() {
    window.addEventListener("keydown", this.onKeyDown);
  },

  beforeUnmount() {
    window.removeEventListener("keydown", this.onKeyDown);
  },

  methods: {
    icon(control: PadControl): string {
      const name = control.startsWith("dpad") ? "D-Pad"
        : control.startsWith("controlStick") ? "Control_Stick"
        : control.startsWith("c") ? "C"
        : control === "start" ? "Start" : control.toUpperCase();
      return controllerIcons[`../../assets/textures/ui/controller/ButtonIcon-N64-${name}.svg`];
    },

    direction(control: PadControl): string {
      if (control.endsWith("Up")) return "↑";
      if (control.endsWith("Down")) return "↓";
      if (control.endsWith("Left")) return "←";
      return "→";
    },

    activateControl(control: PadControl) {
      this.activate(this.rows.findIndex((row) => row.key === control));
    },

    label(control: PadControl): string {
      return PAD_CONTROL_LABELS[control];
    },

    keyLabel(control: PadControl): string {
      // `revision` is read so Vue re-evaluates this after a rebind; the
      // bindings live outside the reactive graph on purpose.
      void this.revision;
      const keys = keysForControl(control);
      return keys.length ? keys.map(this.friendlyKey).join(", ") : "unbound";
    },

    /** Turns a KeyboardEvent.code into something readable on screen. */
    friendlyKey(code: string): string {
      if (code.startsWith("Key")) return code.slice(3);
      if (code.startsWith("Digit")) return code.slice(5);
      if (code.startsWith("Arrow")) return `${code.slice(5)} Arrow`;
      return code;
    },

    onKeyDown(event: KeyboardEvent) {
      // The mapper owns the keyboard while it is open: without this, rebinding
      // to a key the browser acts on (Space scrolling, arrows) fights the UI.
      if (event.key === "Tab" && !this.listeningFor && !this.conflict) return;
      event.preventDefault();
      if (event.repeat) return;

      if (this.conflict) return this.onConflictKey(event);
      if (this.listeningFor) return this.onListeningKey(event);
      this.onNavigationKey(event);
    },

    /**
     * While listening, the raw key is what matters, not what it is bound to -
     * otherwise a key could never be moved off the control it already serves.
     * Escape is reserved as the cancel, so it cannot be assigned here.
     */
    onListeningKey(event: KeyboardEvent) {
      const code = eventCode(event);
      if (code === "Escape") {
        this.listeningFor = null;
        this.status = "Rebinding cancelled.";
        playMenuCue("back");
        return;
      }

      const control = this.listeningFor!;
      const owner = conflictFor(control, code);
      if (owner) {
        this.conflict = { control, code, owner };
        this.listeningFor = null;
        playMenuCue("deny");
        return;
      }

      this.apply(control, code);
    },

    onConflictKey(event: KeyboardEvent) {
      const code = eventCode(event);
      if (code === "Escape") return this.cancelConflict();
      if (code === "Enter" || code === "NumpadEnter") return this.confirmConflict();
    },

    onNavigationKey(event: KeyboardEvent) {
      const input = virtualInputFor(event);
      if (!input) return;

      if (isMenuUp(input)) return this.move(-1);
      if (isMenuDown(input)) return this.move(1);
      if (input === "a") return this.activate(this.cursor);
      if (input === "b") {
        playMenuCue("back");
        return this.$emit("back");
      }
      // Left and right deliberately do nothing here, matching the menus.
    },

    move(delta: number) {
      const count = this.rows.length;
      this.cursor = (this.cursor + delta + count) % count;
      this.status = "";
      playMenuCue("move");
    },

    activate(index: number) {
      if (this.conflict) return;
      this.listeningFor = null;
      this.cursor = index;
      const row = this.rows[index];

      if (row.kind === "binding") {
        this.listeningFor = row.control;
        this.status = "";
        playMenuCue("select");
        return;
      }

      if (row.action === "back") {
        playMenuCue("back");
        return this.$emit("back");
      }
      playMenuCue("select");
      if (row.action === "reset") return this.reset();
      if (row.action === "export") return this.exportJson();
    },

    apply(control: PadControl, code: string) {
      const { displaced } = bindKey(control, code);
      this.listeningFor = null;
      this.revision += 1;
      this.status = displaced
        ? `${this.friendlyKey(code)} bound to ${this.label(control)}, taken from ${this.label(displaced)}.`
        : `${this.friendlyKey(code)} bound to ${this.label(control)}.`;
      playMenuCue("confirm");
    },

    confirmConflict() {
      const pending = this.conflict;
      if (!pending) return;
      this.conflict = null;
      this.apply(pending.control, pending.code);
    },

    cancelConflict() {
      this.conflict = null;
      this.status = "Rebinding cancelled.";
      playMenuCue("back");
    },

    reset() {
      resetBindings();
      this.revision += 1;
      this.status = "Bindings restored to defaults.";
      playMenuCue("confirm");
    },

    exportJson() {
      const json = JSON.stringify(exportMapping(), null, 2);
      const url = URL.createObjectURL(
        new Blob([json], { type: "application/json" })
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = "control-mappings.json";
      link.click();
      URL.revokeObjectURL(url);
      this.status = "Exported control-mappings.json.";
      playMenuCue("confirm");
    },
  },
});
</script>

<style scoped>
.mapper {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 1.25rem 1rem;
  box-sizing: border-box;
  overflow-y: auto;
  background-color: #0b0e14;
  background-image: linear-gradient(rgba(11, 14, 20, 0.65), rgba(11, 14, 20, 0.8)),
    url("../../assets/artwork/crowd-1.png");
  background-size: cover;
  background-position: center;
  color: #f2f5f8;
  font-family: var(--vpg-font-body);
}

.mapper__title {
  margin: 0 0 0.35rem;
  font-family: var(--vpg-font-display);
  font-size: clamp(1.6rem, 4vw, 2.4rem);
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.mapper__hint {
  margin: 0 0 1.25rem;
  font-size: 0.82rem;
  opacity: 0.7;
}

.rows {
  width: min(100%, 34rem);
  margin: 0;
  padding: 0;
  list-style: none;
}

/*
 * The rows share the menu's type and highlight, but not its 34px scale: this
 * is a 21-row table with a second column, so it is sized to stay readable
 * rather than to match the menu item size token.
 */
.row {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.5rem 0.9rem;
  border-left: 3px solid transparent;
  color: var(--vpg-item-color-idle);
  font-family: var(--vpg-font-menu-item);
  font-weight: 700;
  letter-spacing: 0.02em;
  -webkit-text-stroke-width: 0.5px;
  -webkit-text-stroke-color: var(--vpg-item-stroke);
  text-transform: uppercase;
  cursor: pointer;
  transition: -webkit-text-fill-color var(--vpg-state-transition),
    -webkit-text-stroke-width var(--vpg-state-transition);
}

.row--action {
  margin-top: 0.2rem;
  opacity: 0.85;
}

.row--active,
.row:hover {
  border-left-color: var(--vpg-item-color-active);
  background: rgba(242, 143, 61, 0.12);
  -webkit-text-fill-color: var(--vpg-item-color-active);
  -webkit-text-stroke-width: 1px;
  animation: glowPulse 1s ease-in-out infinite;
}

/* Listening beats active: the row is waiting on a keypress, not merely
   selected, and must not read the same as the rest. */
.row--listening,
.row--listening:hover {
  border-left-color: #6ea8ff;
  background: rgba(110, 168, 255, 0.16);
  -webkit-text-fill-color: #cfe0ff;
  animation: none;
}

.row__key {
  opacity: 0.75;
  font-variant-numeric: tabular-nums;
}

.mapper__status {
  margin-top: 1rem;
  font-size: 0.82rem;
  color: var(--vpg-item-color-active);
}

.modal {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(6, 8, 12, 0.8);
}

.modal__box {
  width: min(90%, 26rem);
  padding: 1.5rem;
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 0.5rem;
  background: #141a24;
}

.modal__text {
  margin: 0 0 0.6rem;
  font-family: var(--vpg-font-body);
  font-size: 1.15rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.modal__detail {
  margin: 0 0 1.2rem;
  font-size: 0.85rem;
  line-height: 1.5;
  opacity: 0.8;
}

.modal__actions {
  display: flex;
  gap: 0.75rem;
}

.modal__button {
  flex: 1;
  padding: 0.5rem;
  border: 1px solid rgba(255, 255, 255, 0.25);
  border-radius: 0.3rem;
  background: rgba(255, 255, 255, 0.08);
  color: inherit;
  font: inherit;
  cursor: pointer;
}

.modal__button:hover {
  background: rgba(255, 255, 255, 0.18);
}

.mapper__layout { width: min(100%, 76rem); display: grid; grid-template-columns: minmax(0, 1.5fr) minmax(20rem, 1fr); gap: 2rem; align-items: start; }
.controller-panel { min-width: 0; }
.controller { position: relative; width: min(100%, 32rem); margin: auto; aspect-ratio: 1; }
.controller__body { width: 100%; height: 100%; display: block; pointer-events: none; }
.controller__target { position: absolute; transform: translate(-50%, -50%); border: 2px solid transparent; border-radius: 30%; background: transparent; padding: 0; cursor: pointer; }
.controller__target:hover, .controller__target:focus-visible, .controller__target--active { border-color: #ffc83d; background: #ffc83d33; box-shadow: 0 0 16px #ffc83d66; outline: none; }
.controller__target--listening { border-color: #6ea8ff; background: #6ea8ff55; box-shadow: 0 0 18px #6ea8ff88; }
.controller__target--rear { background: #141a24; border-color: #ffffff30; display: flex; align-items: center; justify-content: center; gap: .25rem; color: inherit; }
.controller__target--rear img { width: 55%; height: 90%; object-fit: contain; }
.controller__direction { color: #ffc83d; font-size: clamp(.8rem, 2vw, 1.5rem); text-shadow: 0 1px 3px #000; }
.controller__rear-key { font-size: clamp(.6rem, 1vw, .9rem); }
.controller-panel__caption, .controller-panel__save { text-align: center; color: #aab4c4; font-size: .75rem; }
.selection { display: flex; align-items: center; gap: 1rem; padding: .75rem 1rem; border: 1px solid #6ea8ff44; border-radius: .5rem; background: #141a24; }
.selection img { width: 3rem; height: 3rem; }
.selection strong { color: #ffc83d; }
.selection p { margin: .3rem 0 0; }
.rows { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .35rem; width: 100%; }
.rows li { min-width: 0; }
.rows li:nth-last-child(-n+3) { grid-column: 1 / -1; }
.row { width: 100%; min-height: 2.6rem; align-items: center; gap: .4rem; padding: .35rem .45rem; border: 1px solid #ffffff18; border-left: 3px solid transparent; border-radius: .3rem; background: #141a24; text-align: left; font-size: .72rem; }
.row__icon { width: 2rem; height: 2rem; object-fit: contain; flex-shrink: 0; }
.row__label { flex: 1; }
.row__key { max-width: 45%; color: #cfdaea; text-align: right; overflow-wrap: anywhere; }
.row:focus-visible { outline: 2px solid #ffc83d; outline-offset: 2px; }
.row--action { justify-content: center; min-height: 2.3rem; }
.mapper__hint { text-align: center; line-height: 1.8; }
.mapper__status { min-height: 1.2rem; text-align: center; }
.modal { z-index: 2; }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
@media (max-width: 760px) {
  .mapper__layout { grid-template-columns: 1fr; gap: 1rem; max-width: 36rem; }
  .mapper { padding: 1rem; }
  .row { font-size: .8rem; }
  .controller__rear-key { font-size: .7rem; }
}

kbd {
  display: inline-block;
  min-width: 1.3rem;
  padding: 0.05rem 0.3rem;
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-bottom-width: 2px;
  border-radius: 0.25rem;
  background: rgba(255, 255, 255, 0.1);
  font-size: 0.75rem;
  text-align: center;
}
</style>
