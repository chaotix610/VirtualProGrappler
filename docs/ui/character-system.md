# Character System Architecture

How VPG loads, assembles, and customizes wrestlers. This covers the asset pipeline, the recipe format, the character loader, the Create-a-Wrestler (CAW) editor, and the optional bake step.

**Where things live in this repo:** art source and exported GLBs → `assets/` · recipe JSON, schemas, and the parts manifest → `data/` · runtime code → `src/character/` · this doc → `docs/`.

The design follows the same philosophy as the AKI engine's create mode: a wrestler is not a model file. A wrestler is a **recipe** — a small data document listing which parts, textures, colors, and sizing to use — and the engine assembles the visible character from that recipe at runtime. Meshes are always *derived*, never *saved*.

```
Parts library GLB ─┐
                   ├─► Recipe JSON ─► Runtime assembly ─► (optional bake) ─► Match scene
Skeleton GLB ──────┘
```

## Why recipe-driven?

- **Tiny saves.** A CAW save is a few KB of JSON, not a mesh export.
- **Shareable.** A compressed recipe is a shareable CAW code, same spirit as memory-card CAW trading.
- **Forward-compatible.** Updating a part in the library automatically updates every wrestler that references it.
- **One animation set.** Every part conforms to one canonical skeleton, so the entire move library drives every possible wrestler with zero per-character animation work.

---

## 1. Asset pipeline (Blender → GLB)

All character art lives in one master Blender file containing:

1. **The canonical skeleton.** One armature, fixed bone names and ordering. Every animation in the game targets this rig.
2. **Every interchangeable part**, each as a separate mesh object, skinned (vertex-weighted) to the canonical skeleton: head variants, torso variants, arm variants, attire geometry (tights long/short, boots, gloves, pads), hair pieces, etc.

Two exports come out of this file:

| Export | Contents | Used by |
|---|---|---|
| `assets/characters/skeleton.glb` | Armature + all animations, no meshes | Loaded once per scene |
| `assets/characters/parts.glb` | All part meshes skinned to the rig | Part instantiation |

The master Blender file lives alongside them (e.g. `assets/characters/wrestler-parts.blend`), following the same source-next-to-export convention as the arena assets.

At N64-style fidelity the entire parts library is small (a full wrestler is ~2,400 vertices), so a single library GLB is preferred over per-part files — one fetch, no waterfall.

### Export rules (non-negotiable)

- **Apply all transforms before export** (`Object → Apply → All Transforms`). Every mesh's local space must equal world space. Unbaked per-node rotations (e.g. Z-up→Y-up conversions left on the node) corrupt downstream auto-skinning and merging.
- **Identical bone names and bone ordering** across every export. Runtime skeleton sharing depends on bone indices in each part's skin weights pointing at the same bones.
- Parts are modeled in the rig's rest pose (A-pose), centered on the shared origin.
- Each part gets a stable ID via its mesh name: `head_01`, `torso_singlet_02`, `boots_kneepad_01`. These names are the keys the recipe references — renaming a part is a breaking change.

---

## 2. The recipe format

A wrestler is a JSON document. Its top-level structure mirrors the AKI character-slot model documented in [`edit-a-superstar.md`](./edit-a-superstar.md): one **character slot** holds the gameplay data (moves, fighting style, parameters, ally/enemy) shared by up to four **attire slots**, while profile and appearance are per-attire. The recipe encodes that split directly — `shared` is the character slot, `attires[]` are the attire slots.

```jsonc
{
  "schema": 1,
  "shared": {
    "moveset":       { "...": "see moveset docs" },
    "fightingStyle": { "...": "stance, speed, recovery, bleeding, ..." },
    "parameters":    { "...": "off/def Head Body Arms Legs Flying, 1-5, 30 pt cap" },
    "allyEnemy":     { "...": "rivals, accompaniedBy" }
  },
  "attires": [
    {
      "profile": {
        "name": "Stone Cold Steve Austin",
        "shortName": "Austin",
        "alias": "",
        "picture": "austin_01",        // 64x64 PNG, transparent bg
        "height": 73,                  // inches; 60–95 (5'0–7'11)
        "weight": 252,                 // lbs; 100–599
        "music": "theme_glass",
        "titantron": "tron_austin"
      },
      "appearance": {
        "body":      { "type": "body_austin", "skinTone": 2 },
        "geometry": {
          "head": "head_m01",   "hair": "hair_shaved", "frontHair": null,
          "mask": null,         "hat": null,
          "ringAttire": "trunks_short_01", "upperBody": null,
          "gloves": "gloves_black",        "wristBand": null,
          "elbowPadL": null, "elbowPadR": null,
          "kneePadL": "kneepad_01", "kneePadR": "kneepad_01",
          "feet": "boots_05",
          "entranceAttire": "vest_austin", "weapon": null
        },
        "texture": {
          "face": "face_m12", "facialHair": "goatee_03", "tattoo": null
        },
        "colors": { "attire": "#101010", "boots": "#101010" }
      }
    }
  ]
}
```

