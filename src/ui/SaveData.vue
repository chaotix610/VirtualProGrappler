<template>
  <div ref="root" class="save-data">
    <header><h1>Save Data</h1><button @click="back">Back</button></header>
    <p role="status">{{ modeLabel }} · {{ saves.status.pending ? 'Saving…' : saves.status.unsaved ? 'Changes waiting to save' : saves.status.mode === 'persistent' ? 'Saved in this browser' : 'Kept for this session' }}</p>
    <p v-if="saves.status.reason" class="warning">{{ saves.status.reason }}</p>
    <p v-if="saves.status.error" class="warning" role="alert">{{ saves.status.error }} <button :disabled="busy" @click="retry">Retry saving</button></p>
    <p v-if="notice" role="status">{{ notice }}</p>

    <section>
      <h2>Local saves</h2>
      <label>Selected save <select :value="active.id" :disabled="busy" @change="switchSave"><option v-for="save in workspace.saves" :key="save.id" :value="save.id">{{ save.name }}</option></select></label>
      <label>Save name <input v-model="saveName" maxlength="160" :disabled="busy" /></label>
      <div class="actions">
        <button :disabled="busy || !saveName.trim()" @click="rename">Rename</button>
        <button :disabled="busy || !saveName.trim() || workspace.saves.length >= LIMITS.saves" @click="create">Create New Save</button>
        <button :disabled="busy || workspace.saves.length < 2" @click="confirmDelete = true">Delete Selected Save…</button>
      </div>
      <div v-if="confirmDelete" class="confirmation" role="group" aria-label="Confirm save deletion">
        <p>Delete “{{ active.name }}” and everything kept in it? This cannot be undone, so download a backup first if you might want it back.</p>
        <button :disabled="busy" @click="deleteSave">Delete Save</button>
        <button @click="confirmDelete = false">Cancel</button>
      </div>
    </section>

    <section>
      <h2>Portable backup</h2>
      <p>Downloads the selected save as one <code>.vpg</code> file: its custom arenas, every imported image (unused ones too), any unfinished arena draft, and a copy of your controls, audio and backup-reminder settings. Bundled game assets stay with the game.</p>
      <p>{{ saves.needsBackup ? 'Changes since the last backup download request.' : 'No changes since the last backup download request.' }}</p>
      <p v-if="active.lastBackup">Last download requested: {{ new Date(active.lastBackup.attemptedAt).toLocaleString() }}. Check that you retained the file.</p>
      <div class="actions">
        <button :disabled="busy" @click="run(backup)">Download Backup</button>
        <button :disabled="busy" @click="picker?.click()">Restore Backup…</button>
        <input ref="picker" type="file" accept=".vpg,application/zip" hidden @change="stageBackup" />
      </div>
      <p>Restore accepts backups up to 80 MiB with at most 192 files: JSON entries up to 64 KiB each (8 MiB in total) and up to 64 images of 4 MiB each (64 MiB in total).</p>
      <div v-if="staged" class="confirmation" role="group" aria-label="Restore backup">
        <h3>Restore “{{ staged.snapshot.save.name }}”</h3>
        <p>{{ staged.snapshot.save.arenas.length }} custom arenas, {{ staged.snapshot.save.images.length }} imported images ({{ formatBytes(libraryBytes(staged.snapshot.save.images)) }}) and {{ staged.snapshot.save.drafts.length }} recovery drafts. Exported {{ new Date(staged.manifest.exportedAt).toLocaleString() }}.</p>
        <label>Destination <select v-model="replace"><option :value="false">New local save (recommended)</option><option :value="true">Replace “{{ active.name }}”</option></select></label>
        <label><input v-model="restoreSettings" type="checkbox" /> Also restore global controls, audio and backup reminders</label>
        <p v-if="replace" class="warning">Replacing removes everything currently in this save.</p>
        <button :disabled="busy" @click="run(restore)">Restore Backup</button>
        <button :disabled="busy" @click="staged = null">Cancel Restore</button>
      </div>
      <label><input :checked="saves.effectiveSettings.preferences.remindOnExit" type="checkbox" @change="setReminder" /> Remind me to back up on Exit</label>
    </section>

    <section>
      <h2>Custom arenas</h2>
      <p v-if="!active.arenas.length">No custom arenas in this save. Clone an arena in Commissioner -> Arena Editor to make one.</p>
      <ul class="arenas">
        <li v-for="arena in active.arenas" :key="arena.id">
          <span>{{ arena.displayName }} <span class="muted">({{ arena.id }})</span></span>
          <button :disabled="busy" @click="deleteArenaId = arena.id">Delete…</button>
        </li>
      </ul>
      <div v-if="deleteArenaId" class="confirmation" role="group" aria-label="Confirm arena deletion">
        <p>Delete custom arena “{{ deleteArenaName }}” from this save? Its unfinished editor draft goes with it. This cannot be undone without a backup.</p>
        <button :disabled="busy" @click="deleteArena">Delete Arena</button>
        <button @click="deleteArenaId = null">Cancel</button>
      </div>
    </section>

    <section>
      <h2>Imported images</h2>
      <p>{{ active.images.length }} of {{ LIMITS.images }} images, {{ formatBytes(libraryBytes(active.images)) }} of 64 MiB. Imports accept PNG and JPEG. Each is re-encoded: its orientation is applied, metadata such as location is removed, and anything over 2048 px per side or 4 MiB is scaled down.</p>
      <div class="actions">
        <button :disabled="busy" @click="imagePicker?.click()">Import Image…</button>
        <input ref="imagePicker" type="file" accept="image/png,image/jpeg" hidden @change="importImage" />
      </div>
      <p v-if="!active.images.length">No imported images in this save. Import them here or from an Arena Editor texture slot.</p>
      <ul class="images">
        <li v-for="image in active.images" :key="image.id">
          <img v-if="thumbs.get(image.id)" :src="thumbs.get(image.id)" alt="" />
          <span><strong>{{ image.name }}</strong> · {{ describeImage(image) }} · {{ usageText(image.id) }}</span>
          <button :disabled="busy" @click="requestImageDelete(image)">Delete…</button>
        </li>
      </ul>
      <div v-if="deleteImage" class="confirmation" role="group" aria-label="Confirm image deletion">
        <p>Delete imported image “{{ deleteImage.name }}” from this save? This cannot be undone without a backup.</p>
        <button :disabled="busy" @click="confirmImageDelete">Delete Image</button>
        <button @click="deleteImage = null">Cancel</button>
      </div>
    </section>

    <section>
      <h2>Browser storage</h2>
      <p>{{ usage }}</p>
      <button :disabled="busy || saves.status.mode !== 'persistent'" @click="run(storageRequest)">Request Persistent Storage</button>
      <p v-if="saves.status.persistentStorage !== null">{{ saves.status.persistentStorage ? 'Persistent storage granted.' : 'Persistent storage was not granted. Keep portable backups.' }}</p>
    </section>
    <p class="hint">D-pad moves · A uses a field · left/right changes a choice · B finishes typing or goes back. Tab and mouse also work.</p>
  </div>
