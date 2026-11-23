# Create-a-Wrestler Plan

**Status:** proposed, 2026-10-09. Nothing here is built yet.

How a player builds a wrestler from parts, how that wrestler is assembled in
Babylon.js, and how it plays every move animation without per-character
baking. The rule that makes it work is the one No Mercy itself uses: **every
wrestler, built-in or created, sits on the same 19-joint AKI skeleton with the
same rest pose.** A clip exported once plays on all of them.

This plan builds on [aki-rig-migration-plan.md](../animations/aki-rig-migration-plan.md)
(the 19-joint AKI rig) and
[move-animation-plan.md](../animations/move-animation-plan.md) (skeleton-only animation
files, manifest, movesets). It does not change either; it adds the character
side.

---

## Decisions to confirm

| # | Decision | Recommendation |
|---|---|---|
| 1 | How a created wrestler is stored | A JSON spec, assembled at load time. No per-wrestler GLB — [§4](#4-the-wrestler-spec) |
| 2 | How body size varies | One fixed skeleton. Height is a uniform scale on the root; build and girth come from the part meshes. No per-bone length sliders — [§2](#2-the-skeleton-contract) |
| 3 | Part granularity | No Mercy's: one segment per joint, plus overlay pieces — [§3](#3-the-part-library) |
| 4 | How colours are applied | Composite each wrestler's textures into one atlas at build time. One material, one draw call — [§6](#6-textures-and-colour) |
| 5 | Where created wrestlers are saved | IndexedDB in the browser, with JSON import/export — [§8](#8-saving-and-sharing) |
| 6 | Where the editor lives | Commissioner → SmackDown Mall → Create a Wrestler, beside the combat test — [§7](#7-the-editor) |

---

## 1. What No Mercy does

Measured with AKI Anvil on the NTSC-U v1.1 cartridge, 2026-10-09.

- **One skeleton for everyone.** The rig's joint offsets are identical for
  Austin, Andre the Giant, Taka Michinoku, Rikishi, Chris Benoit and Stephanie
  McMahon.
- **Size is not in the mesh.** Andre (7'11") and Taka (5'10") have the same
  bounding-box height in the model data, about 177 units. The game must scale
  by the height field at runtime. *Verify in game before relying on the exact
  formula.*
- **A model is 23 parts.** Slots 1–19 are one body segment per joint. Slot 20
  is the face on the head. Slots 22–24 split the torso further: the pelvis
  into right (slot 1) and left (slot 22) halves, the lower abdomen and upper
  body into front (slots 2, 3) and back (slots 23, 24).
- **Rigid, per-vertex binding.** Every vertex follows exactly one joint, weight
  1. A segment's edge vertices may follow the neighbouring joint, which is how
  seams stay closed: the pelvis part has vertices on the hips, the forearm has
  vertices on the hand. There is no blending.
- **Small textures, one per part.** 8×8 to 64×64, with mirrored wrapping.
- **The Look tab is 36 fields:** build (0–12 male, 13–21 female), head shape,
  face (127), skin colour, hair style, hair colour, front hair, facial hair,
  mask, hat, ring attire, upper attire, tattoo, gloves, wristbands, elbow pads
  and knee pads (left and right), boots and entrance attire. Each piece of
  clothing has one or two colour slots chosen from a 32-colour palette.
- **Four costumes per wrestler**, each with its own Look values. Profile and
  moveset are shared.

The game is a working proof that one skeleton plus swappable parts covers a
whole roster. This plan copies the structure and replaces the content.

---

## 2. The skeleton contract

The canonical rig is the AKI 19-joint skeleton from the migration plan:
`Pelvis` → `LowerAbdomen` → `UpperBody` → `Neck` → `Head`, arms
`{Left,Right}{UpperArm,Forearm,Hand,Fingers}`, legs
`{Left,Right}{UpperLeg,LowerLeg,Foot}`, with the rest offsets from the export.

**Rules:**

1. Every part mesh is skinned to this rest pose, in its native units. A part
   never moves a joint.
2. **Height is a uniform scale on the wrestler's root node.** Clip
   translations scale with it, so a taller wrestler takes a longer stride. This
   is what No Mercy does.
3. **Build, girth and gender come from the part meshes.** A heavyweight's
   upper-arm segment is a thicker mesh around the same joint, not a longer
   bone.
4. **No per-bone length sliders.** The exported clips animate translation on
   every joint, so the clip, not the mesh, decides where each joint is. A
   longer arm bone would be pulled back to the standard length every frame.
   Getting around that means stripping translation tracks at load, which loses
   the shoulder and hip shifts the AKI clips rely on, and puts contact points
   of paired moves out of line.
5. **A validator enforces it.** `tools/validate-rig.mjs` (new) compares every
   part's and every character's joint names, hierarchy and rest transforms
   against `assets/rig/aki-skeleton.glb`, and fails on drift beyond 1e-4.

`assets/rig/aki-skeleton.glb` is the reference file: the 19 joints, no mesh,
no clips. It is generated from the animation exports, not authored by hand.

---

## 3. The part library

### Slots

Follows No Mercy's layout, renamed for VPG.

| Slot | Joint(s) | Layer | Picked by |
|---|---|---|---|
| `pelvis_l`, `pelvis_r` | Pelvis (+ hip edge) | body | build |
| `abdomen_front`, `abdomen_back` | LowerAbdomen | body | build |
| `chest_front`, `chest_back` | UpperBody | body | build |
| `neck` | Neck | body | build |
| `head` | Head | body | head shape |
| `face` | Head | body | face |
| `upper_arm_{l,r}`, `forearm_{l,r}`, `hand_{l,r}`, `fingers_{l,r}` | arm joints | body | build |
| `upper_leg_{l,r}`, `lower_leg_{l,r}`, `foot_{l,r}` | leg joints | body | build |
| `hair`, `front_hair` | Head | overlay | hair style, front hair |
| `trunks_*` | Pelvis, upper legs | overlay | ring attire |
| `top_*` | UpperBody, LowerAbdomen, upper arms | overlay | upper attire |
| `mask`, `hat` | Head | overlay | mask, hat |
| `boot_{l,r}` | LowerLeg, Foot | replace | boots |
| `glove_{l,r}`, `wristband_{l,r}`, `elbow_pad_{l,r}`, `knee_pad_{l,r}` | arm and leg joints | overlay | the matching field |

- **body** parts always exist; picking a value swaps the mesh.
- **overlay** parts are added on top and may be empty.
- **replace** parts hide the body part they cover. Boots replace the
  `lower_leg` and `foot` segments.

### Seams

No Mercy can mix a head with any body because the neck seam is the same on
every build. VPG makes that a rule: **every joint has a standard seam ring**, a
fixed loop of vertices at a fixed position. Each segment's edge vertices sit
on its neighbour's ring and are bound to the neighbour's joint. Any build's
forearm then meets any build's hand without a gap. `tools/validate-parts.mjs`
checks it: seam vertices within 0.5 native units of the ring.

### Files

```text
assets/parts/
├── parts.json            catalog: id, slot, layer, joints, colour regions, tags
├── body/<build>/         one GLB per build, all body slots, named by slot
├── head/                 head shapes
├── face/                 face textures (the face mesh is shared)
├── hair/                 hair and front-hair meshes
└── attire/<kind>/        trunks, tops, boots, gloves, pads, masks, hats
```

Each GLB is skinned to the canonical rig and has no clips. `parts.json` is the
contract the editor and the assembler read; the files behind it can be
swapped for original art without touching code.

### Placeholder content

Until original parts exist, the library is filled from No Mercy, kept in
`assets/local/parts/` (gitignored) beside the other placeholder assets. AKI
Anvil reports each part's slot and joint, so the 64 wrestlers' models can be
split into parts and grouped by the Look value that produced them: all build-10
body segments from Austin, all head shape 6 heads, and so on. Duplicates are
removed by geometry hash. This needs one new export: the current wrestler GLBs
merge parts per wrestler and do not record slots.

---

## 4. The wrestler spec

A created wrestler is data, not a model. The spec uses the same shape as the
64 wrestler JSON files already exported (`assets/local/wrestlers/*.json`), so
the No Mercy roster doubles as test data and presets.

```jsonc
{
  "schema_version": 1,
  "id": "caw-the-hornet",
  "profile": {
    "full_name": "The Hornet",
    "short_name": "Hornet",
    "ring_name": "Hornet",
    "height_in": 74,                 // drives the root scale
    "weight_lb": 231,
    "style": "wrestling",
    "attributes": {                  // validated by validateProfile() in src/game/combat/profiles.ts
      "speed": 3,
      "offense": { "head": 2, "body": 3, "arms": 3, "legs": 4, "flying": 4 },
      "defense": { "head": 3, "body": 3, "arms": 2, "legs": 3, "flying": 2 }
    },
    "partner": null,
    "rivals": []
  },
  "moveset": "data/characters/caw-the-hornet.moveset.json",   // move-animation-plan §7 format
  "costumes": [
    {
      "build": "male_medium",
      "head": "head_03",
      "face": "face_017",
      "skin": "tone_4",
      "hair": { "style": "hair_short_02", "colour": "#2b1d14" },
      "parts": {
        "trunks":   { "part": "trunks_long_01", "colours": ["#000000", "#d4a017"] },
        "boot_l":   { "part": "boots_high_01",  "colours": ["#000000", "#d4a017"] },
        "boot_r":   { "part": "boots_high_01",  "colours": ["#000000", "#d4a017"] },
        "knee_pad_l": { "part": "knee_pad_01",  "colours": ["#d4a017"] }
      },
      "tattoos": ["tattoo_tribal_arm_r"]
    }
  ]
}
```

- **Part ids, not No Mercy indices.** `face_017` is a catalog id. The
  placeholder catalog records which No Mercy value each id came from, so the
  64 presets convert mechanically.
- **Colours are hex values,** not palette indices. The editor offers a
  palette; the spec stores what was picked.
- **Up to four costumes.** Profile and moveset are shared across them, as in No
  Mercy.
- Schema: `data/schemas/wrestler.schema.json`, validated with ajv like the
  other content files. The built-in roster moves to `data/characters/*.json`
  in the same format, so there is one character format, not two.

---

## 5. Runtime assembly

New module `src/renderer/WrestlerFactory.ts`. It replaces the
`ImportMeshAsync(MODEL_ROOT + definition.file)` call in
`CombatTestScene.loadWrestler`.

1. **Load the rig once.** `aki-skeleton.glb` into an `AssetContainer`.
2. **Load each needed part GLB once** into its own `AssetContainer`, cached
   by part id. A match with four wrestlers shares most body parts.
3. **Per wrestler:** instantiate the rig (`instantiateModelsToScene`) to get
   its own skeleton and joint nodes. Clone each chosen part mesh, point its
   `skeleton` at the new skeleton, and hide the body parts that `replace`
   parts cover.
4. **Merge.** All parts share one skeleton and, after §6, one atlas, so merge
   them into one skinned mesh. Check that `Mesh.MergeMeshes` keeps
   `matricesIndices` and `matricesWeights`; if it does not, build the merged
   `VertexData` directly, which is a few lines since every vertex has one
   joint at weight 1.
5. **Scale** the wrestler's root by `height_in / REFERENCE_HEIGHT_IN`, on top
   of the migration plan's base scale.
6. **Animate.** Clone animation groups from the animation `AssetContainer`s
   onto the new joints, matching targets by node name. Every clip works,
   because the joints are the canonical ones.

Budget: one draw call and under 50 ms of assembly per wrestler with the part
cache warm. The Combat System Test is the benchmark.

---

## 6. Textures and colour

N64 textures are tiny and every part has its own. VPG keeps per-part source
textures and composites each wrestler into one atlas when it is built.

- **Each part texture has a colour mask.** Authored as an RGBA image where the
  base is greyscale detail and a second mask image marks colour regions 1 and
  2 in R and G. Regions are tinted with the costume colours; untouched areas
  keep their own colour.
- **Skin parts** are tinted by the skin tone. Tattoos are decals drawn over
  skin before attire.
- **Draw order:** skin → tattoos → face → attire base → attire colour regions
  → overlays.
- **Composited on a canvas** (`OffscreenCanvas` where available) into a power-of-two
  atlas, then uploaded as one `Texture`. UVs are remapped into atlas cells, the
  same remap `tools/prepare-character-glb.mjs` already does at build time.
- **Cached by a hash of the costume,** so four identical opponents build once.
- Filtering stays `NEAREST`, matching the prepare step.

The alternative is a `NodeMaterial` that tints regions on the GPU per pixel.
It skips the compositing step but needs one material per colour combination,
or per-vertex colour data. Compositing keeps the renderer as simple as it is
today.

---

## 7. The editor

Vue screen `src/ui/CreateWrestler.vue`, reached from Commissioner → SmackDown
Mall, beside Combat System Test. Tabs mirror No Mercy and AKI Anvil, so the
layout is familiar:

| Tab | Contents |
|---|---|
| **Profile** | Full, short and ring name with length limits; height and weight; speed; offense and defense per body part with the 30-point budget from `profiles.ts` shown live; style; partner and rivals |
| **Look** | Costume 1–4 switcher. Build, head, face, skin, hair, then each clothing slot with its part picker and colour swatches. Copy costume to costume |
| **Moves** | Every slot from `move-slots.json`, grouped as No Mercy groups them. Picking a slot lists only the moves `moves.json` allows there. Damage shown per move |
| **Entrance** | Theme and entrance video. Stubbed until those systems exist |

**Preview stage.** Its own Babylon scene in the panel: orbit camera, the
wrestler on a plain mat, the idle clip looping. Clicking a move slot plays that
move's `actor` clip on the preview. This only works because of the shared
skeleton, and it is the fastest way to show the system is working.

**Rebuild on change.** Changing a Look field rebuilds only the affected parts
and the atlas, not the whole wrestler.

---

## 8. Saving and sharing

- Created wrestlers are saved to IndexedDB under the spec `id`, with an
  autosaved draft while editing.
- **Export** writes the spec as `<id>.vpg-wrestler.json`; **import** validates
  it against the schema and the part catalog before saving. Unknown part ids
  fall back to the build's default part and are reported, not silently
  dropped.
- Created and built-in wrestlers appear together on the selection screen;
  created ones are tagged.
- Specs contain only ids and values, never mesh or texture data, so a shared
  file is a few kilobytes and stays valid when the part art is replaced.

---

## 9. Testing

| Test | What it checks |
|---|---|
| `validate-rig` | Every part and character GLB matches the canonical joints and rest pose |
| `validate-parts` | Each vertex bound to one joint the slot allows, weight 1; seam vertices on their rings; every `parts.json` entry has a file |
| Schema | All `data/characters/*.json` and the 64 placeholder presets validate |
| Assembly unit test | Building the Austin spec gives one skinned mesh, 19 joints, the expected vertex count |
| Clip coverage | Every `actor_animation_id` and `target_animation_id` in a preset's moveset loads and has a `main` clip or its phases |
| Playwright | The editor opens, a part change re-renders, a move preview plays, an exported spec imports back identically |

---

## 10. Work order

Each step leaves the game running.

1. **Canonical rig.** Generate `assets/rig/aki-skeleton.glb` and write
   `validate-rig`. Depends on the migration plan's pipeline step.
2. **Part export.** Add a slot-aware export from AKI Anvil and split the 64
   No Mercy models into placeholder parts in `assets/local/parts/`, with a
   generated `parts.json`.
3. **WrestlerFactory.** Assemble Austin from his converted spec and load him
   in the combat test instead of the baked GLB. Same look, same clips: the
   proof the pipeline works.
4. **Spec and schema.** Convert all 64 wrestler JSON files to specs. Any of
   them can now load in the combat test.
5. **Texture compositing and colours.** Atlas per wrestler, colour regions,
   skin tone, tattoos.
6. **Editor, Look tab,** with the preview stage.
7. **Editor, Profile and Moves tabs,** saving, import and export.
8. **Selection screen** lists created wrestlers.
9. **Original part library.** Model original parts in Blender against the
   canonical rig and seam rings, and swap them in through `parts.json`. No
   engine change.

---

## 11. Risks and open questions

- **Paired moves between different heights.** A 5'8" target in a 7'0"
  wrestler's suplex: both clips scale with their own wrestler, so contact
  points drift. No Mercy accepts small drift. Start there; if it looks wrong,
  scale the target's clip by the actor's height for the length of the move.
- **Height formula.** §1 infers that No Mercy scales at runtime. Confirm the
  exact relation between the height field and scale before tuning
  `REFERENCE_HEIGHT_IN`.
- **Female builds.** No Mercy keeps them as a separate build range (13–21),
  with the same skeleton. Same here; the editor filters builds by a body type
  choice.
- **Seam rings are an authoring constraint.** They need to be written down,
  with a template `.blend` holding the rig and rings, before any original
  parts are modelled.
- **Licensing.** As with the migration plan, No Mercy parts are placeholders
  in `assets/local/`. Engine code depends only on the skeleton, the slot
  names and `parts.json`, never on anything specific to the AKI source.
