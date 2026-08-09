<template>
  <div class="menu" :style="backgroundStyle">
    <ControlMapper v-if="mapperOpen" @back="closeMapper" />
    <ArenaViewer v-else-if="arenaViewerOpen" @back="closeArenaViewer" />

    <template v-else>
      <img
        v-if="heading"
        class="menu__heading"
        :src="heading"
        :alt="page.displayName"
      />
      <h1 v-else class="menu__heading-text">{{ page.displayName }}</h1>

      <ul class="items">
        <li
          v-for="(item, index) in page.menuItems"
          :key="item.id"
          class="item"
          :class="{ 'item--active': index === cursor }"
          @click="select(index)"
          @mouseenter="cursor = index"
        >
          {{ item.displayName }}
        </li>
      </ul>

      <p class="menu__hint">
        <kbd>&uarr;</kbd><kbd>&darr;</kbd> move &middot; <kbd>Enter</kbd> select
        &middot; <kbd>Z</kbd> info
        <template v-if="canGoBack"> &middot; <kbd>Esc</kbd> back</template>
      </p>

      <p v-if="status" class="menu__status">{{ status }}</p>

      <!-- Instructions panel, toggled with Z. -->
      <div v-if="showInstructions && active" class="modal" @click="showInstructions = false">
        <div class="modal__box" @click.stop>
          <h2 class="modal__title">{{ active.instructions.title }}</h2>
          <template v-for="(block, i) in active.instructions.blocks" :key="i">
            <p v-if="block.type === 'paragraph'" class="modal__paragraph">
              {{ block.text }}
            </p>
            <dl v-else class="modal__list">
              <template v-for="entry in block.items" :key="entry.term">
                <dt>{{ entry.term }}</dt>
                <dd>{{ entry.definition }}</dd>
              </template>
            </dl>
          </template>
          <p class="modal__close"><kbd>Z</kbd> or <kbd>Esc</kbd> to close</p>
        </div>
      </div>
    </template>
  </div>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import {
  MenuItem,
  MenuPage,
  ROOT_PAGE,
  headingUrl,
  pageByKey,
  resolveTarget,
} from "@/data/mainMenu";
import { resolveAsset } from "@/data/assets";
import { isMenuDown, isMenuUp, virtualInputFor } from "@/game/VirtualController";
import ControlMapper from "./ControlMapper.vue";
import ArenaViewer from "./ArenaViewer.vue";

/** Routes the menu knows how to open. Everything else is not built yet. */
const ROUTE_CONTROLS = "commissioner.controls";
const ROUTE_ARENA_VIEWER = "commissioner.arena_viewer";
const ROUTE_COMBAT_TEST = "test.combat_system";

export default defineComponent({
  name: "MainMenu",

  components: { ControlMapper, ArenaViewer },

  emits: ["launch"],

  data() {
    return {
      /** Page history; the last entry is what is on screen. */
      stack: [ROOT_PAGE] as string[],
      cursor: 0,
      showInstructions: false,
      mapperOpen: false,
      arenaViewerOpen: false,
      status: "",
    };
  },

  computed: {
    page(): MenuPage {
      // Every key on the stack was resolved before being pushed.
      return pageByKey(this.stack[this.stack.length - 1])!;
    },

    active(): MenuItem | null {
      return this.page.menuItems[this.cursor] ?? null;
    },

    heading(): string | null {
      return headingUrl(this.page);
    },

    canGoBack(): boolean {
      return this.stack.length > 1;
    },

    backgroundStyle(): Record<string, string> {
      const url = resolveAsset("assets/artwork/mainbg.jpg");
      return url ? { backgroundImage: `url(${url})` } : {};
    },
  },

  mounted() {
    window.addEventListener("keydown", this.onKeyDown);
  },

  beforeUnmount() {
    window.removeEventListener("keydown", this.onKeyDown);
  },

  methods: {
    onKeyDown(event: KeyboardEvent) {
      // The mapper and the arena viewer run their own handlers while open.
      if (this.mapperOpen || this.arenaViewerOpen) return;

      const input = virtualInputFor(event);
      if (!input) return;
      event.preventDefault();

      if (this.showInstructions) {
        if (input === "z" || input === "b") this.showInstructions = false;
        return;
      }

      if (isMenuUp(input)) return this.move(-1);
      if (isMenuDown(input)) return this.move(1);
      if (input === "a") return this.select(this.cursor);
      if (input === "b") return this.back();
      if (input === "z") return this.toggleInstructions();
      // Left and right are inert: this menu is a stack of pages, not a
      // carousel, so they must not change page.
    },

    move(delta: number) {
      const count = this.page.menuItems.length;
      this.cursor = (this.cursor + delta + count) % count;
      this.status = "";
    },

    toggleInstructions() {
      if (this.active) this.showInstructions = !this.showInstructions;
    },

    select(index: number) {
      this.cursor = index;
      const item = this.page.menuItems[index];
      if (!item) return;

      this.status = "";
      const target = resolveTarget(item.target);

      if (target.kind === "page") {
        this.stack.push(target.key);
        this.cursor = 0;
        return;
      }

      if (target.id === ROUTE_CONTROLS) {
        this.mapperOpen = true;
        return;
      }

      if (target.id === ROUTE_ARENA_VIEWER) {
        this.arenaViewerOpen = true;
        return;
      }

      if (target.id === ROUTE_COMBAT_TEST) {
        this.$emit("launch", target.id);
        return;
      }

      this.status = `${item.displayName} is not implemented yet.`;
    },

    back() {
      if (!this.canGoBack) return;
      this.stack.pop();
      this.cursor = 0;
      this.status = "";
    },

    closeMapper() {
      this.mapperOpen = false;
      this.status = "";
    },

    closeArenaViewer() {
      this.arenaViewerOpen = false;
      this.status = "";
    },
  },
});
</script>