Rules:

- **`schema`** version gates migrations. Loaders must refuse versions they don't understand.
- **Slots are fixed, parts are open.** The slot set is engine-defined; the set of valid part IDs per slot grows with the library. A slot→allowed-parts manifest generated at build time keeps the CAW UI and the validator in sync.
- **Slots are split by customization path** (see §4): `geometry` slots resolve to part meshes via `swapPart()`; `texture` slots and `colors` resolve to layers in the composited DynamicTexture. `body.type` is special — it selects a whole *part-set preset* (the base head/torso/arm/leg meshes), which individual geometry slots then layer over or replace.
- **Paired limb slots** (`elbowPadL/R`, `kneePadL/R`) are independent, matching the source taxonomy — asymmetric pads are a signature look (single elbow pad, single knee brace).
- **Nullable slots.** Most attire slots accept `null` (= none/barefoot/etc.). Required slots: `body`, `head`, `face`, `ringAttire`, `feet`-or-null-barefoot.
- **Height lives in `profile`** but feeds the renderer: it drives uniform skeleton scale (see §5). Weight is gameplay-only.

### Slot taxonomy

The slot vocabulary intentionally tracks the Edit-a-Superstar appearance pages so the reference docs double as a content roadmap:

| Recipe slot | Path | Source category (option count at parity) |
|---|---|---|
| `body.type` | part-set preset | Body: 14 male + 9 female |
| `body.skinTone` | texture tint | 8 canonical tones |
| `geometry.head` | mesh | Head: 7 male + 3 female |
| `texture.face` | texture | Face: 98 male + 20 female |
| `geometry.hair` / `frontHair` | mesh | 22 styles / 63 front styles |
| `texture.facialHair` | texture | 31 options |
| `geometry.mask`, `hat` | mesh | Masks/accessories, hats/caps |
| `geometry.ringAttire` | mesh + texture | Short / Long / Wrestling / Pants / Full Body |
| `geometry.upperBody` | mesh + texture | No Sleeve / Sleeve S / Sleeve L / Others |
| `texture.tattoo` | texture | 26 options |
| `geometry.gloves`, `wristBand` | mesh | 7 / 7 options |
| `geometry.elbowPadL/R`, `kneePadL/R` | mesh, per-side | 7 / 15 options |
| `geometry.feet` | mesh | Boots / Leg Guards / Pull-Ons / Others / none |
| `geometry.entranceAttire`, `weapon` | mesh, entrance-only | costumes / 14 props |

Option counts describe the AKI reference target, not a launch requirement — the manifest grows as parts are authored.

---

## 3. Character loader (runtime assembly)

The loader turns a recipe into a posed, animatable character. Core sequence:

```js
import { SceneLoader, TransformNode } from "@babylonjs/core";

export async function loadWrestler(recipe, attireIndex, scene, assets) {
  const attire = recipe.attires[attireIndex] ?? recipe.attires[0];

  // 1. Skeleton + animations (cached: loaded once, cloned per character)
  const { skeleton, animationGroups } = await assets.getSkeleton(scene);

  // 2. Root node — all world placement happens here, never on parts
  const root = new TransformNode(attire.profile.name, scene);

  // 3. Instantiate parts: body-type preset first, then geometry slots
  const parts = {};
  const slots = {
    ...assets.bodyPreset(attire.appearance.body.type), // base torso/arms/legs meshes
    ...attire.appearance.geometry,
  };
  for (const [slot, partId] of Object.entries(slots)) {
    if (!partId) continue; // nullable slot = none
    const mesh = assets.instantiatePart(partId, scene); // clone from parts.glb
    mesh.skeleton = skeleton;       // the load-bearing line: shared rig
    mesh.parent = root;
    parts[slot] = mesh;
  }

  // 4. Composite skin tone, tattoo, attire colors, face into one texture (see §4)
  applyAppearanceTextures(parts, attire.appearance, scene);

  // 5. Height via skeleton scale (see §5)
  applyHeight(skeleton, attire.profile.height);

  return { root, skeleton, parts, animationGroups };
}
```

