<template>
  <div class="editor">
    <!-- Pick what to work on. -->
    <div v-if="!draft" class="start">
      <h1 class="start__title">Arena Editor</h1>

      <ul class="rows">
        <li
          v-for="(arena, index) in arenas"
          :key="arena.id"
          class="row"
          :class="{ 'row--active': index === startCursor }"
          @click="editArena(arena.id)"
          @mouseenter="startCursor = index"
        >
          <span class="row__name">{{ arena.displayName }}</span>
          <span class="row__id">{{ arena.id }}</span>
          <button class="row__clone" @click.stop="startClone(arena.id)">
            Clone
          </button>
        </li>
      </ul>

      <p v-if="!canSave" class="start__warning">
        Saving is unavailable: the editor writes arena files through the dev
        server. Run <code>npm run serve</code> to enable it.
      </p>

      <p class="start__hint">
        <kbd>&uarr;</kbd><kbd>&darr;</kbd> move &middot;
        <kbd>{{ keyFor("a") }}</kbd> edit &middot;
        <kbd>{{ keyFor("z") }}</kbd> clone &middot;
        <kbd>{{ keyFor("b") }}</kbd> back
      </p>
    </div>

    <!-- Editing. -->
    <div v-else class="work">
      <canvas ref="canvas" class="work__canvas" :data-active="previewReady" />

      <div v-if="loading" class="work__loading">Rendering&hellip;</div>

      <aside
        ref="panel"
        class="panel"
        @focusin="onPanelFocusIn"
        @pointerdown="onPanelPointerDown"
      >
        <header class="panel__head">
          <h2 class="panel__title">
            {{ creating ? "New arena" : draft.displayName }}
          </h2>
          <button class="btn btn--ghost" @click="closeDraft">Close</button>
        </header>

        <div class="panel__body">
          <!-- Identity -->
          <section class="group">
            <h3 class="group__title">Identity</h3>

            <label class="field">
              <span class="field__label">Id (filename)</span>
              <input
                v-model.trim="draft.id"
                class="field__input"
                :disabled="!creating"
                spellcheck="false"
              />
            </label>
            <p v-if="idError" class="field__error">{{ idError }}</p>
            <p v-if="!creating" class="field__note">
              Renaming an existing arena would leave the old file behind, so the
              id is fixed. Clone it to make one under a new name.
            </p>

            <label class="field">
              <span class="field__label">Display name</span>
              <input v-model="draft.displayName" class="field__input" />
            </label>

            <label class="field">
              <span class="field__label">Preview image</span>
              <select v-model="draft.previewImage" class="field__input">
                <option value="">(none)</option>
                <option v-for="p in previews" :key="p" :value="p">
                  {{ shortPath(p) }}
                </option>
              </select>
            </label>
          </section>

          <!-- Parts -->
          <section class="group">
            <h3 class="group__title">
              Parts
              <span class="group__count">{{ draft.parts.length }}</span>
            </h3>

            <div v-for="(part, index) in draft.parts" :key="index" class="part">
              <div class="part__row">
                <select v-model="part.glb" class="field__input">
                  <option v-for="g in glbs" :key="g" :value="g">
                    {{ shortPath(g) }}
                  </option>
                </select>
                <button
                  class="btn btn--icon"
                  :disabled="index === 0"
                  title="Move up"
                  @click="movePart(index, -1)"
                >
                  &uarr;
                </button>
                <button
                  class="btn btn--icon"
                  :disabled="index === draft.parts.length - 1"
                  title="Move down"
                  @click="movePart(index, 1)"
                >
                  &darr;
                </button>
                <button
                  class="btn btn--icon btn--danger"
                  title="Remove"
                  @click="removePart(index)"
                >
                  &times;
                </button>
              </div>

              <div class="part__vectors">
                <label class="vec">
                  <span class="vec__label">pos</span>
                  <input
                    v-for="axis in 3"
                    :key="`p${axis}`"
                    v-model.number="part.position[axis - 1]"
                    type="number"
                    step="0.1"
                    class="vec__input"
                  />
                </label>
                <label class="vec">
                  <span class="vec__label">rot</span>
                  <input
                    v-for="axis in 3"
                    :key="`r${axis}`"
                    v-model.number="part.rotation[axis - 1]"
                    type="number"
                    step="0.05"
                    class="vec__input"
                  />
                </label>
              </div>
            </div>

            <button class="btn" @click="addPart">Add part</button>
          </section>

          <!-- Textures, driven by the materials actually in the scene. -->
          <section v-for="map in textureGroups" :key="map.key" class="group">
            <h3 class="group__title">{{ map.title }}</h3>

            <p v-if="!map.materials.length" class="field__note">
              No materials yet &mdash; they are read from the loaded parts.
            </p>

            <label
              v-for="name in map.materials"
              :key="name"
              class="field"
            >
              <span class="field__label">{{ name }}</span>
              <select
                :value="map.model[name] ?? ''"
                class="field__input"
                @change="setTexture(map.key, name, $event)"
              >
                <option value="">(from the model)</option>
                <option v-for="t in textures" :key="t" :value="t">
                  {{ shortPath(t) }}
                </option>
              </select>
            </label>

            <!-- Colour keys are typed in the file, not found on a mesh. -->
            <label
              v-for="name in map.colorKeys"
              :key="name"
              class="field"
            >
              <span class="field__label">{{ name }}</span>
              <input
                :value="map.model[name] ?? ''"
                class="field__input"
                placeholder="rgba(0, 0, 0, 1)"
                @change="setTexture(map.key, name, $event)"
              />
            </label>

            <p v-if="map.unmatched.length" class="field__error">
              No material in the scene is named:
              {{ map.unmatched.join(", ") }}. These keys do nothing.
            </p>
          </section>
        </div>

        <p class="panel__hint">
          <template v-if="fieldEditing">
            Typing &mdash; <kbd>{{ keyFor("b") }}</kbd> to stop
          </template>
          <template v-else>
            <kbd>&uarr;</kbd><kbd>&darr;</kbd> field &middot;
            <kbd>&larr;</kbd><kbd>&rarr;</kbd> change &middot;
            <kbd>{{ keyFor("a") }}</kbd> use &middot;
            <kbd>{{ keyFor("z") }}</kbd> save &middot;
            <kbd>{{ keyFor("controlStickUp") }}</kbd
            ><kbd>{{ keyFor("controlStickLeft") }}</kbd
            ><kbd>{{ keyFor("controlStickDown") }}</kbd
            ><kbd>{{ keyFor("controlStickRight") }}</kbd> camera &middot;
            <kbd>{{ keyFor("b") }}</kbd> close
          </template>
        </p>

        <footer class="panel__foot">
          <label class="toggle">
            <input v-model="autoPreview" type="checkbox" />
            Live preview
          </label>
          <button class="btn" :disabled="loading" @click="refreshPreview">
            Refresh
          </button>
          <button
            class="btn btn--primary"
            :disabled="!canSave || !!idError || saving"
            @click="save"
          >
            {{ saving ? "Saving…" : "Save" }}
          </button>
        </footer>

        <p v-if="status" class="panel__status" :class="{ 'panel__status--bad': statusBad }">
          {{ status }}
        </p>
        <p v-if="warnings.length" class="panel__status panel__status--bad">
          {{ warnings.join(" / ") }}
        </p>
      </aside>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, markRaw } from "vue";