</template>

<script setup lang="ts">
/**
 * Options -> Save Data: choose the local save in use, rename, create and delete
 * saves, download and restore `.vpg` backups, and the reminder on Exit.
 *
 * Ported from VirtualProGrappler-V2. Every action goes through the save
 * coordinator, which validates and commits it in one transaction, so this
 * screen only presents results and reports failures.
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { saves, downloadBackup, importImageFile, stageBackup as readBackup, type StagedBackup } from "@/data/save/runtime";
import { LIMITS, type LibraryImage } from "@/data/save/types";
import { describeImage, formatBytes, imageUsage, userImageRef } from "@/data/save/images";
import { acquireImageUrls, type ImageUrls } from "@/data/userImages";
import { useMenuForm } from "./menuForm";

const emit = defineEmits<{ back: [] }>();
const root = ref<HTMLElement | null>(null);
const picker = ref<HTMLInputElement | null>(null);
const imagePicker = ref<HTMLInputElement | null>(null);
const deleteImage = ref<LibraryImage | null>(null);
const thumbs = ref(new Map<string, string>());
const busy = ref(false), notice = ref(""), saveName = ref("");
const confirmDelete = ref(false), deleteArenaId = ref<string | null>(null);
const staged = ref<StagedBackup | null>(null);
const replace = ref(false), restoreSettings = ref(false), usage = ref("Storage usage unavailable.");
const workspace = computed(() => saves.workspace.value!);
const active = computed(() => saves.activeSave);
const modeLabel = computed(() => saves.status.mode === "persistent" ? "Browser storage" : "Temporary session — download a backup before leaving");

// A different save, or a rename, resets the name field and any pending delete.
watch(() => [active.value.id, active.value.name], ([, name]) => {
  saveName.value = name;
  confirmDelete.value = false;
  deleteArenaId.value = null;
  deleteImage.value = null;
}, { immediate: true });

// Thumbnails hold object URLs while shown; the next set is acquired before the
// previous one is released, so an image in both keeps its URL.
let thumbLease: ImageUrls | null = null, thumbToken = 0;
watch(() => active.value.images.map((image) => image.id).join(","), async () => {
  const token = ++thumbToken;
  const refs = active.value.images.map((image) => userImageRef(image.id));
  const lease = await acquireImageUrls(refs);
  if (token !== thumbToken) { lease.release(); return; }
  thumbLease?.release(); thumbLease = lease;
  thumbs.value = new Map(active.value.images.flatMap((image) => {
    const url = lease.resolve(userImageRef(image.id));
    return url ? [[image.id, url] as const] : [];
  }));
}, { immediate: true });
onBeforeUnmount(() => { thumbToken++; thumbLease?.release(); });

/** Which arenas, or the unfinished draft, use an image. */
function usageText(id: string) {
  const uses = imageUsage(active.value, id);
  return uses.length ? `Used by ${uses.join(", ")}` : "Unused";
}

