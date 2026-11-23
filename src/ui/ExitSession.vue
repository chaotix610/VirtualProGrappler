<template>
  <div ref="root" class="exit-session">
    <h1>Exit</h1>
    <p v-if="busy">Saving…</p>
    <template v-else-if="error">
      <p role="alert">{{ error }}</p>
      <button @click="prepare">Retry Saving</button>
      <button @click="backup(false)">Download Backup of Current Changes</button>
      <button @click="emit('cancel')">Return to Game</button>
      <p v-if="notice">{{ notice }}</p>
    </template>
    <template v-else>
      <p>{{ saves.status.mode === 'persistent' ? 'Your changes are saved in this browser. Download a backup before leaving?' : 'This is a temporary session. Download a backup before leaving?' }}</p>
      <button @click="backup(true)">Download Backup</button>
      <button @click="emit('exit')">Continue Without Backup</button>
      <button @click="emit('cancel')">Cancel</button>
    </template>
  </div>
</template>
<script setup lang="ts">
import { onMounted, ref } from "vue";
import { saves, downloadBackup } from "@/data/save/runtime";
import { useMenuForm } from "./menuForm";
const emit = defineEmits<{ exit: []; cancel: [] }>();
const root = ref<HTMLElement | null>(null), busy = ref(true), error = ref(""), notice = ref("");
useMenuForm(root, () => { if (!busy.value) emit("cancel"); });
async function prepare() {
  busy.value = true; error.value = "";
  try {
    await saves.flush();
    if (!saves.needsBackup || !saves.effectiveSettings.preferences.remindOnExit) emit("exit");
  } catch (reason) { error.value = `Local changes could not be saved: ${String(reason)}`; }
  finally { busy.value = false; }
}
async function backup(exit: boolean) {
  busy.value = true;
  try { await downloadBackup(); notice.value = "Backup download requested. Check that you retained the file."; if (exit) emit("exit"); }
  catch (reason) { error.value = String(reason); }
  finally { busy.value = false; }
}
onMounted(prepare);
</script>
<style scoped>
.exit-session { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1rem; padding: 2rem; background: #0b0e14; color: #f2f5f8; text-align: center; }
button { background: #202938; color: inherit; border: 1px solid #e4c28f; padding: .7rem 1rem; border-radius: .3rem; font: inherit; cursor: pointer; } button:focus-visible { outline: 3px solid #e4c28f; outline-offset: 4px; }
</style>