import { ArenaSummary, arenaById, availableArenas } from "@/data/arenas";
import {
  ArenaDraft,
  availableGlbs,
  availablePreviews,
  availableTextures,
  cloneArena,
  draftFromArena,
  draftToArenaData,
  draftToJson,
  existingIds,
  idProblem,
  isColorKey,
} from "@/data/arenaDraft";
import { saveArena, saveAvailable } from "@/data/arenaStore";
import { ArenaScene } from "@/renderer/ArenaScene";
import {
  VirtualInput,
  isMenuDown,
  isMenuUp,
  virtualInputFor,
} from "@/game/VirtualController";
import { PadControl, keysForControl } from "@/data/controls";

/** Inputs the camera responds to while the preview is up. */
const CAMERA_INPUTS = [
  "stickUp",
  "stickDown",
  "stickLeft",
  "stickRight",
  "cUp",
  "cDown",
];

/**
 * How long to wait after the last edit before re-rendering.
 *
 * A reload re-imports every GLB, and the largest arena part is over 10MB, so
 * rebuilding on each keystroke would make typing unusable. Long enough to let
 * a number be typed out, short enough to still feel like a live preview.
 */
const PREVIEW_DEBOUNCE_MS = 600;

/**
 * Where an in-progress draft is parked across a remount.
 *
 * Saving writes data/arenas/<id>.json, which Vite sees as a source change and
 * hot-updates - and a hot update remounts this component with a fresh data(),
 * discarding whatever was being edited. Rather than suppress the update (it is
 * what makes a newly saved arena appear in the list), the draft is stashed and
 * picked back up on the way in, so the reload is invisible.
 *
 * sessionStorage rather than localStorage: a draft belongs to the tab that was
 * editing it, and should not outlive the session.
 */
