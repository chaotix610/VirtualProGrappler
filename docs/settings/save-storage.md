# Implemented save storage contract

> **In this project:** ported from VirtualProGrappler-V2 on 2026-11-23. The
> storage layer below is in place in full (`src/data/save/`, its schemas and
> `tests/save/`), and stages S1-S3 are all wired: the local save opens at
> startup and holds controls and audio, with temporary mode for a second tab
> or blocked storage; Commissioner -> Options -> Save Data selects, creates,
> renames and deletes saves, downloads and restores `.vpg` backups, and lists
> custom arenas and imported images; Exit on the main menu flushes and offers
> a backup; and the Arena Editor keeps player-made arenas in the selected save,
> with an unfinished draft as the save's recovery record, and imports PNG/JPEG
> textures into the save from any texture slot. The arena viewer and editor
> render imported textures through `acquireImageUrls`; the Combat System Test
> still loads arenas with bundled textures only.
>
> Unlike V2, the editor has a second destination: under `vite serve` a
> bundled arena saves back to `data/environments/arenas/<id>.json`, and a new
> arena may choose the project files instead of the save
> (`saveDestination()` in `src/data/arenaDraft.ts`). Drafts bound for the
> project are parked in sessionStorage, not the save, because a save may hold
> recovery only for its own arenas; for the same reason the legacy
> `vpg.arenaEditor.draft` migration is not run. Without the dev server, as in
> V2, choosing a bundled arena starts a copy in the save. Imported images can
> dress only a draft bound for the save - a project file shipped with the game
> could not carry the bytes - so importing is disabled for project drafts. Differences from V2: the database is `vpg-saves` rather than
> `vpg-player-data` (both projects were served from the same localhost
> origin), arena drafts carry this project's `ring` field, and saved arenas
> must name a ring from `data/environments/rings.json`.

Implemented **2026-10-26** for [save-plan](save-file-plan.md) stages S1–S3:
settings, custom arenas, recovery drafts, imported texture images and `.vpg`
backups. Wrestlers, progress and live matches are outside this contract.

## Local database and ownership

Database `vpg-saves` (V2 used `vpg-player-data`; see `DATABASE_NAME` in `src/data/save/types.ts`), IndexedDB upgrade version **2**, has three stores:

|Store|Key|Contents|
|---|---|---|
|`metadata`|`workspace`|Workspace schema version, global revision, active save ID, controls/audio/reminder settings, settings revision and legacy-migration marker|
|`saves`|Inline `id`|UUID, name, creation/update times, content revision, custom arenas, one supported editor recovery draft, imported-image library, restore provenance and last backup download request|
|`images`|Inline `id`|Image bytes as a `Blob` plus MIME type, dimensions and byte length; added by upgrade version 2|

Records group content by save. There are no secondary indexes; at most 20
saves, 100 custom arenas and 64 imported images per save are supported.
Upgrading from version 1 creates only the `images` store and keeps existing
records. The stored workspace stays schema version 1 until its next commit;
loading migrates it explicitly (below) and that commit writes version 2.

Startup obtains the origin's `vpg-saves-writer` Web Lock for the page's
lifetime, opens/validates the database and creates the first save if needed.
Editable screens wait for initialization. The second tab uses a labeled
temporary copy; closing the owner and reloading reacquires durable ownership.
Browsers without Web Locks or IndexedDB also get temporary mode and export.

The coordinator serializes operations and coalesces settings/draft edits over
250 ms. All three stores commit in one transaction, with a global revision
check inside that transaction. Stale writers fail before mutation. The workspace
is published only after transaction completion. Settings apply immediately in
memory; failed settings/draft writes stay pending for Retry Saving or export.
An explicit arena Save or image import publishes only on commit. Failed/blocked
startup never overwrites an existing database; connection invalidation requires
reload.

Switching saves flushes pending writes. Draft writes and image imports capture
the save selected when they began; controls/audio/reminders remain global.
Custom arena IDs cannot collide with bundled definitions. Selecting a bundled
arena in the editor explicitly copies it into the selected save. Deletion only
removes the custom record.

