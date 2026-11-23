# Save system implementation plan

Updated **2026-10-26**. **Status: S1–S3 implemented and verified in Chromium.**
IndexedDB settings/user arenas, draft recovery, imported texture images and
portable backup/restore now run in production. S4–S5 remain future work. The
[implemented storage contract](save-storage.md) records exact stores, versions,
limits, ownership and verification; the sections below retain the overall design.

Use the [project handoff](../HANDOFF.md#persistence-roadmap) for project-wide
sequencing and [HFSM Blueprint §10](../combat/HFSM-BLUEPRINT.md#10-build-order-vpg-design)
for the separate combat milestones. This plan stays in `docs/settings/` under
the current domain layout; it also covers persistence for user content.

## 1. Agreed behavior and scope

**IndexedDB is the primary store for persistent user data. `.vpg` files are
portable backups.** Normal saves and autosaves update database records; they
do not generate ZIP files or download files repeatedly.

|Data|Ownership and storage|When implemented|
|---|---|---|
|Controls, audio and display preferences|Global settings in IndexedDB; display fields follow their settings feature|S1–S2 for existing settings|
|Custom arenas|Definitions and references in the selected local save|S2|
|Imported texture images|Actual image bytes as Blobs, metadata and stable IDs; shared images can be reused|S3|
|Created wrestlers|Appearance, attributes, movesets and image references in the selected save|S4, with Create-a-Wrestler|
|Progress and unlockables|Records owned by the relevant game modes|S5, with those modes|

The application's shipped models, textures, arenas, animation catalogs and
reference roster remain bundled resources. Player edits live in the user-data
layer. Backups contain the user's records and imported image bytes, plus the
identities of bundled resources they reference; they do not copy the shipped
asset library.

Controls/audio are global preferences, so switching saves does not change the
device's controls. Backups may carry these preferences, but restoring them is
an explicit option. The default first launch creates a local save automatically;
there is no requirement to create or upload an external file before playing.

Cloud sync, encryption, imported models/audio, and resuming a match from a
serialized live simulation are outside this plan. Saving future progress does
not imply live-match serialization.

## 2. Implementation sequencing

**S1, S2 and S3 are now implemented.** S1–S2's prerequisite was the repaired
367-test combat baseline. Persistence adds transaction/archive/image tests and
production-browser verification; current totals are in the handoff. Run
`npm test` again before the next implementation slice.

There is no dependency on finishing combat milestones 4–5 or 8–10 first.
Continue their source/selector work in the existing order, but do not make
unavailable combat research a prerequisite for persistence. S1–S2 serve the
settings and arena editor that already exist. Complete them before presenting
production arena editing as a durable player feature.

|Stage|Project placement|Dependencies|Completion gate|
|---|---|---|---|
|S1 — Local save foundation|Implemented and verified|Current settings/data adapters|Transactional repository, startup hydration, legacy migration and failure handling verified|
|S2 — Arenas and portable backups|Implemented and verified in Chromium|S1 and existing arena schemas/catalogs|Production arena save/reload and complete backup/restore round trip verified|
|S3 — Imported textures|Implemented and verified in Chromium|S1–S2, image validation and asset-reference contract|Image bytes survive reload and restore, including shared and unused imported images|
|S4 — Created wrestlers|Alongside the Create-a-Wrestler feature|S1–S3 and an approved editable wrestler schema/UI|Creation, gameplay loading and backup round trip agree on the same data|
|S5 — Progress and unlockables|Alongside playable modes and their director/result rules|Persistence core plus approved mode-specific state contracts|Only valid completed progress events persist; upgrades and restore are tested|

These are application tasks, not new numbers inserted into the combat HFSM
milestones. S3–S5 extend the established repository/backup format when their
features exist; do not invent wrestler, progression or director rules now.
Each stage includes its own tests and browser verification before completion.

### S1 — Local save foundation

- [x] Define typed snapshots, stable save IDs, global settings versus per-save
  content, record revisions and component schemas. Keep database upgrade
  versions separate from portable format/component versions.
- [x] Implement the IndexedDB repository and serialized save coordinator.
  Create/load the default local save before exposing editable screens.
- [x] Add explicit settings snapshot/apply APIs and migrate existing
  `vpg-control-mappings` and `vpg-audio` values once. Preserve intentional
  unbindings and control-conflict rules. Keep legacy values until migration
  commits successfully; never reapply them over newer database values.
- [x] Request persistent storage where supported, handle denial/quota errors,
  and report failed writes. Provide a clearly labeled temporary session and
  export path when durable storage is unavailable.
- [x] Define active-save switching, a single-writer policy across tabs, save
  revisions and recovery after failed database upgrades/blocked connections.
- [x] Test first launch, reload, migration retry, invalid settings, aborted
  transactions, unavailable storage and pending writes during save switching.

### S2 — Current arenas, backup/restore and management UI

- [x] Add a runtime user-arena repository alongside the bundled catalog.
  Editing a bundled arena creates a user copy with a distinct valid ID;
  deleting that copy leaves the bundled original available.
- [x] Wire Arena Editor Save to the validated user record and refresh viewer/
  editor choices without relying on Vite hot reload. Preserve recoverable
  drafts separately from committed arena definitions.
- [x] Extract reusable schema/semantic validation from the current development
  path. Verify IDs, stage/piece compatibility, texture slots and asset existence.
- [x] Add `.vpg` snapshot export and staged, atomic restore, including optional
  application of backed-up global settings. Exercise a real production build.
- [x] Add Commissioner → Options → Save Data, local save selection/management,
  backup status and configurable exit reminders. This is the minimum Options
  screen needed for persistence, not the full future presentation settings UI.
- [x] Add an explicit in-game Exit flow that flushes pending writes and can
  offer a backup. Do not rely on closing the browser tab to finish saving.
- [x] Test editor save/reload, bundled/user collisions, deletion, corrupt
  backups, unsupported components, cancelled pickers, failed restore rollback
  and switching saves while autosave is pending.

S1–S2 form one deliverable. The player-facing paths now use the repository:
normal saving, reload and clean-profile backup/restore are verified. Repository
authoring through the Vite endpoint remains an explicit developer operation;
player saves never write to the source tree or to two backends.

### S3 — Imported texture images

- [x] Add image records, stable asset IDs, byte-content hashes for deduplication,
  and per-save library membership, including unused images the user imported.
  The ID is the SHA-256 of the stored bytes; saves share one byte record.
- [x] Validate supported raster formats, decoded dimensions, pixel/byte budgets
  and available storage before committing imports. PNG/JPEG only; stored images
  are at most 2048 px per side, 4 MP and 4 MiB; 64 images and 64 MiB per save.
- [x] Add user-image references to the custom-content schemas and renderer
  resolver. Preserve existing bundled-path behavior. Resolve temporary Blob URLs
  at runtime; never persist them as asset identities.
- [x] Include image bytes/metadata in backups, validate their hashes and
  references on restore, and keep records/assets consistent in one commit.
- [x] Prevent deletion of a referenced image or require an explicit replacement;
  deleting one creation must not remove an image still used elsewhere. Deletion
  is refused while an arena or the recovery draft uses the image.
- [x] Test sharing, deduplication, unused-image backup, replacement/deletion,
  quota failure, invalid images, and restore in a clean browser profile with
  none of the original imported files available.

Import is available from each Arena Editor texture slot and from Save Data,
which also lists the library with usage and deletes unused images. Every import
is decoded and re-encoded (orientation applied, metadata removed, oversized art
scaled down); see the [storage contract](save-storage.md#imported-images).

### S4 — Create-a-Wrestler integration

- [ ] Define the editable wrestler schema with the creation feature. Distinguish
  runtime wrestler definitions from the unchanged No Mercy research roster.
- [ ] Use the existing save coordinator for appearance, attributes, movesets,
  imported-image references and recoverable drafts; do not add another storage
  mechanism in the creation UI.
- [ ] Extend backup component validation/migrations and wire saved creations
  into the roster/moveset setup adapters used by the game.
- [ ] Verify edit/reload, gameplay setup, image references and backup/restore
  together before calling created wrestlers persistent.

### S5 — Progress and unlockables

- [ ] Define records with each implemented mode, including which result/director
  events may commit progress and how interrupted sessions are represented.
- [ ] Add component schemas/migrations and autosave through the same repository.
- [ ] Test result retries without duplicate awards, recovery and backup/restore.
  The combat director and CPU still require their own specifications.

## 3. Storage ownership and runtime boundaries

Use one repository for application-owned persistent data, with stores for save
metadata, global settings and the content types available at each stage.
Image storage is shared by content hash, with explicit per-save membership.
Backups and deletion respect that membership and references from other saves.
The implemented store/key layout is in the
[storage contract](save-storage.md#local-database-and-ownership).

The repository owns persistence; domain adapters own validation and applying
snapshots. UI code asks the coordinator to save a snapshot and waits for a
reported result. Preserve the last committed data on failure. Do not label a
change saved until the transaction completes.

Keep IndexedDB, archive I/O and DOM APIs outside `src/game/combat/`. Load and
normalize selected content before match setup; the 30 Hz simulation consumes
typed in-memory data. Backup export reads a consistent committed revision and
does its archive generation outside the database transaction.

### Settings and content migration

- Controls use `src/data/controls.ts`; audio uses `src/audio/menuAudio.ts`.
  The application now connects both snapshot/apply APIs to the repository.
  Legacy keys `vpg-control-mappings` and `vpg-audio` migrate only on first setup.
- `src/data/arenas.ts` now combines bundled JSON and the selected save’s
  committed user arenas reactively. `src/data/arenaStore.ts` uses IndexedDB
  for player Save; `saveRepositoryArena` retains explicit developer authoring
  through the Vite endpoint.
- Existing repository arena files have no reliable user-ownership marker.
  Offer explicit selection/copy into a local save; do not guess which bundled
  definitions were user-created or overwrite them during migration.
- The current tab draft key is `vpg.arenaEditor.draft`. Import only a validated
  supported draft and preserve the original until the new recovery record
  commits. Recovery drafts remain distinct from playable definitions; include
  supported drafts in backups with their own schema.
- `src/data/assets.ts` resolves bundled paths unchanged. S3 adds a separate
  `user-image:<sha256>` reference and `src/data/userImages.ts` resolution path.
  Image names and import times live in the save's library, not in arena JSON.

## 4. Autosave and user flow

|Action|Planned behavior|
|---|---|
|First launch|Open/migrate the database, create a default save if needed, hydrate settings and show the menu|
|Change controls/audio/settings|Apply immediately in memory and queue an ordered database save; coalesce rapid edits|
|Arena or wrestler editing|Persist recoverable drafts with a short debounce; explicit Save commits the validated definition|
|Switch saves or use in-game Exit|Flush writes for the old save before switching/finishing; surface errors and retain retry/export access|
|Download Backup|Flush writes, snapshot a committed revision and download `.vpg` on the user's action|
|Restore Backup|Validate/stage first; show scope/settings choices; commit and activate only on success|
|Browser tab close|Data is already saved through normal operations; exit-time downloads are not a reliability mechanism|

Serialize writes by save ID/revision and make a stale write unable to overwrite
newer data. Binding/settings saves and image imports must not cross into a
different save after a switch. Database-write status and changes since the
last backup export are separate states; exporting does not itself create a
new content revision.

Implemented Save Data controls are Download Backup, Restore Backup, local save
selection/management, last backup export status, changes since that export,
storage usage/errors, and Remind Me to Back Up on Exit.

On the explicit in-game Exit action, after successful local persistence, offer
“Your changes are saved in this browser. Download a backup before leaving?”
when the reminder is enabled and the selected save has unexported changes.
Actions: Download Backup, Continue Without Backup, Cancel. Exit finishes the
in-game session; it does not promise to close an arbitrary browser tab.

Browser tab closure cannot reliably run this custom flow or finish a download.
Use a browser-generated unload warning only for actual uncommitted changes
where appropriate. See [MDN's beforeunload guidance](https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeunload_event).
Record an export attempt as an attempt: a download link cannot confirm that
the user retained the file on disk. Failed/cancelled exports must not claim a
successful backup.

## 5. Portable backup format

`.vpg` remains a ZIP archive. Treat the extension/MIME as picker hints; validate
the archive and its contents. Use `application/zip` as a compatible transport
type. S2 uses JSZip with bounded per-entry streaming extraction. Its bundled
declarations omit `internalStream`; the codec declares that documented surface
locally. No separate `@types/jszip` package is needed.

The implemented export contains **one complete selected save**: current custom
arenas, supported drafts, its whole imported-image library (including unused
images) and a snapshot of global settings. Other local saves are not silently
included. Saves share database image bytes without sharing mutable content
records. An export-all-saves command is deferred.

The tree includes future S4–S5 components for planning; the decoder rejects
those components until their schemas/storage are implemented.

```text
my-save.vpg
├── save.json
├── data/
│   ├── settings/controls.json
│   ├── settings/audio.json
│   ├── settings/preferences.json       # Backup reminders
│   ├── settings/display.json           # Future display settings
│   ├── environments/arenas/my_arena_1.json
│   └── characters/wrestlers/my_wrestler_1.json  # S4
├── data/images/library.json                    # S3, names and image metadata
├── assets/images/<sha256>.<png|jpg>            # S3, actual bytes
├── drafts/arenas/<draft-id>.json               # Supported recovery drafts
└── state/
    ├── progress.json                         # S5
    └── unlockables.json                      # S5
```

The v1 manifest/schema was frozen in S1–S2 (see `backup-v1.schema.json`). It
identifies the format, stable save ID/name, content creation/update time, export
time, captured revision, components and their schema versions, and an inventory
of expected entries. S3's format version 2 (`backup-v2.schema.json`) adds the
`images` component and extends the inventory with image IDs (their SHA-256
hashes), paths, MIME types, byte lengths and dimensions; version 1 backups still
restore, with an empty library. Preserve `createdAt` when updating an existing
save; restoration as a new save gets a new local ID with source provenance
retained separately.

Portable `formatVersion` and component schemas determine readability;
`gameVersion` is informational and must come from defined build/package
metadata, not an undeclared `VITE_APP_VERSION`. Database upgrade versions are
an independent concern. Apply explicit migrations for supported older formats;
reject newer unsupported formats/components before mutation. Do not infer
compatibility from a game-version major/minor comparison or silently discard
future wrestler/progress/image data.

### Export and restore contracts

1. Flush pending saves and capture one consistent revision, including image
   bytes and references. Generate the archive from that snapshot.
2. On restore, check archive structure/limits and read all expected entries
   with awaited extraction. Parse and migrate into a detached snapshot.
3. Validate schemas, component support, IDs, reference integrity, settings
   conflicts, stage compatibility and image metadata/bytes before activation.
4. Default to restoring as a new local save. Replacing the selected save needs
   an explicit choice; merging individual content is deferred. Restoring global
   controls/settings is optional and does not affect other save contents.
5. Commit the prepared records/assets/settings selection atomically, then
   publish the new runtime snapshot. Any failure leaves the prior selected
   save/settings usable. Prepare asynchronous extraction/decoding before the
   write transaction so it is not left open across unrelated work.

## 6. Reliability, validation and verification

IndexedDB can store structured records and Blobs, but its data belongs to the
browser profile/site origin. Request persistent storage when appropriate;
the browser may decline. Handle full/blocked storage and failed writes visibly,
keep the last committed save and offer export of the current valid in-memory
snapshot in temporary mode. A portable backup is still needed when moving
browsers/devices or recovering after site data is cleared.

Set and test archive byte, entry-count, individual-entry and total extracted
size limits before enabling restore. Reject unexpected/unsafe paths, duplicate
normalized names, mismatched filenames/record IDs, invalid references and
unsupported components. Inspect original ZIP names as well as normalized ones.
Image import adds actual decode, dimension/pixel and integrity checks. A file
extension or JSON Schema alone does not establish these properties.

JSZip's extraction/generation convenience APIs accumulate complete results in
memory. S2 proved bounded extraction and acceptable memory use; S3 reassessed
it with a near-limit image backup in Chromium and kept JSZip at the 80 MiB
archive limit (measurements in the [storage contract](save-storage.md#measured-memory)).
Substantially higher limits would need a bounded extraction approach first. Do
not assume compression or a background worker removes memory costs. See
[JSZip's documented limitations](https://stuk.github.io/jszip/documentation/limitations.html).

Verification belongs to every stage, rather than a final testing phase:

- Pure tests: schemas, migrations, ownership/references, revisions, queue order
  and archive round trips. Failed validation must leave current state unchanged.
- Browser integration: real IndexedDB reload/transactions, storage failure,
  blocked upgrades/multiple tabs, picker cancellation, settings hydration,
  asset URL lifetime and production editor/renderer behavior.
- End-to-end restore: export, start with clean local storage, restore and use
  the saved arena; repeat with imported textures and created wrestlers as their
  stages land. No original image file or development server may be required.
- Run the repository's typecheck, relevant tests and production build for each
  implementation slice; do not claim persistence from Node-only tests.

## 7. Proposed code and schema locations

|Location|Responsibility|
|---|---|
|`src/data/save/types.ts`, `validation.ts`, `migrations.ts`|Snapshots, ownership, schemas and migrations|
|`src/data/save/repository.ts`|IndexedDB transactions, metadata, record/Blob storage|
|`src/data/save/coordinator.ts`|Startup, ordered autosave, switching, status and snapshot application|
|`src/data/save/archive.ts`|Portable manifest, export, staged restore and archive limits|
|`src/data/arenas.ts`, `arenaStore.ts`, `arenaDraft.ts`|Bundled/user catalog composition and editor integration|
|`src/data/assets.ts`, `src/data/userImages.ts`|Bundled resource resolution and imported-image object URL lifetime|
|`src/data/save/images.ts`, `imageCodec.ts`|Image references, header checks, import processing (pure) and browser decode/encode|
|`src/ui/SaveData.vue` and an exit/reminder dialog|Options → Save Data and explicit exit workflow|
|`data/schemas/`|Versioned save/manifest/component schemas; reuse domain schemas where valid|
|`tests/save/` plus a browser test suite|Repository, migration, archive and real-browser verification|

The S1–S3 modules and schemas are now present. Ajv is a runtime dependency;
JSZip loads on demand. S4–S5 component schemas remain unimplemented. See the
[storage contract](save-storage.md) for the current API boundaries and browser
test command.

## 8. Decisions to close at the owning stage

|Stage|Required detail before implementation/release|
|---|---|
|S1 — settled|Two stores, versioned schemas, Web Lock plus revision checks, runtime Ajv and numeric archive limits; see the storage contract|
|S2 — settled|Versioned recovery draft, explicit bundled-arena copy, mapped form navigation and production Playwright checks|
|S3 — settled|PNG/JPEG; re-encode every import; 2048 px, 4 MP and 4 MiB per stored image; 64 images and 64 MiB per save; SHA-256 IDs with shared bytes; `user-image:<sha256>` texture references; deletion refused while used; JSZip kept at an 80 MiB archive after measurement|
|S4|Approved wrestler creation fields, moveset/roster conversion and image usage rules|
|S5|Approved mode progress/unlock conditions and result/director commit events|

The decisions above refine the agreed architecture at the feature that owns
them; they are not reasons to postpone S1 until all combat research is done.

Technical references: [IndexedDB records, Blobs and transactions](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API),
[storage persistence requests](https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/persist),
[JSZip archive-name handling](https://stuk.github.io/jszip/documentation/api_jszip/load_async.html)
and [JSZip's bundled TypeScript declarations](https://github.com/Stuk/jszip/blob/main/package.json).