const DRAFT_KEY = "vpg.arenaEditor.draft";

interface TextureGroup {
  key: "arenaTextures" | "ringTextures";
  title: string;
  model: Record<string, string>;
  /** Material names found in the loaded scene. */
  materials: string[];
  /** `*Color` keys already set in the file. */
  colorKeys: string[];
  /** Keys set in the file that match no material in the scene. */
  unmatched: string[];
}

export default defineComponent({
  name: "ArenaEditor",

  emits: ["back"],

  data() {
    return {
      arenas: availableArenas() as ArenaSummary[],
      draft: null as ArenaDraft | null,
      /** The id being edited, or null while creating a new arena. */
      editingId: null as string | null,
      glbs: availableGlbs(),
      textures: availableTextures(),
      previews: availablePreviews(),
      sceneMaterials: { arena: [] as string[], ring: [] as string[] },
      canSave: false,
      saving: false,
      loading: false,
      previewReady: false,
      autoPreview: true,
      status: "",
      statusBad: false,
      warnings: [] as string[],
      scene: null as ArenaScene | null,
      loadToken: 0,
      previewTimer: 0,
      /** Cursor on the arena list. */
      startCursor: 0,
      /** Which of the panel's controls the d-pad is on. */
      focusIndex: 0,
      /** True while a text field has the keyboard to itself. */
      fieldEditing: false,
    };
  },

  computed: {
    creating(): boolean {
      return this.editingId === null;
    },

    /** Ids that would collide with this draft's. */
    takenIds(): string[] {
      const ids = existingIds();
      return this.creating ? ids : ids.filter((id) => id !== this.editingId);
    },

    idError(): string | null {
      if (!this.draft) return null;
      return idProblem(this.draft.id, this.takenIds);
    },

    textureGroups(): TextureGroup[] {
      const draft = this.draft;
      if (!draft) return [];

      const build = (
        key: "arenaTextures" | "ringTextures",
        title: string,
        materials: string[]
      ): TextureGroup => {
        const model = draft[key];
        const keys = Object.keys(model);
        return {
          key,
          title,
          model,
          materials,
          colorKeys: keys.filter(isColorKey).sort(),
          // Only meaningful once something is loaded; before that every key
          // would look unmatched simply because the scene is empty.
          unmatched: this.previewReady
            ? keys.filter((k) => !isColorKey(k) && !materials.includes(k))
            : [],
        };
      };

      return [
        build("arenaTextures", "Arena textures", this.sceneMaterials.arena),
        build("ringTextures", "Ring textures", this.sceneMaterials.ring),
      ];
    },
  },

  watch: {
    startCursor() {
      this.$nextTick(() => {
        this.$el?.querySelector?.(".row--active")?.scrollIntoView({
          block: "nearest",
        });
      });
    },

    // Deep: the panel edits nested parts and texture maps in place.
    draft: {
      deep: true,
      handler() {
        if (!this.draft) return;
        this.persistDraft();
        if (this.autoPreview) this.schedulePreview();
      },
    },
  },

  async mounted() {
    window.addEventListener("keydown", this.onKeyDown);
    this.restoreDraft();
    this.canSave = await saveAvailable();
  },

  beforeUnmount() {
    window.removeEventListener("keydown", this.onKeyDown);
    window.clearTimeout(this.previewTimer);
    this.scene?.dispose();
    this.scene = null;
  },

  methods: {
    onKeyDown(event: KeyboardEvent) {
      const input = virtualInputFor(event);

      // While a field is being typed into, the keyboard belongs to it -
      // otherwise navigation would eat the characters. Only Back leaves.
      if (this.fieldEditing) {
        if (input === "b") {
          event.preventDefault();
          this.stopFieldEditing();
        }
        return;
      }

      if (!input) return;

      if (!this.draft) return this.onStartKey(event, input);
      return this.onEditKey(event, input);
    },

    /** The arena list. Moves and selects like any other menu. */
    onStartKey(event: KeyboardEvent, input: VirtualInput) {
      if (isMenuUp(input)) {
        event.preventDefault();
        return this.moveStartCursor(-1);
      }
      if (isMenuDown(input)) {
        event.preventDefault();
        return this.moveStartCursor(1);
      }

      const arena = this.arenas[this.startCursor];
      if (input === "a" && arena) {
        event.preventDefault();
        return this.editArena(arena.id);
      }
      if (input === "z" && arena) {
        event.preventDefault();
        return this.startClone(arena.id);
      }
      if (input === "b") {
        event.preventDefault();
        return this.$emit("back");
      }
    },

    /**
     * The editing screen.
     *
     * The d-pad drives the panel and the control stick drives the camera, so
     * both are live at once and there is no mode to toggle between them.
     */
    onEditKey(event: KeyboardEvent, input: VirtualInput) {
      if (input === "b") {
        event.preventDefault();
        return this.closeDraft();
      }

      if (CAMERA_INPUTS.includes(input)) {
        event.preventDefault();
        this.scene?.moveCamera(input);
        return;
      }

      if (input === "up") {
        event.preventDefault();
        return this.moveFocus(-1);
      }
      if (input === "down") {
        event.preventDefault();
        return this.moveFocus(1);
      }
      if (input === "left") {
        event.preventDefault();
        return this.adjustFocused(-1);
      }
      if (input === "right") {
        event.preventDefault();
        return this.adjustFocused(1);
      }
      if (input === "a") {
        event.preventDefault();
        return this.activateFocused();
      }
      if (input === "z") {
        event.preventDefault();
        return void this.save();
      }
    },

    /** The key currently bound to a pad control, for the on-screen hints. */
    keyFor(control: PadControl): string {
      const [code] = keysForControl(control);
      if (!code) return "unbound";
      if (code.startsWith("Key")) return code.slice(3);
      if (code.startsWith("Digit")) return code.slice(5);
      if (code.startsWith("Arrow")) return code.slice(5);
      return code;
    },

    /**
     * Puts the d-pad on the panel's first editable control as a draft opens.
     *
     * The header's Close button is focusable and comes first in the DOM, but
     * opening the editor with the cursor on Close would be a strange place to
     * start, so the body's first control gets it instead.
     */
    beginEditing() {
      this.fieldEditing = false;
      this.focusIndex = 0;
      this.$nextTick(() => {
        const items = this.panelFocusables();
        const body = this.$el?.querySelector?.(".panel__body");
        const first = items.findIndex((el) => body?.contains(el));
        this.focusAt(first >= 0 ? first : 0, items);
      });
    },

    moveStartCursor(delta: number) {
      const count = this.arenas.length;
      if (!count) return;
      this.startCursor = (this.startCursor + delta + count) % count;
    },

    /**
     * The panel's controls, in the order they appear.
     *
     * Read from the DOM rather than mirrored in a list here: the panel grows
     * and shrinks as parts and materials come and go, and a parallel list
     * would drift out of step with the template that actually renders them.
     */
    panelFocusables(): HTMLElement[] {
      const panel = this.$refs.panel as HTMLElement | undefined;
      if (!panel) return [];
      return [
        ...panel.querySelectorAll<HTMLElement>("input, select, button"),
      ].filter((el) => !(el as HTMLInputElement).disabled && el.offsetParent);
    },

    moveFocus(delta: number) {
      const items = this.panelFocusables();
      if (!items.length) return;
      const next = (this.focusIndex + delta + items.length) % items.length;
      this.focusAt(next, items);
    },

    focusAt(index: number, items?: HTMLElement[]) {
      const list = items ?? this.panelFocusables();
      const el = list[index];
      if (!el) return;
      this.focusIndex = index;
      el.focus({ preventScroll: true });
      el.scrollIntoView({ block: "nearest" });
    },

    /** Left/right on the focused control, so values change without a mouse. */
    adjustFocused(delta: number) {
      const el = this.panelFocusables()[this.focusIndex];
      if (!el) return;

      if (el instanceof HTMLSelectElement) {
        const next = el.selectedIndex + delta;
        if (next < 0 || next >= el.options.length) return;
        el.selectedIndex = next;
        // v-model and @change listen for the event, not the assignment.
        el.dispatchEvent(new Event("change", { bubbles: true }));
        return;
      }

      if (el instanceof HTMLInputElement) {
        if (el.type === "checkbox") {
          el.checked = !el.checked;
          el.dispatchEvent(new Event("change", { bubbles: true }));
          return;
        }
        if (el.type === "number") {
          const step = Number(el.step) || 1;
          const value = (Number(el.value) || 0) + step * delta;
          // Trimmed to the step's own precision, so repeated presses do not
          // accumulate floating-point noise into the saved file.
          el.value = String(Number(value.toFixed(4)));
          el.dispatchEvent(new Event("input", { bubbles: true }));
          return;
        }
      }
    },

    /** A on the focused control: press it, or start typing into it. */
    activateFocused() {
      const el = this.panelFocusables()[this.focusIndex];
      if (!el) return;

      if (el instanceof HTMLButtonElement) return el.click();

      if (el instanceof HTMLInputElement) {
        if (el.type === "checkbox") {
          el.checked = !el.checked;
          el.dispatchEvent(new Event("change", { bubbles: true }));
          return;
        }
        // Text and number fields need real characters, so hand the keyboard
        // over until Back gives it back.
        this.startFieldEditing(el);
      }
    },

    startFieldEditing(el: HTMLInputElement) {
      this.fieldEditing = true;
      el.focus({ preventScroll: true });
      el.select();
    },

    stopFieldEditing() {
      this.fieldEditing = false;
      const el = this.panelFocusables()[this.focusIndex];
      el?.focus({ preventScroll: true });
    },

    /**
     * Keeps the cursor wherever focus lands, so the pad and the mouse agree.
     *
     * Only the cursor: moving onto a text field must not start typing into it,
     * or navigating past one would trap the keyboard in the first field it
     * touched. Typing begins deliberately - A, or a click.
     */
    onPanelFocusIn(event: FocusEvent) {
      const el = event.target as HTMLElement | null;
      if (!el) return;
      const index = this.panelFocusables().indexOf(el);
      if (index >= 0) this.focusIndex = index;
    },

    /** A click into a text field is an intent to type, unlike arriving there. */
    onPanelPointerDown(event: PointerEvent) {
      const el = event.target as HTMLElement | null;
      if (
        el instanceof HTMLInputElement &&
        (el.type === "text" || el.type === "number")
      ) {
        this.fieldEditing = true;
      }
    },

    shortPath(path: string): string {
      return path.replace(/^assets\/(glb|textures)\//, "");
    },

    editArena(id: string) {
      const arena = arenaById(id);
      if (!arena) return;
      this.editingId = id;
      this.draft = draftFromArena(arena);
      this.beginEditing();
      this.openPreview();
    },

    startClone(id: string) {
      const source = arenaById(id);
      if (!source) return;
      // Suggested rather than final - the id field is editable while creating,
      // and the save is blocked until it is both valid and free.
      const suggested = `${id}_copy`;
      this.editingId = null;
      this.draft = cloneArena(source, suggested, `${source.displayName} copy`);
      this.beginEditing();
      this.openPreview();
    },

    closeDraft() {
      this.clearPersistedDraft();
      window.clearTimeout(this.previewTimer);
      this.loadToken += 1;
      this.scene?.dispose();
      this.scene = null;
      this.draft = null;
      this.editingId = null;
      this.previewReady = false;
      this.loading = false;
      this.status = "";
      this.warnings = [];
      this.sceneMaterials = { arena: [], ring: [] };
    },

    addPart() {
      this.draft?.parts.push({
        glb: this.glbs[0] ?? "",
        position: [0, 0, 0],
        rotation: [0, 0, 0],
      });
    },

    removePart(index: number) {
      this.draft?.parts.splice(index, 1);
    },

    movePart(index: number, delta: number) {
      const parts = this.draft?.parts;
      if (!parts) return;
      const next = index + delta;
      if (next < 0 || next >= parts.length) return;
      const [part] = parts.splice(index, 1);
      parts.splice(next, 0, part);
    },

    setTexture(
      group: "arenaTextures" | "ringTextures",
      name: string,
      event: Event
    ) {
      const draft = this.draft;
      if (!draft) return;
      const value = (event.target as HTMLInputElement | HTMLSelectElement).value;
      if (value) {
        draft[group][name] = value;
      } else {
        // Removing the key leaves the GLB's own texture in place, which is a
        // different outcome from setting it to an empty string.
        delete draft[group][name];
      }
    },

    schedulePreview() {
      window.clearTimeout(this.previewTimer);
      this.previewTimer = window.setTimeout(
        () => void this.openPreview(),
        PREVIEW_DEBOUNCE_MS
      );
    },

    refreshPreview() {
      window.clearTimeout(this.previewTimer);
      void this.openPreview();
    },

    async openPreview() {
      const draft = this.draft;
      if (!draft) return;

      const token = ++this.loadToken;
      this.loading = true;
      this.warnings = [];
      await this.$nextTick();

      try {
        if (!this.scene) {
          const canvas = this.$refs.canvas as HTMLCanvasElement | undefined;
          if (!canvas) return;
          this.scene = markRaw(new ArenaScene(canvas));
        }

        const report = await this.scene.load(draftToArenaData(draft));
        if (token !== this.loadToken) return;

        this.warnings = report.warnings;
        this.sceneMaterials = this.scene.materialNames();
        this.previewReady = true;
      } catch (error) {
        if (token !== this.loadToken) return;
        this.previewReady = false;
        this.setStatus(`Preview failed: ${String(error)}`, true);
      } finally {
        if (token === this.loadToken) this.loading = false;
      }
    },

    async save() {
      const draft = this.draft;
      if (!draft || this.idError) return;

      this.saving = true;
      try {
        const result = await saveArena(draftToJson(draft));
        this.setStatus(`${result.created ? "Created" : "Saved"} ${result.path}`, false);
        // The file now exists, so this is no longer a new arena: fixing the id
        // stops a second save from writing a duplicate under another name. The
        // hot update that follows the write reloads the registry, so the new
        // arena is already in the lists by the time this is read.
        if (result.created) this.editingId = draft.id;
      } catch (error) {
        this.setStatus(String(error instanceof Error ? error.message : error), true);
      } finally {
        this.saving = false;
      }
    },

    setStatus(message: string, bad: boolean) {
      this.status = message;
      this.statusBad = bad;
      this.persistDraft();
    },

    /** Parks the draft so a hot update does not lose it. */
    persistDraft() {
      if (!this.draft) return;
      try {
        sessionStorage.setItem(
          DRAFT_KEY,
          JSON.stringify({
            editingId: this.editingId,
            draft: this.draft,
            status: this.status,
            statusBad: this.statusBad,
          })
        );
      } catch {
        // Private browsing, or storage full. Losing the parked copy only
        // costs the reload-survival, so there is nothing to report.
      }
    },

    clearPersistedDraft() {
      try {
        sessionStorage.removeItem(DRAFT_KEY);
      } catch {
        // See persistDraft.
      }
    },

    /** Picks a parked draft back up, if this mount followed a hot update. */
    restoreDraft() {
      let parked: string | null;
      try {
        parked = sessionStorage.getItem(DRAFT_KEY);
      } catch {
        return;
      }
      if (!parked) return;

      try {
        const saved = JSON.parse(parked);
        if (!saved?.draft) return;
        this.draft = saved.draft as ArenaDraft;
        this.editingId = saved.editingId ?? null;
        this.status = saved.status ?? "";
        this.statusBad = !!saved.statusBad;
        this.beginEditing();
        void this.openPreview();
      } catch {
        // A draft written by an older build. Dropping it is better than
        // failing to open the editor at all.
        this.clearPersistedDraft();
      }
    },
  },
});
</script>

<style scoped>
.editor {
  position: absolute;
  inset: 0;
  background: #0b0e14;
  color: #f2f5f8;
  font-family: var(--vpg-font-body);
  overflow: hidden;
}

/* --- start screen --------------------------------------------------------- */

.start {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 3vh 4vw;
  overflow-y: auto;
}

.start__title {
  margin: 0 0 2vh;
  font-family: var(--vpg-font-display);
  font-size: clamp(28px, 3.4vw, 44px);
  letter-spacing: 0.04em;
}

.rows {
  list-style: none;
  margin: 0;
  padding: 0;
  width: min(640px, 100%);
}

.row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  border: var(--vpg-frame-width) solid rgba(255, 255, 255, 0.18);
  border-radius: 4px;
  margin-bottom: 6px;
  cursor: pointer;
  transition: background var(--vpg-state-transition);
}