### Imported images

An image's ID is the lowercase hex **SHA-256 of its stored bytes**. One
`images` record serves every save that lists that ID; each save's `images`
array holds its own membership (name and import time) with the content-derived
MIME type, dimensions and byte length. Saves must agree on those fields for a
shared ID. Every commit stores bytes for newly listed IDs, deletes bytes that no
save lists any more and aborts if a listed ID would have no bytes. Loading
refuses a workspace whose listed images are missing from the store.

Arena texture slots name an imported image as `user-image:<sha256>` in the
existing `arenaTextures`/`ringTextures` values; bundled values stay repository
paths. Any slot with a texture picker accepts an imported image (the slot
folders only organize bundled art). Preview images, models and colour keys
cannot be imported images. Validation resolves references against the owning
save's library, so bundled files and the developer authoring endpoint reject
them. A recovery draft's references count as uses.

Deleting an image is refused while any of the save's arenas or its recovery
draft uses it; the refusal names them, and no arena is rewritten. Unused images
delete after confirmation. Deleting a save or replacing it on restore removes
its memberships; the bytes go once no save lists them.

Renderers ask `acquireImageUrls` for object URLs. URLs are reference-counted,
created from the stored `Blob` for the lifetime of the scene or thumbnail that
holds them and revoked on release; they are never persisted. Temporary sessions
keep newly imported bytes in memory and read existing ones from the database.

### Import processing and limits

|Limit|Value|
|---|---|
|Formats|PNG and JPEG, identified from the bytes (signature and frame header), never from extension or reported type|
|Chosen file|≤ 32 MiB, ≤ 16384 px per side and ≤ 50 megapixels before decoding|
|Stored image|≤ 2048 px per side, ≤ 4 MP (2048 × 2048) and ≤ 4 MiB|
|Per save|≤ 64 images and ≤ 64 MiB of stored image bytes, counting unused images|

Every import decodes the file with its EXIF orientation applied
(`createImageBitmap`) and re-encodes it on a canvas: PNG stays lossless PNG,
JPEG becomes JPEG at quality 0.92. This drops all metadata, including location
data. Images over the side/pixel limit are scaled down; an encoding over 4 MiB
is shrunk again, up to three times, before the import is refused. The stored
bytes' header must match the requested format and size, and their hash becomes
the ID. Importing bytes already in the save returns the existing entry. Before
committing, an import or restore whose bytes would not fit the browser's
reported free quota (with 1 MiB headroom) is refused; a quota failure during
the transaction leaves the library unchanged.

## Migration and validation

`save-v2.schema.json`, `backup-v2.schema.json`, and existing arena/control
schemas are enforced with runtime Ajv 2020. The frozen `save-v1.schema.json`
and `backup-v1.schema.json` validate older data before its explicit migration.
Semantic validation checks control ownership, stage/piece compatibility,
texture-slot membership, asset existence, save/arena IDs, recovery references,
library limits and imported-image references. Unsupported fields/components fail.

Workspace version 1 migrates by adding an empty image library to each save.
Legacy `vpg-control-mappings` and `vpg-audio` are read only when no database
workspace exists. Partial control mappings preserve explicit empty arrays;
explicit assignments take precedence over missing controls' default inputs.
Legacy keys remain available, but are never reapplied over committed settings.
Invalid legacy JSON falls back to defaults and reports a migration message.

A validated `vpg.arenaEditor.draft` session record migrates separately. Bundled
editing IDs become new copies. The original key is removed only after its
recovery record commits. Recovery allows incomplete names/IDs while validating
all renderable resources. It never registers the draft as a playable arena.

## Portable format

The `.vpg` download is a ZIP with transport type `application/zip`. `save.json`
contains format `virtual-pro-grappler`, `formatVersion: 2`, package
`gameVersion`, save identity/timestamps/revision, export time, settings revision,
component versions and an inventory. Database upgrade version, workspace
version, portable version and component versions are independent.