Because every part was skinned against the same rig, assigning the shared `skeleton` makes one `AnimationGroup` drive all parts in lockstep. Swapping a part at runtime is three lines:

```js
function swapPart(character, slot, newPartId, scene, assets) {
  character.parts[slot]?.dispose();
  const mesh = assets.instantiatePart(newPartId, scene);
  mesh.skeleton = character.skeleton;
  mesh.parent = character.root;
  character.parts[slot] = mesh;
}
```

### Babylon-specific gotchas

- **The glTF loader's `__root__` node.** Babylon's GLTF loader wraps imports in a `__root__` transform (with a handedness-flip scale). Reparent instantiated parts out of it onto the character root, or bake the flip — don't stack character transforms on top of `__root__`.
- **Clone, don't reload.** Load `parts.glb` once into an `AssetContainer`; `instantiatePart` clones from it. Cloning shares geometry buffers, so 6 wrestlers wearing the same boots cost one vertex buffer.
- **Retargeting animation groups.** When cloning a skeleton per character, clone the animation groups with a target-remapping function so each character's groups drive its own skeleton clone, not the original.
- **Bounding boxes.** Skinned meshes don't auto-update bounds with animation; call `refreshBoundingInfo(true)` (apply-skeleton flag) where picking/collision needs accurate boxes, or use fixed gameplay collision volumes instead (recommended — the AKI approach).

---

## 4. Texture compositing (the texture-swap path)

Texture-only customization — faces, attire patterns, logos, skin tone — never touches geometry. All of a wrestler's texture choices composite into a **single `DynamicTexture`** at assembly time:

```js
const SKIN_TONES = [
  "#f7c2a1", "#edaa89", "#c48061", "#d89671",
  "#8a5240", "#734040", "#543430", "#541910",
]; // canonical 8-tone palette from edit-a-superstar.md

function applyAppearanceTextures(parts, appearance, scene) {
  const tex = new DynamicTexture("attire", { width: 256, height: 256 }, scene, false,
    Texture.NEAREST_SAMPLINGMODE); // crisp N64 pixels
  const ctx = tex.getContext();

  // Layer order matters: skin → tattoo → attire → face details
  drawTintedGrayscale(ctx, "base_" + appearance.body.type,
    SKIN_TONES[appearance.body.skinTone]);
  if (appearance.texture.tattoo) drawLayer(ctx, appearance.texture.tattoo);
  drawTintedGrayscale(ctx, appearance.geometry.ringAttire, appearance.colors.attire);
  drawLayer(ctx, appearance.texture.face);
  if (appearance.texture.facialHair) drawLayer(ctx, appearance.texture.facialHair);
  tex.update(false); // no mipmap regen needed at this size

  const mat = new StandardMaterial("wrestlerMat", scene);
  mat.diffuseTexture = tex;
  for (const mesh of Object.values(parts)) mesh.material = mat;
}
```

Base body textures are authored as **grayscale** (high-contrast muscle definition for the heavyweight torso, deltoid/quad shading designed to wrap low-poly limb cylinders without distortion — see the Grayscale Base Textures notes in `edit-a-superstar.md`) and tinted at composite time with one of the eight canonical skin tones. The same tint-a-grayscale technique handles recolorable attire, which is how one trunks texture serves every color the CAW offers. Tattoos composite between skin and attire so clothing correctly covers ink.

One material + one texture per wrestler keeps state changes minimal regardless of how many parts the character uses. `NEAREST_SAMPLINGMODE` preserves the N64 texel look.