.row:hover,
.row--active {
  background: var(--vpg-panel-bg);
}

.row--active {
  border-color: var(--vpg-panel-glow);
}

.row__name {
  flex: 1;
  font-size: 18px;
}

.row__id {
  font-size: 13px;
  opacity: 0.55;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}

.start__hint,
.start__warning {
  margin-top: 2vh;
  font-size: 14px;
  opacity: 0.75;
  text-align: center;
  max-width: 60ch;
}

.start__warning {
  color: #f6b26b;
  opacity: 1;
}

/* --- editing -------------------------------------------------------------- */

.work {
  position: absolute;
  inset: 0;
  display: grid;
  grid-template-columns: 1fr minmax(320px, 30vw);
}

.work__canvas {
  width: 100%;
  height: 100%;
  display: block;
  outline: none;
  background: #0d0d14;
}

.work__loading {
  position: absolute;
  top: 12px;
  left: 16px;
  padding: 4px 10px;
  border-radius: 3px;
  background: rgba(0, 0, 0, 0.6);
  font-size: 13px;
}

.panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
  border-left: var(--vpg-frame-width) solid var(--vpg-frame-color);
  background: #11151f;
}

.panel__head,
.panel__foot {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.12);
}

.panel__foot {
  border-bottom: none;
  border-top: 1px solid rgba(255, 255, 255, 0.12);
}