const deleteArenaName = computed(() =>
  active.value.arenas.find((arena) => arena.id === deleteArenaId.value)?.displayName ?? deleteArenaId.value
);

const libraryBytes = (images: LibraryImage[]) => images.reduce((sum, image) => sum + image.byteLength, 0);

function back() {
  if (busy.value) return;
  if (staged.value) staged.value = null;
  else emit("back");
}
useMenuForm(root, back);

/** Runs one action at a time, reporting its failure rather than throwing. */
async function run(action: () => Promise<void>) {
  if (busy.value) return;
  busy.value = true; notice.value = "";
  try { await action(); }
  catch (error) { notice.value = error instanceof Error ? error.message : String(error); }
  finally { busy.value = false; }
}

function switchSave(event: Event) { const id = (event.target as HTMLSelectElement).value; void run(() => saves.switchSave(id)); }
function retry() { void run(() => saves.flush()); }
function rename() { void run(() => saves.renameSave(saveName.value)); }
function create() { void run(() => saves.createSave(saveName.value)); }
function deleteSave() { void run(async () => { await saves.deleteSave(active.value.id); confirmDelete.value = false; }); }
function deleteArena() {
  const id = deleteArenaId.value;
  if (!id) return;
  void run(async () => { await saves.deleteArena(id); deleteArenaId.value = null; notice.value = `Deleted custom arena “${id}”.`; });
}
function setReminder(event: Event) {
  saves.settingsChanged({ ...saves.effectiveSettings, preferences: { remindOnExit: (event.target as HTMLInputElement).checked } });
}
async function backup() { await downloadBackup(); notice.value = "Backup download requested. Check that you retained the .vpg file."; }