Keep the two customization paths separate in code and UI (the recipe's `geometry` vs `texture`/`colors` split):

| Path | Examples | Mechanism | Cost |
|---|---|---|---|
| Texture swap | face, facial hair, tattoo, skin tone, attire colors | redraw DynamicTexture | ~free |
| Geometry swap | body type, hair, masks, attire pieces, pads, boots | `swapPart()` | clone + dispose |

---

## 5. Body sizing (body types + height scale)

Body variation comes from two mechanisms, matching the source game's model:

**Body type is a part-set preset, not a morph.** The reference taxonomy uses discrete body types (Skinny/Medium/Thick/Fat plus signature builds like Austin, HBK, Rikishi, Rock) rather than continuous sliders. Each `body.type` maps to a preset of base meshes (torso, arms, legs) in the parts manifest; selecting one is just a batch of `swapPart()` calls. Distinct silhouettes per type read better at N64 fidelity than slider morphs, and it sidesteps the rigging headaches of extreme vertex morphs.

**Height scales the skeleton.** `profile.height` (5'0–7'11) maps to a uniform scale on the skeleton root, so everything skinned to it scales together and composes with any body type:

```js
const BASE_HEIGHT_IN = 72; // rig is authored at 6'0

function applyHeight(skeleton, heightInches) {
  const s = heightInches / BASE_HEIGHT_IN;
  skeleton.bones.find(b => b.name === "root")?.scale(s, s, s);
}
```

Optional per-region bone-scale tweaks (neck, limbs) can be added later as a VPG extension; if so, factors are clamped (e.g. `0.85–1.20`) so extreme values can't break animations or hitboxes. Gameplay-side, `profile.weight` feeds the damage/lift logic but never the renderer.

---

## 6. The CAW editor

The editor is a thin UI over the loader. There is no separate "preview renderer":

1. Open editor → `loadWrestler(defaultRecipe)` produces the live preview character.
2. Every UI selection mutates the in-memory recipe, then applies the cheapest matching operation: `swapPart()` for geometry slots, texture re-composite for texture/color slots, `applyHeight()` for height.
3. **Save** = validate + write the recipe JSON. Nothing about the assembled meshes is persisted.
4. **Load/share** = parse recipe → `loadWrestler()`.

Because preview and gameplay use the identical assembly path, what you see in CAW is exactly what enters the ring.

The editor's page structure follows the six Edit-a-Superstar pages (`Profile / Music`, `Appearance`, `Moves`, `Fighting Style`, `Parameter`, `Ally / Enemy` — full option taxonomy in [`edit-a-superstar.md`](./edit-a-superstar.md)). Pages 1–2 edit the active entry in `attires[]`; pages 3–6 edit `shared`. An attire selector (up to 4 slots) switches which attire entry pages 1–2 target — switching attires in the editor is just `loadWrestler()` with a different attire index, and the loader signature is `loadWrestler(recipe, attireIndex, scene, assets)` throughout. The `Parameter` page enforces the point-buy rule from the reference: ten values (off/def × Head, Body, Arms, Legs, Flying), each 1–5, total ≤ 30, with new CAWs starting at all 1s and 20 points to distribute.

---

## 7. Optional bake step (performance)

Runtime assembly leaves each wrestler as ~6–20 separate skinned meshes. At VPG poly counts this is usually fine, but multi-man matches multiply draw calls. The bake step flattens an assembled character at **match load**:

- `Mesh.MergeMeshes(meshList, true, true, undefined, false, true)` — the final `true` enables multi-material support. Bone weights survive merging when all sources share the same skeleton and bone ordering (guaranteed by the export rules in §1).
- The DynamicTexture compositing in §4 already gives one material per wrestler, so the merged result is **one mesh, one material, one draw call** per character.

The recipe stays the source of truth; the bake is a derived, disposable artifact rebuilt on every match load. **Do not implement this until profiling shows the need** — the architecture allows bolting it on later without changing anything upstream.

---

## Module layout (within this repo)

Character code sits in `src/character/`, a sibling to `src/renderer/`. The renderer owns the scene/arena; the character system produces assembled characters and hands them to it. Recipe data and schemas use the existing top-level `data/` folder, loaded via the helpers in `src/data/`.

```
assets/characters/
  wrestler-parts.blend   # master Blender file (canonical rig + all parts)
  skeleton.glb           # armature + animations export
  parts.glb              # parts library export
data/
  schemas/wrestler.schema.json  # recipe JSON schema (§2)
  parts-manifest.json           # build-generated slot → allowed part IDs + body presets
  wrestlers/*.json              # built-in roster recipes
docs/
  character-system.md           # this doc
  edit-a-superstar.md           # reference taxonomy: slots, options, pages, rules
src/character/
  assets.js        # AssetContainer loading + caching, bodyPreset() lookup
  loader.js        # loadWrestler(), swapPart()
  textures.js      # DynamicTexture compositing (grayscale tint pipeline)
  sizing.js        # applyHeight(), optional bone-scale extensions
  recipe.js        # schema validation, migration, (de)serialization, share codes
  caw/             # editor UI (consumes loader.js, owns no rendering logic)
tests/
  character/       # Vitest coverage: recipe validation, parameter point-buy, swap logic
```

## Invariants checklist

When adding parts or touching the pipeline, these must remain true:

- [ ] Every part GLB export has all transforms applied (local space == world space)
- [ ] Every part is skinned to the canonical skeleton with identical bone names/order
- [ ] Part mesh names are stable IDs referenced by recipes — never rename, only deprecate
- [ ] Recipes validate against the manifest before loading; unknown schema versions are rejected
- [ ] No code path persists generated meshes — recipes are the only saved character data