.panel__title {
  flex: 1;
  margin: 0;
  font-size: 16px;
  font-family: var(--vpg-font-display);
  letter-spacing: 0.03em;
}

.panel__body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 12px;
}

.panel__status {
  padding: 8px 12px;
  font-size: 13px;
  border-top: 1px solid rgba(255, 255, 255, 0.12);
  color: #9fd8a3;
}

.panel__status--bad {
  color: #f18a8a;
}

.group {
  margin-bottom: 18px;
}

.group__title {
  margin: 0 0 8px;
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  opacity: 0.7;
}

.group__count {
  opacity: 0.6;
}

.field {
  display: block;
  margin-bottom: 8px;
}

.field__label {
  display: block;
  font-size: 12px;
  opacity: 0.7;
  margin-bottom: 3px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  word-break: break-all;
}

.field__input {
  width: 100%;
  box-sizing: border-box;
  padding: 5px 7px;
  font: inherit;
  font-size: 13px;
  color: inherit;
  background: #070a10;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 3px;
}

.field__input:disabled {
  opacity: 0.5;
}

/* The d-pad moves focus through the panel, so where it currently sits has to
   be obvious - the browser default outline is too quiet against this panel. */
.panel :focus-visible,
.panel input:focus,
.panel select:focus,
.panel button:focus {
  outline: 2px solid var(--vpg-panel-glow);
  outline-offset: 1px;
}