<style scoped>
.menu {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1.25rem;
  padding: 2rem 1rem;
  box-sizing: border-box;
  overflow: hidden;
  background-color: #0b0e14;
  background-size: cover;
  background-position: center;
  color: #f2f5f8;
  font-family: var(--vpg-font-body);
}

.menu__heading {
  max-width: min(80%, 26rem);
  height: auto;
  image-rendering: auto;
}

.menu__heading-text {
  margin: 0;
  font-family: var(--vpg-font-display);
  font-size: clamp(1.6rem, 5vw, 2.6rem);
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.items {
  margin: 0;
  padding: 0;
  list-style: none;
  text-align: center;
}

.item {
  color: var(--vpg-item-color-idle);
  letter-spacing: -2px;
  /* Deliberately far tighter than the type size, which is what stacks the
     items the way the original menus do. */
  line-height: 18px !important;
  -webkit-text-stroke-width: 0.5px;
  -webkit-text-stroke-color: var(--vpg-item-stroke);
  padding: 10px 20px;
  font-family: var(--vpg-font-menu-item);
  font-size: var(--vpg-item-size);
  font-weight: 700;
  text-decoration: none;
  position: relative;
  background: transparent;
  border: none;
  cursor: pointer;
  margin: 4px;
  transition: -webkit-text-fill-color var(--vpg-state-transition),
    -webkit-text-stroke-width var(--vpg-state-transition);
}

/* The cursor and the mouse land on the same state: the menu already moves its
   cursor on hover, and :focus-visible covers tabbing in. */
.item--active,
.item:hover,
.item:focus-visible {
  -webkit-text-fill-color: var(--vpg-item-color-active);
  -webkit-text-stroke-width: 2px;
  animation: glowPulse 1s ease-in-out infinite;
}

.menu__hint {
  margin: 0;
  font-size: 0.8rem;
  opacity: 0.6;
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.9);
}

.menu__status {
  margin: 0;
  color: #ffc83d;
  font-size: 0.85rem;
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.9);
}

.modal {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(6, 8, 12, 0.82);
}

.modal__box {
  width: min(90%, 32rem);
  max-height: 80vh;
  overflow-y: auto;
  padding: 1.5rem;
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 0.5rem;
  background: #141a24;
}

.modal__title {
  margin: 0 0 0.9rem;
  font-family: var(--vpg-font-body);
  font-size: 1.2rem;
  letter-spacing: 0.08em;
  color: var(--vpg-item-color-active);
}

.modal__paragraph {
  margin: 0 0 0.8rem;
  font-size: 0.88rem;
  line-height: 1.55;
}

.modal__list {
  margin: 0 0 0.8rem;
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.3rem 1rem;
  font-size: 0.88rem;
}

.modal__list dt {
  font-weight: 600;
}

.modal__list dd {
  margin: 0;
  opacity: 0.8;
}

.modal__close {
  margin: 0.5rem 0 0;
  font-size: 0.75rem;
  opacity: 0.6;
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
