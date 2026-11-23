<template>
  <div ref="root" class="session-ended">
    <h1>Session ended</h1>
    <p>Your changes are saved{{ saves.status.mode === 'persistent' ? ' in this browser' : ' only in any backup you downloaded' }}. You can close this tab.</p>
    <button @click="emit('resume')">Return to Main Menu</button>
  </div>
</template>

<script setup lang="ts">
/**
 * Where Exit lands. A page cannot close the tab it is in, so this is a resting
 * screen: everything is flushed, and the only way on is back to the menu.
 */
import { ref } from "vue";
import { saves } from "@/data/save/runtime";
import { useMenuForm } from "./menuForm";

const emit = defineEmits<{ resume: [] }>();
const root = ref<HTMLElement | null>(null);
// B returns as well, so a pad user is never stranded here.
useMenuForm(root, () => emit("resume"));
</script>

<style scoped>
.session-ended { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1rem; padding: 2rem; background: #0b0e14; color: #f2f5f8; text-align: center; }
button { background: #202938; color: inherit; border: 1px solid #e4c28f; padding: .7rem 1rem; border-radius: .3rem; font: inherit; cursor: pointer; }
button:focus-visible { outline: 3px solid #e4c28f; outline-offset: 4px; }
</style>