.panel__hint {
  margin: 0;
  padding: 6px 12px;
  font-size: 12px;
  opacity: 0.7;
  border-top: 1px solid rgba(255, 255, 255, 0.12);
}

.field__error {
  margin: 2px 0 8px;
  font-size: 12px;
  color: #f18a8a;
}

.field__note {
  margin: 2px 0 8px;
  font-size: 12px;
  opacity: 0.6;
}

.part {
  padding: 8px;
  margin-bottom: 8px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 4px;
}

.part__row {
  display: flex;
  gap: 4px;
  align-items: center;
}

.part__vectors {
  display: flex;
  gap: 8px;
  margin-top: 6px;
}

.vec {
  display: flex;
  align-items: center;
  gap: 3px;
}

.vec__label {
  font-size: 11px;
  opacity: 0.6;
  width: 22px;
}

.vec__input {
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  padding: 3px 4px;
  font: inherit;
  font-size: 12px;
  color: inherit;
  background: #070a10;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 3px;
}

.btn {
  padding: 5px 10px;
  font: inherit;
  font-size: 13px;
  color: inherit;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.24);
  border-radius: 3px;
  cursor: pointer;
  transition: background var(--vpg-state-transition);
}

.btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.16);
}

.btn:disabled {
  opacity: 0.4;
  cursor: default;
}

.btn--primary {
  background: var(--vpg-heading-bg);
  border-color: var(--vpg-panel-glow);
}

.btn--ghost {
  background: transparent;
}

.btn--icon {
  padding: 4px 7px;
  line-height: 1;
}

.btn--danger:hover:not(:disabled) {
  background: rgba(200, 60, 60, 0.35);
}

.row__clone {
  padding: 3px 9px;
  font: inherit;
  font-size: 12px;
  color: inherit;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.24);
  border-radius: 3px;
  cursor: pointer;
}

.toggle {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 13px;
  opacity: 0.8;
}

kbd {
  padding: 1px 5px;
  border: 1px solid rgba(255, 255, 255, 0.35);
  border-radius: 3px;
  font-size: 12px;
}

code {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  background: rgba(255, 255, 255, 0.1);
  padding: 1px 4px;
  border-radius: 3px;
}
</style>