Components **controls, audio, preferences, arenas, drafts and images** are all
version **1**. Required global entries live in
`data/settings/{controls,audio,preferences}.json`; custom arenas use
`data/environments/arenas/<id>.json`; the optional recovery record uses
`drafts/arenas/editor.json`. The whole library, including unused images, is in
`data/images/library.json` with each image's bytes at
`assets/images/<sha256>.<png|jpg>`, stored uncompressed. Image inventory entries
also record ID, MIME type and dimensions. Only the selected save is exported.
Bundled assets are referenced by their stable resource paths, never copied.

Limits are **80 MiB archive** and **192 files**. JSON entries are at most
**64 KiB** each and **8 MiB** together; image entries at most **4 MiB** each and
**64 MiB** together (**72 MiB** extracted in all). The format accepts single-disk
STORE/DEFLATE ZIPs with ASCII JSON paths or content-named image paths, and
matching local/central headers. Directory records, ZIP64, encryption, data
descriptors, symlinks, traversal/duplicate names and unlisted entries are
rejected. The exporter produces this supported layout and re-hashes each
image's bytes before writing it.

The decoder inspects original headers before JSZip can normalize or merge names.
Each entry is streamed with an actual byte counter, then checked against its
declared length and CRC32. It never invokes whole-archive CRC extraction.
Entries extract sequentially. Each image's SHA-256 must equal its name and
inventory ID, and its header must match the recorded format and dimensions; the
library and the image files must describe the same bytes one for one. Staging
then decodes every image in the browser and compares its decoded size before
offering the restore. Version 1 backups are validated against their frozen
manifest schema and restore with an empty library; newer formats/components are
rejected in full.

Restore stages all extraction, hashing, decoding, schemas and references before
opening a write transaction. The default creates and activates a new UUID with
source provenance; replacement requires an explicit destination choice and
preserves the existing local ID/creation time. Global settings restore is
opt-in. Image bytes and records commit in the same transaction, deduplicated
against bytes already stored. A failed transaction keeps the previous selected
save/settings/catalog active.

Backup status means a **download request**, not confirmation that a file was
retained. It captures content and settings revisions without incrementing the
content revision. Later edits remain marked as needing backup. If autosave
fails, export can include the current valid in-memory settings/recovery draft
without claiming that revision is committed. Image bytes are read from the
database or temporary memory, so a disconnected database cannot export images.
Exit flushes before offering the reminder; actual uncommitted writes can trigger
a native unload warning.

### Measured memory

The archive path keeps JSZip: whole-archive buffering is acceptable at these
limits. Two Chromium runs at the limit (64 incompressible images, 61.3 MiB
library and archive) measured, as Chromium resident memory above its starting
level:

|Step|Time|Peak increase|
|---|---|---|
|Export|0.75–0.78 s|+304–305 MiB|
|Stage restore (extract, hash, decode)|0.9 s|+190–197 MiB|
|Commit restore|0.11–0.61 s|+5–116 MiB|

In Node, a 64 MiB archive encoded in about 0.3 s and decoded in about 0.4 s.
Raising the limits substantially would need a bounded (`File.slice`) reader
instead of buffering the archive.

## Verification

`tests/save/` covers transactions, migration, revisions/queue order, ownership,
failed writes/restores, temporary sessions, hostile/corrupt archives, image
headers, import processing, library rules, sharing/deduplication, deletion,
quota failure, database upgrade and image backups. `tests/browser/` uses a
production build and real Chromium IndexedDB/Web Locks/WebGL. Run
`npm run test:browser` after installing Chromium with
`npx playwright install chromium`; an existing browser can be selected with
`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`.

Browser coverage includes arena save/reload and clean-profile restore, global
settings hydration, draft recovery, multiple tabs, unavailable storage, aborted
transactions, cancelled/invalid imports, restore rollback, mapped menu input
and explicit Exit. Image coverage renders an imported texture in WebGL after
reload and after a clean-profile restore with no source file; checks orientation,
metadata removal, downscaling, duplicates, invalid files and deletion rules;
upgrades a real version 1 database; and records the near-limit memory above.
Other browser engines and combat WebGL remain unverified.
