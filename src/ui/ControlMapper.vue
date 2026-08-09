<template>
  <div class="mapper">
    <h1 class="mapper__title">Controls</h1>
    <p class="mapper__hint">
      <template v-if="listeningFor">
        Press a key for <strong>{{ label(listeningFor) }}</strong
        >&hellip; <kbd>Esc</kbd> cancels.
      </template>
      <template v-else>
        <kbd>&uarr;</kbd><kbd>&darr;</kbd> move &middot; <kbd>Enter</kbd> rebind
        &middot; <kbd>Esc</kbd> back
      </template>
    </p>

    <ul class="rows">
      <li
        v-for="(row, index) in rows"
        :key="row.key"
        class="row"
        :class="{
          'row--active': index === cursor,
          'row--action': row.kind === 'action',
          'row--listening': row.kind === 'binding' && listeningFor === row.control,
        }"
        @click="activate(index)"
      >
        <span class="row__label">{{ row.label }}</span>
        <span v-if="row.kind === 'binding'" class="row__key">
          {{
            listeningFor === row.control
              ? "press a key"
              : keyLabel(row.control)
          }}
        </span>
      </li>
    </ul>

    <p v-if="status" class="mapper__status">{{ status }}</p>

    <!-- Conflict confirmation. -->
    <div v-if="conflict" class="modal">
      <div class="modal__box">
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
      cursor: 0,
      listeningFor: null as PadControl | null,
      conflict: null as Conflict | null,
      status: "",
      /** Bumped to force the key column to re-read the mapping after a bind. */
      revision: 0,
    };
  },

  computed: {
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
    // The row list is taller than the viewport, so the cursor has to drag the
    // page with it or it walks off the bottom of the screen.
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
      event.preventDefault();

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
        return;
      }

      const control = this.listeningFor!;
      const owner = conflictFor(control, code);
      if (owner) {
        this.conflict = { control, code, owner };
        this.listeningFor = null;
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
      if (input === "b") return this.$emit("back");
      // Left and right deliberately do nothing here, matching the menus.
    },

    move(delta: number) {
      const count = this.rows.length;
      this.cursor = (this.cursor + delta + count) % count;
      this.status = "";
    },

    activate(index: number) {
      this.cursor = index;
      const row = this.rows[index];

      if (row.kind === "binding") {
        this.listeningFor = row.control;
        this.status = "";
        return;
      }

      if (row.action === "back") return this.$emit("back");
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
    },

    reset() {
      resetBindings();
      this.revision += 1;
      this.status = "Bindings restored to defaults.";
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
  padding: 2rem 1rem;
  box-sizing: border-box;
  overflow-y: auto;
  background: #0b0e14;
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
