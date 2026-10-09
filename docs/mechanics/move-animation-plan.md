# Move Animation Plan

**Status:** proposed, 2026-10-08. Nothing here is built yet.

How move animations are stored, how a move in `moves.json` finds its
animation, how the wrestler on the receiving end is animated, and how a
character's moveset is recorded. It ends with the concrete first job: take
the clips the Combat System Test plays today, give each its own file, attach
them to real moves, and give those moves to Steve Austin.

For how this fits the rest of the combat design, see
[move-system.md](move-system.md).

---

## Decisions to confirm

Each is argued in the section it links to. They are listed first because the
work order depends on them.

| # | Decision | Recommendation |
|---|---|---|
| 1 | Where animation GLBs live | `assets/animations/{moves,reactions,common}/` — [§2](#2-directory-layout) |
| 2 | One file per what | One GLB per `animation_id`, holding every clip that animation needs, both roles — [§3](#3-one-file-per-animation) |
| 3 | Second field for the receiver | **No second field on the move.** Paired moves carry the target clip inside the same file; strikes use engine-chosen reactions — [§4](#4-the-receiver-actor-and-target) |
| 4 | Where frame data lives | A new manifest, `data/animations/animations.json`, keyed by `animation_id` — [§5](#5-the-animation-manifest) |
| 5 | How a moveset names a move | A new unique `move_key` on every move, because `move_id` is not unique — [§6](#6-changes-to-movesjson) |
| 6 | Where movesets live | `data/characters/<character-id>.json` — [§7](#7-character-movesets) |
| 7 | Skeleton rule | One canonical rest pose; every character is bound to it — [§3](#3-one-file-per-animation) |

---

## 1. Where things stand

Checked against the code on 2026-10-08.

- **`animation_id` is null on all 878 moves.** The field exists in
  `moves.json` and its schema, and nothing reads it.
- **Every clip is baked into the character GLB.** `steve_austin.glb` carries
  16 clips; `CharacterController` plays them by name through the `Anim` table
  in `src/game/config.ts`. `REQUIRED_CLIPS` lists all 16 as mandatory.
- **The combat test does not use the catalog.** It plays three moves
  hardcoded in `src/combat/moves.ts`, keyed by kebab-case slot ids
  (`weak-arm-strike-1`) that do not match `move-slots.json`
  (`weak_arm_strike_1`). Only the punch and kick are wired to `Match`; the
  top-rope dive animates but deals no damage.
- **Frame data lives in code.** `totalFrames`, `hitFrames` and
  `reversalWindow` are derived in `moves.ts` from hand-measured clip lengths.
- **`move_id` is not unique, even within a slot.** `elbow_strike` exists in
  `grappling`, `standing` and `turnbuckle`. Sixteen slots list the same
  `move_id` twice as power variants — `front_strong_grapple_1` offers two
  `drop_suplex_01`s, two `fallaway_slam`s, and six more pairs.
- **Characters share bone names but not rest poses.** All three runtime
  GLBs have the same 65 joints. Austin's rest pose differs from
  `Superhero_Male` on 11 bones; Male and Female differ on 54. This is why
  `tools/blender_retarget.py` bakes clips per character.
- **`data/characters/` is empty.** Austin's parameters are in
  `src/combat/profiles.ts`; there is no moveset anywhere.

---

## 2. Directory layout

```text
assets/animations/
├── moves/       one GLB per move animation_id      punch_cross.glb, roll.glb
├── reactions/   target reactions the engine picks  hit_chest.glb
└── common/      locomotion and engine transitions  idle.glb, walk.glb, climb.glb
```

- **`moves/`** — anything a slot can fire: strikes, grapples, submissions,
  dives, taunts, evasions. Paired grapples hold both wrestlers' clips.
- **`reactions/`** — what the target plays when a *solo* move connects:
  hit-head, hit-body, knocked-down. Reused across hundreds of strikes, which is
  why they are not per-move (see §4).
- **`common/`** — clips no slot fires: idle, walk, run, block, jump, rope
  rebound, corner climb and perch. Change **I** in the
  [stress test](state-vocabulary-stress-test.md) calls these engine-owned
  transitions; they are not moves and should never appear in `moves.json`.

**Why `assets/animations/` and not `assets/runtime/`.** The planned asset
restructure makes `assets/` the single shipped tree and Vite's `publicDir`.
JSON references repository paths and `resolveAsset()` hides which mechanism
serves them, so a file placed at `assets/animations/...` now keeps its path
through the restructure. Until then it is served by adding
`../../assets/animations/**/*.glb` to the glob in `src/data/assets.ts`.

Source files — `.blend` scenes, Mixamo downloads — stay out of this tree,
under the same rule as `assets/source/`.

---

## 3. One file per animation

An animation GLB contains **an armature and its clips, no mesh**. It is
loaded once into an `AssetContainer` and its animation groups are cloned onto
each wrestler that needs them, retargeted by bone name.

### Clip names inside the file

| Clip name | Meaning |
|---|---|
| `actor` | The wrestler performing the move. Required. |
| `target` | The wrestler receiving it. Present only in paired animations. |
| `actor.start`, `actor.loop`, `actor.end` | Phases, where a move has a variable-length middle. |
| `target.start`, ... | Same, for the target. |

Phases exist for moves whose length the engine decides: the top-rope dive
(launch, airborne until contact, land), submissions (apply, wrench loop,
release), pins. A fixed-length move has a single `actor` clip.

`actor` / `target` are the slot vocabulary from `move-slots.json`, not
`attacker` / `defender`. On a counter slot the actor is the engagement's
defender; naming clips by engagement role would invert them on exactly the
moves where getting it wrong is most visible.

### The skeleton rule

A clip only plays correctly on a skeleton whose rest pose it was baked
against. Bone names matching is not enough — Austin and `Superhero_Male`
share names and still differ on 11 rest rotations.

**Rule: one canonical rig, Austin's.** Every character mesh is bound to that
rest pose, the way Austin was rebound on Oct 5. Every animation file is
exported against it. A validator compares each character GLB's joint rest
transforms with the canonical rig and fails on drift.

The alternative — baking every animation once per character — multiplies
files by roster size and is what this plan exists to get away from. The
Quaternius `Superhero_*` models would need rebinding or retiring before they
can use shared files; until then they keep their baked clips.

---

## 4. The receiver: actor and target

The question was whether moves need a second field for the receiver's
animation. **Recommendation: no.** One `animation_id` per move, and the
receiver is handled in one of two ways depending on the kind of move.

**Paired moves — grapples, submissions, pins, most finishers.** The two clips
are one piece of authoring: animated together in one Blender scene, same
length, contact on the same frame, the target positioned relative to the
actor. Put both in one file as `actor` and `target`, plus an alignment
offset in the manifest. A second field would let `animation_id` and
`target_animation_id` point at clips from different scenes, and nothing could
catch the mismatch until it played wrong on screen.

**Solo moves — strikes, dives, running attacks.** The target does not have a
bespoke clip. It plays a reaction chosen by the engine from what the move
did: the body part hit, the outcome (hit, blocked, countered), and whether it
knocks down. This is how AKI works — a few dozen reactions cover every strike —
and it means 700-odd strikes need no per-move target authoring at all.

**The escape hatch.** If a solo move ever needs a bespoke reaction, the
manifest entry gets an optional `target_reaction` naming a file in
`reactions/`. That stays in the animation manifest, not on the move, so
`moves.json` never has two animation fields that can disagree.

| Move kind | `animation_id` points at | Target plays |
|---|---|---|
| Paired | a `moves/` file with `actor` + `target` | the file's `target` clip |
| Solo with target | a `moves/` file with `actor` only | an engine-chosen `reactions/` clip |
| No target (taunt, evasion) | a `moves/` file with `actor` only | nothing |

If you would rather have the explicit `target_animation_id` field anyway,
the cost is a validator rule that forbids it on paired animations; everything
else in this plan is unchanged.

---

## 5. The animation manifest

`data/animations/animations.json`, with a schema in `data/schemas/`. One
entry per `animation_id`. It holds everything that is a property of the
*timeline* — which frame the fist lands on is a fact about the clip, not the
move, and changes whenever the clip is re-exported.

```jsonc
{
  "schema_version": 1,
  "animations": [
    {
      "animation_id": "punch_cross",
      "file": "assets/animations/moves/punch_cross.glb",
      "kind": "solo",                     // solo | paired | reaction | common
      "loop": false,
      "events": {
        "hit": [0.32],                    // seconds into the actor clip
        "counter_window": [0.20, 0.32]    // target may fire a counter slot
      },
      "placeholder": false
    },
    {
      "animation_id": "snap_suplex",
      "file": "assets/animations/moves/snap_suplex.glb",
      "kind": "paired",
      "loop": false,
      "events": { "hit": [1.40] },
      "target_offset": { "x": 0, "z": 0.75, "facing": "toward_actor" }
    }
  ]
}
```

- **Times are seconds into the clip**, converted to simulation frames at
  load with the same `Math.round(s * SIM_HZ)` that `moves.ts` uses today.
  That keeps the data independent of `SIM_HZ`, and the conversion is
  deterministic.
- **`totalFrames` is not stored.** It is the clip's length, read from the
  GLB at load. Storing it would let the two drift.
- **`counter_window`, not `reversal_window`.** A strike counter (`[R]`
  during the punch, the `counter_punch` slot) cancels the move with the
  opponent's own slot, which the stress test's change **C** calls
  `countered`. A grapple reversal is a spirit-based RNG roll during the hold,
  per [REVERSALS.md](REVERSALS.md), and does not need a window on the clip at
  all. Keeping the names apart keeps the two mechanics apart.
- **`placeholder: true`** marks a clip standing in for the real thing, such
  as `Sword_Attack` for a kick. The move editor can list them; nothing else
  treats them differently.

---

## 6. Changes to `moves.json`

All additive. `schema_version` stays 2; v3 is reserved for role-keyed
effects.

**`animation_id` — semantics tightened, shape unchanged.** It must name an
entry in the manifest. Many moves may share one: the 20 `weak_leg_strike`
kicks can all point at one placeholder until they get their own.

**`move_key` — new, required, globally unique.** Movesets need to name
exactly one move, and `move_id` cannot do that. Format:

```text
<position>.<move_id>             standing.jab
<position>.<move_id>.<power>     grappling.fallaway_slam.d   (variants only)
```

Generated once by a script for all 878 moves, then stable — renaming a
`move_id` must not change its key. The validator enforces uniqueness.

**`damage` — new, optional, nullable.** What
[move-damage.md](move-damage.md) §3 and `MoveData` need and the catalog
lacks:

```jsonc
"damage": {
  "base_health": 8,                 // D in every damage factor
  "body_part_used": "arms",         // selects the attacker's offense
  "body_part_hit": "head",          // selects the defender's defense
  "joint_stamina": { "head": 1.5 },
  "technical": false
}
```

Null means not yet tuned, and a move with null damage cannot be selected in
play. This plan fills it for four moves. The other 874 wait on the power-tier
→ base-damage table, an open question in
[move-system.md](move-system.md#open-decisions).

---

## 7. Character movesets

`data/characters/steve-austin.json`, one file per character, with
`data/schemas/character.schema.json`. The file is named by the character id
already used in `profiles.ts` and `COMBAT_TEST_CHARACTER`.

```jsonc
{
  "schema_version": 1,
  "character_id": "steve-austin",
  "name": "Stone Cold Steve Austin",
  "model": "assets/runtime/models/steve_austin.glb",
  "moveset": {
    "weak_arm_strike_1": "standing.jab",
    "weak_leg_strike_1": "standing.front_kick_01",
    "flying_top_turnbuckle_standing_opponent": "turnbuckle.flying_body_press",
    "evasion": "running.roll"
  }
}
```

- **Keys are slot ids, values are move keys.** A missing slot is empty — the
  input does nothing, as in AKI when a slot has no move.
- **The validator cross-checks** that every slot id exists and every
  assigned move lists that slot in its `slot_ids`.
- **snake_case**, following `moves.json`, since the file is mostly
  references into it.
- **Parameters stay in `profiles.ts` for now.** They belong in this file
  eventually, but moving them is separate work.

---

## 8. First job: extract the combat test clips

Sixteen clips are baked into `steve_austin.glb`. Each gets its own file.

| Clip today | Plays when | New file | `animation_id` | Move | Slot |
|---|---|---|---|---|---|
| `Punch_Cross` | punch key | `moves/punch_cross.glb` | `punch_cross` | `standing.jab` | `weak_arm_strike_1` |
| `Sword_Attack` | kick key | `moves/sword_attack.glb` | `sword_attack` *(placeholder)* | `standing.front_kick_01` | `weak_leg_strike_1` |
| `NinjaJump_Start` / `_Idle_Loop` / `_Land` | dive off the top | `moves/ninja_jump_dive.glb` as `actor.start` / `.loop` / `.end` | `ninja_jump_dive` | `turnbuckle.flying_body_press` | `flying_top_turnbuckle_standing_opponent` |
| `Roll` | guard while sprinting, evade | `moves/roll.glb` | `roll` | `running.roll` | `evasion` |
| `Hit_Chest` | rope rebound | `reactions/hit_chest.glb` | `hit_chest` | — | — |
| `Sword_Block` | guard | `common/block.glb` | `block` | — | — |
| `Idle_Loop`, `Walk_Loop`, `Sprint_Loop` | locomotion | `common/idle.glb`, `walk.glb`, `run.glb` | `idle`, `walk`, `run` | — | — |
| `Jump_Start` / `_Loop` / `_Land` | jump key | `common/jump.glb` as phases | `jump` | — | — |
| `ClimbUp_1m` | corner climb | `common/climb.glb` | `climb` | — | — |
| `Crouch_Idle_Loop` | perched on the top rope | `common/perch.glb` | `perch` | — | — |

Choices worth checking:

- **`jab` for the cross.** No weak arm strike in the catalog is a cross; the
  jab is the nearest straight punch.
- **`front_kick_01` gets a sword swing.** Flagged `placeholder: true` so it
  is findable. The alternative is leaving the kick unassigned until a real
  clip exists, which takes the kick out of the combat test.
- **`flying_body_press` for the dive.** `NinjaJump` is a tucked leap that
  reads closer to a body press than to the other 16 options.
- **`Hit_Chest` becomes a reaction.** It is still the rope-rebound clip, and
  it also becomes the first strike reaction, so the opponent finally reacts
  when hit.
- **Jump stays.** It is not a wrestling move and has no slot. It is kept in
  `common/` because the combat test binds it, and can be dropped with the
  binding.

Damage and timing for the three moves carry over unchanged from `moves.ts`:
the jab gets 8 base / arms→head, the kick 11 / legs→body, the dive 18 /
flying→body. The roll has no damage.

**How to split.** The clips are already baked against Austin's rig, so the
split is a pure GLB operation — keep the armature nodes and one animation,
drop meshes, skin and textures. A Node tool beside
`tools/prepare-character-glb.mjs`, which already parses GLBs by hand, does
this with no Blender and produces files that play identically to today.
New clips go through Blender export against the canonical rig instead.

---

## 9. Runtime

| Piece | Where | Does |
|---|---|---|
| Animation manifest loader | `src/data/animationCatalog.ts` | Loads and indexes the manifest, converts event times to frames |
| Character loader | `src/data/characters.ts` | Loads movesets; `moveFor(characterId, slotId)` |
| Move assembly | `src/combat/` | Combines catalog move + damage + manifest timing into the `MoveData` that `Match` already takes |
| Animation library | `src/renderer/AnimationLibrary.ts` | Loads each GLB once into an `AssetContainer`, clones its groups onto a wrestler by bone name |
| `AnimationController` | existing | Gains an `add(groups)` method so clips can arrive after construction |

`Match`, `damage.ts` and `reversal.ts` do not change: they already consume
`MoveData`. What changes is where `MoveData` comes from.

`CharacterController` stops naming clips through `Anim.PUNCH` / `Anim.KICK`
and asks for the move in the slot instead. The `Anim` table shrinks to the
`common/` clips, and `REQUIRED_CLIPS` with it.

**Combat test inputs.** In `move-slots.json`, `weak_arm_strike_1` and
`weak_leg_strike_1` are both `[B]`, split by range — arm close, leg mid. The
test has separate punch and kick keys. Keep the keys for now, mapped to the
two slot ids; range-based selection arrives with the slot resolver.

---

## 10. Validation

Added to `npm run validate:data`, so they also gate `npm test`:

1. Manifest: schema, unique `animation_id`, `file` exists (existing asset
   check covers this), event times within the clip length.
2. Every non-null `animation_id` in `moves.json` names a manifest entry.
3. `move_key` unique across the catalog.
4. Movesets: slot exists, move key exists, move lists the slot.
5. Every GLB in `assets/animations/` has the clip names its `kind` requires
   (`paired` → `actor` and `target`).
6. Character rest pose matches the canonical rig.

Checks 5 and 6 read GLB JSON chunks, which `prepare-character-glb.mjs`
already shows how to do without a dependency.

---

## 11. Work order

Each step leaves the game working.

1. **Confirm the decisions** at the top.
2. **Split tool + files.** Write the splitter, produce the 12 files in §8.
   Nothing reads them yet.
3. **Data.** Manifest and schema; `move_key` and `damage` added to
   `moves.json` and its schema; `steve-austin.json` and its schema;
   validator checks 1–5. `npm test` passes.
4. **Loaders** for the manifest and characters, with unit tests: Austin's
   `weak_arm_strike_1` resolves to a `MoveData` equal to today's
   `MOVES["weak-arm-strike-1"]`.
5. **Animation library** and `AnimationController.add`. Austin loads his
   clips from `assets/animations/` while his GLB still carries the baked
   copies; play both and compare.
6. **Switch the combat test** to resolve moves through Austin's moveset.
   Wire the dive to `Match` so it deals damage. Delete `src/combat/moves.ts`.
7. **Strip clips from `steve_austin.glb`** once nothing plays the baked
   copies. Validator check 6.
8. **Docs.** Update `data/README.md`, `data/AGENT.md` (which also still says
   919 moves; the file has 878), and mark this plan done.

---

## Out of scope

- The in-app move editor. It will populate `animation_id` and `damage` in
  bulk and should be built against the fields defined here.
- The power-tier → base-damage table for the other 874 moves.
- Grappling, the slot resolver, and the HSFM states. This plan gives them
  the data they will read; it does not build them.
- Rebinding the Quaternius `Superhero_*` models to the canonical rig.
