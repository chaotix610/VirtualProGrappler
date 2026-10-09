# AKI Rig Migration Plan

**Status:** decided 2026-10-09, not built.

**Decision:** the 19-bone AKI rig and its clips completely replace the
65-bone Quaternius skeleton and every clip built for it — the Quaternius
Universal Animation Library clips (both libraries) and the Mixamo-era
pipeline that fed them. There is one skeleton in the game afterwards. No
per-rig tables, no compatibility path.

The source is `steve-austin.glb` (generator stamp: `AKI Anvil data`): one
skinned mesh, 19 joints, 111 clips.

This plan amends [move-animation-plan.md](move-animation-plan.md). That plan's
data model (manifest, `move_key`, movesets, actor/target clips) still stands;
the rig it is built on and its first job change — see
[§8](#8-changes-to-move-animation-planmd).

---

## Decisions still open

| # | Decision | Recommendation |
|---|---|---|
| 1 | Where the missing locomotion, reaction and receiver clips come from | Export them from the same AKI data. Until then, the fallbacks in [§6](#6-states-with-no-clip-yet) |
| 2 | Root motion | Keep it in the clips; the engine moves the wrestler's root by the pelvis travel — [§4](#4-root-motion) |

---

## 1. What the new file is

Measured from `~/Downloads/steve-austin.glb` and in Blender 5.0 on 2026-10-08.

| Property | AKI rig |
|---|---|
| Skeleton | 19 joints: `Pelvis` → `LowerAbdomen` → `UpperBody` → `Neck` → `Head`; arms `{Left,Right}{UpperArm,Forearm,Hand,Fingers}`; legs `{Left,Right}{UpperLeg,LowerLeg,Foot}` |
| Root | `Pelvis` is the root joint. There is no separate root bone |
| Clips | 111, sampled at 15 fps, linear, translation + rotation on every joint, no scale |
| Mesh | 1 skinned mesh, 698 verts, 23 primitives / 23 materials / 23 PNGs, all `alphaMode: MASK` + `doubleSided` |
| Size | 3.63 m tall in the `NONE` pose (node scale 0.022 over native units) |
| Facing | +Y in Blender (−Z in glTF). Verify against the game's yaw-0 convention |
| Left/right | Trustworthy: `LeftHand` sits at −X while facing +Y, which is anatomically left |
| Bone lengths | Meaningless (10–43 m once imported). Display only; the runtime ignores bone length |

Clip inventory, by kind:

- **Strikes:** `Austin Punch`, `Body Punch`, `Front Kick 01/05`,
  `Middle Kick`, `Strong Kick`, clotheslines, elbows, stomps, knee strikes.
- **Grapples and throws (attacker side only):** `Suplex`, `Piledriver 02/04`,
  `Scoop Slam`, `Stone Cold Stunner`, `Hip Throw`, `Manhattan Drop`...
- **Ground and submission:** `Camel Clutch`, `Sleeper Hold`,
  `Sitting Reverse Armbar`, `Knee Stomp`, `Groin Knee Drop`...
- **Aerial:** `Diving Elbow`, `Body Splash`, `Double Axe Handle`,
  `Flying Clothesline`, `Dropping Elbow`.
- **Counters:** `Counter Stunner`, `Counter Groin Kick`,
  `Punching Reversal`, `Enzuigiri kick reversal`, `Manhattan Drop Counter`...
- **Double-team:** `Doomsday Device`, `Double Suplex`, `Double Piledriver`,
  `Double Atomic Drop`.
- **Taunts and entrance:** `Austin`, `Austin 01–03`, `Austin (17358)`...,
  `Taunt 001`, `Taunt 005`.
- **Other:** `Roll` (evasion) and `NONE` (0.8 s, a motionless neutral stance
  that travels 0.02 m).

Notes on the names:

- **83 of 111 match a `move_id` or `name` in `moves.json`** once lower-cased
  and the numeric suffix stripped. The rest (`Austin 01`, `Ebi`, `Throw`,
  `Strong Attack [D-Pad/B]`, `Front Special Grapple`...) need a hand mapping
  or are not moves.
- **`(16868)`-style suffixes are separate animations.** `Stomp` and
  `Stomp (16868)` differ (0.87 s vs 0.93 s, different travel). Some pairs have
  identical length and travel (`Austin Elbow Drop` / `(16545)`) and should be
  compared before both are kept.
- **`Baseball Slide` has zero length.** Broken export: drop it or re-export it.

---

## 2. What gets removed

Everything that exists only for the 65-bone skeleton.

| What | Where | Notes |
|---|---|---|
| Quaternius roster entries | `CHARACTERS` in `src/game/config.ts` (Ranger, Sentinel, Scout, Vanguard) | Their meshes are skinned to 65 bones; with no 65-bone clips left they cannot animate |
| Their models and textures | `assets/runtime/models/Superhero_{Male,Female}.glb`, `assets/runtime/textures/T_Superhero_*.png` (5.2 MB) | |
| Re-skin support | `bodyMaterial`, `bodyTexture`, `tone`, `tint`, `SkinTone`, `LIGHT_TINT`/`DARK_TINT` in `CharacterDefinition` | Existed only to re-skin the shared Quaternius body |
| `opponentFor` | `src/game/config.ts` | Picks a different mesh for the opponent; with one character it is dead. The combat test already loads Austin twice |
| Retarget pipeline | `tools/blender_retarget.py` | Bakes Quaternius clips onto 65-bone characters |
| Source libraries | `assets/source/quaternius/` (142 MB), `assets/source/universal-animation-library-2/` (70 MB) | Gitignored authoring tree. Archive outside the repo before deleting |
| Old Austin | `assets/runtime/models/steve_austin.glb`; source `assets/source/characters/steve_austin*.glb`, `steve_austin_rigged.blend`, `austin/` (Mixamo, Meshy, mesh2motion attempts) | The `.blend` holds the 65-bone rig only; nothing in it carries over |
| The 16-clip `Anim` table | `src/game/config.ts` | Rewritten against AKI clip names (§5) |
| Joint lower-casing exemption comment | `tools/prepare-character-glb.mjs:196` | The exemption itself stays — AKI joints are PascalCase. The Quaternius rationale in the comment goes |
| Docs | README "Character GLBs are built by retargeting…" and "Austin is rigged to the same 65-bone skeleton…" sections; `.gitignore` and `promote-assets.mjs` header comments naming Quaternius/Mixamo | |

Handoff landmines that stop applying: **3** (the Quaternius T-pose rest is
load-bearing) and **4**'s retarget half (bone names are still a contract,
now for the AKI rig).

---

## 3. Asset pipeline

Same route as today: the raw export goes in `assets/source/`, and
`npm run assets:promote` produces the runtime file. Never drop an export
straight into `assets/runtime/` (handoff landmine 1).

1. **Source location:** `assets/source/characters/steve_austin.glb`, the
   same path the promote entry in `tools/promote-assets.mjs` already reads.
   The old file there moves out with the rest of §2.
2. **`prepare-character-glb.mjs` mostly applies already.** It works per
   primitive, so it handles 23 primitives as it handled 21 part meshes: clear
   `MASK` / `doubleSided`, atlas 23 textures into one sheet, rewrite UVs, mark
   unlit. To check on this file:
   - It throws when one UV accessor is shared by primitives in different atlas
     cells.
   - It renames part nodes to lower case. The AKI file has one mesh node
     (`SteveAustin_Mesh`) and 19 exempt joints, so only that node changes.
3. **Scale.** Bake the 3.63 m model down to the current Austin's in-game
   height (measure it from today's runtime GLB before deleting it). Apply it
   as a scale on the root node, so every clip's translations scale with it.
   Never rescale per clip.
4. **Facing.** Confirm in the browser which way he faces at yaw 0. If he
   comes in backwards, fix it with a root node rotation in the same step.
5. **Clip names.** Rename to snake_case `animation_id`s in the prepare step
   (`Austin Punch` → `austin_punch`, `Stomp (16868)` → `stomp_16868`,
   `NONE` → `idle`). Record the original name in the manifest as
   `source_clip`. Drop `Baseball Slide`.
6. **Root motion** split out in the same step (§4).

---

## 4. Root motion

Today's clips stay in place and `CharacterController` moves the body in code.
The AKI clips do not stay in place: every one animates `Pelvis` translation,
and most travel. Measured horizontal travel at 3.63 m scale: `Front Kick 01`
0.44 m, `Austin Punch` 0.94 m, `Clothesline R 01` 5.1 m,
`Swinging Neck Breaker` 6.25 m.

Played as-is, a wrestler walks away from his root node on every move and
snaps back when the clip ends.

**Recommendation: extract and apply it.** In the prepare step, take each
clip's `Pelvis` X/Z travel out of the clip and store it as a per-frame delta
(in the manifest, or as a separate track). `Pelvis` keeps its height and
sway. At runtime, `CharacterController` advances the wrestler's root by the
delta each frame while a move plays. Paired moves need this anyway, because
actor and target have to end where the clips put them.

The alternative is to zero the X/Z travel and move nothing. It is simpler, but
it breaks every running move (clotheslines, shoulder blocks) and every throw
that ends with the two wrestlers apart.

Vertical travel stays in the clip. `Flying Clothesline` drops 3.45 m because
it starts on the turnbuckle, and the engine already places him on the top rope
before a dive plays.

---

## 5. Runtime changes

| Piece | Change |
|---|---|
| `Anim` (`src/game/config.ts`) | Rewritten to AKI `animation_id`s: `IDLE: "idle"`, `PUNCH: "austin_punch"`, `KICK: "front_kick_01"`, `ROLL: "roll"`. Entries with no AKI clip yet use the fallbacks in §6. The `Sword_Attack` placeholder comment goes |
| `REQUIRED_CLIPS` | Follows the new `Anim`. Only clips that actually exist; fallbacks point at real clips |
| `CHARACTERS` | One entry, `steve-austin`, on the new file. `CharacterDefinition` loses the re-skin fields (§2) |
| `CharacterController` | Applies root motion while a move plays (§4). States with no clip yet play their fallback |
| `Opponent` | Unchanged apart from the `Anim.IDLE` value |
| `AnimationController` | No change. `durationOf` reads `framePerSecond` from the loaded group, so 15 fps data reports correct lengths. Check crossfades by eye at 15 fps keys |
| `src/combat/moves.ts` | Re-time against the new clips: `Austin Punch` is still 1.00 s, `Front Kick 01` is 0.73 s (was 1.53 s), and the dive becomes whichever clip §6 picks. The animation plan deletes this file later |
| `tests/unit/characterAssets.test.ts` | Asserts the 19-joint skeleton (names and count), the new `REQUIRED_CLIPS`, and left = −X |
| `CombatTestScene.load` | No structural change; its `missingClips` report keeps working off `REQUIRED_CLIPS` |

---

## 6. States with no clip yet

The AKI file covers 3 of the 16 clips the game plays today (punch, kick,
roll). Nothing else can stand in, because the old clips are being deleted
and could not play on 19 bones anyway.

| State (`Anim` today) | AKI clip | Fallback until exported |
|---|---|---|
| idle | `NONE` — a held pose, not a breathing loop | use as is |
| walk, run | none | `idle` held; movement still works, he slides |
| jump (3 phases) | none — AKI has no jump | **remove** the jump binding and state |
| punch | `Austin Punch` (or `Body Punch`) | — |
| kick | `Front Kick 01` | — |
| roll | `Roll` | — |
| block | none | `idle` held; blocking still works in `Match` |
| rope hit | none | `idle`; the rope beat is code-driven |
| climb, perch | none | `idle`; the position is code-driven |
| dive (3 phases) | `Body Splash`, `Diving Elbow` — whole dives, not phased | `Body Splash` played whole; dive collapses to one phase timed to the clip |

**Still needed from the AKI source** to close the gap: idle loop, walk, run,
block, rope rebound, corner climb and perch, strike reactions (head, body,
knockdown), get-up, and the receiver half of every paired move. The receiver
halves gate grappling. Without them, grapples have nothing for the opponent
to play.

---

## 7. Work order

Each step leaves the combat test running.

1. **Archive** `assets/source/quaternius/`, `universal-animation-library-2/`
   and the old Austin sources outside the repository.
2. **Pipeline.** AKI file into `assets/source/characters/steve_austin.glb`.
   The prepare step gains scale, facing, clip rename and root-motion
   extraction. `npm run assets:promote` writes the new
   `assets/runtime/models/steve_austin.glb`.
3. **Runtime swap, in one commit:** new `Anim` and fallbacks, `CHARACTERS`
   cut to Austin, re-skin fields and `opponentFor` removed, jump removed,
   `moves.ts` re-timed, unit tests updated. Verify in the browser: idle,
   movement, punch and kick land damage, roll, dive.
4. **Delete** the Quaternius models and textures from `assets/runtime/`,
   `tools/blender_retarget.py`, and the archived source trees.
5. **Root motion** in `CharacterController`, starting with the strikes, then
   the running moves.
6. **Docs:** README character-pipeline sections, the handoff ("What Austin is
   now", landmines 3–4), `.gitignore` and `promote-assets.mjs` comments,
   `data/AGENT.md`.
7. **The animation plan's split** ([move-animation-plan §8](move-animation-plan.md#8-first-job-extract-the-combat-test-clips))
   against the AKI clips: one GLB per `animation_id`, the manifest, movesets.
   With 83 clips already matching catalog moves, Austin's first moveset can be
   much more than four moves.
8. **Fill the gaps** in §6 as the second AKI export arrives.

---

## 8. Changes to move-animation-plan.md

| Section | Change |
|---|---|
| Decision 7 / §3 "The skeleton rule" | The canonical rig is the AKI 19-bone rig. The rest-pose validator compares against it |
| §1 "Where things stand" | Austin carries 111 AKI clips; the Quaternius characters are gone |
| §3 clip names | Unchanged. AKI clips become `actor`; receiver halves from the second export become `target` |
| §5 manifest | Gains `source_clip` (the original AKI name) and root-motion data (§4) |
| §8 first job | Replaced. The 16-clip table goes; the mapping is AKI clip → catalog move, starting from the 83 name matches. `front_kick_01` has a real kick, so it is no longer a placeholder |
| Out of scope: rebinding Quaternius models | Removed. The models are deleted |

---

## 9. Licensing

Deferred. The AKI data (generator stamp `AKI Anvil data`) is a stand-in: it
ships for now and is replaced with original assets before the final version.
Keep it replaceable. Engine code should depend on the 19-joint skeleton and
the `animation_id`s, never on anything specific to the AKI source.