/** Reads and checks a chosen backup completely before any restore is offered. */
async function stageBackup(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;
  await run(async () => {
    staged.value = null;
    staged.value = await readBackup(file);
    replace.value = false; restoreSettings.value = false;
  });
}

async function importImage(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;
  await run(async () => {
    const { image, duplicate } = await importImageFile(file);
    notice.value = duplicate ? `“${image.name}” is already in this save.` : `Imported “${image.name}” (${describeImage(image)}).`;
    await readUsage();
  });
}

function requestImageDelete(image: LibraryImage) {
  const uses = imageUsage(active.value, image.id);
  // Refused up front: deleting never rewrites an arena behind the player's back.
  if (uses.length) {
    deleteImage.value = null;
    notice.value = `“${image.name}” is used by ${uses.join(", ")}. Change those textures before deleting it.`;
    return;
  }
  notice.value = "";
  deleteImage.value = image;
}

function confirmImageDelete() {
  const image = deleteImage.value;
  if (!image) return;
  void run(async () => {
    await saves.deleteImage(image.id);
    deleteImage.value = null;
    notice.value = `Deleted “${image.name}”.`;
    await readUsage();
  });
}

async function restore() {
  if (!staged.value) return;
  await saves.restore(staged.value.snapshot, { replace: replace.value, settings: restoreSettings.value, exportedAt: staged.value.manifest.exportedAt });
  staged.value = null;
  notice.value = saves.status.mode === "persistent" ? "Backup restored and saved in this browser." : "Backup restored for this temporary session.";
}

async function storageRequest() { await saves.requestPersistentStorage(); await readUsage(); }
async function readUsage() {
  try {
    const estimate = await navigator.storage.estimate();
    usage.value = `${((estimate.usage ?? 0) / 1048576).toFixed(1)} MiB used of ${((estimate.quota ?? 0) / 1048576).toFixed(0)} MiB available for this site.`;
  } catch { /* The default text already explains an unavailable API. */ }
}
onMounted(readUsage);
</script>

<style scoped>
.save-data { position: absolute; inset: 0; overflow-y: auto; padding: 2rem max(1.25rem, calc((100vw - 850px)/2)); background: #0b0e14; color: #f2f5f8; box-sizing: border-box; }
header, .actions { display: flex; align-items: center; justify-content: space-between; gap: .75rem; flex-wrap: wrap; }
h1 { font-family: var(--vpg-font-display); letter-spacing: .1em; } h2 { color: #e4c28f; }
section { border-top: 1px solid #424958; padding: .75rem 0 1.5rem; } p { line-height: 1.5; }
label { display: block; margin: .8rem 0; } input:not([type=checkbox]), select { display: block; width: min(100%, 25rem); margin-top: .4rem; padding: .55rem; box-sizing: border-box; }
/* The display rule above outranks the browser's own [hidden] style, which left
   the backup file picker showing beside its Restore button. */
input[hidden] { display: none; }
button, input, select { font: inherit; color: inherit; background: #202938; border: 1px solid #738197; border-radius: .25rem; }
button { padding: .5rem .8rem; cursor: pointer; } button:disabled { opacity: .5; } :focus-visible { outline: 3px solid #e4c28f; outline-offset: 3px; }
.warning { color: #ffbb9c; } .confirmation { border: 1px solid #e4c28f; padding: 1rem; margin: 1rem 0; } .hint { color: #b9c4d2; }
.images { list-style: none; padding: 0; } .images li { display: flex; align-items: center; gap: .75rem; margin: .5rem 0; }
.images img { width: 3rem; height: 3rem; object-fit: contain; background: #202938; flex: none; } .images span { flex: 1; }
.arenas { list-style: none; padding: 0; } .arenas li { display: flex; align-items: center; justify-content: space-between; gap: .75rem; margin: .5rem 0; } .muted { color: #b9c4d2; }
</style>
