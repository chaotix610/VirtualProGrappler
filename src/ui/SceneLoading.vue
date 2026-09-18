<template>
  <div class="scene-loading" :style="{ background }">
    <p class="scene-loading__label">Loading…</p>
  </div>
</template>

<script lang="ts">
import { defineComponent } from "vue";

/**
 * Placeholder shown while a renderer screen's chunk downloads.
 *
 * Babylon is fetched on demand rather than bundled with the menu, so there is
 * a gap between the keypress and the first frame that the menu itself used to
 * cover. This fills it. It deliberately pulls in nothing but the shared
 * tokens: anything it imported would land back in the menu's chunk and undo
 * the split it exists to support.
 */
export default defineComponent({
  name: "SceneLoading",

  props: {
    /**
     * The clear colour of the scene being loaded, so handing over to the live
     * canvas does not flash a different background. Each renderer sets its
     * own, so the caller passes the one it is waiting for.
     */
    background: {
      type: String,
      default: "#0d0d14",
    },
  },
});
</script>

<style scoped>
.scene-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
}

.scene-loading__label {
  margin: 0;
  font-family: var(--vpg-font-display);
  font-size: var(--vpg-item-size);
  color: var(--vpg-item-color-idle);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  animation: scene-loading-pulse 1.2s ease-in-out infinite;
}

@keyframes scene-loading-pulse {
  0%,
  100% {
    opacity: 0.45;
  }
  50% {
    opacity: 1;
  }
}

/* A pulsing label is decoration, not information - hold it steady for anyone
   who has asked the system to reduce motion. */
@media (prefers-reduced-motion: reduce) {
  .scene-loading__label {
    animation: none;
    opacity: 1;
  }
}
</style>
