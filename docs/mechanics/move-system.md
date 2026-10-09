# Move System

How a button press becomes a move, an animation, and damage — and which
document owns each step. This page owns none of the rules itself. It maps
the five design documents onto one pipeline, records where they disagree
and which one wins, and lists what is built versus what is only on paper.

Checked against the code on 2026-10-08. If this page and a source document
disagree on a rule, the source document wins unless this page says
otherwise in [Where the documents disagree](#where-the-documents-disagree).

---

## The documents

| Document | Owns | Status in code |
|---|---|---|
| [HSFM Blueprint](HSFM%20Blueprint.md) | The state machine: which state a wrestler is in, which transitions are legal, and the order a move resolves in | **Not built.** None of its classes exist (`MoveInstance`, `HFSM`, `ExecutingMoveState`) |
| [move-slot-overview](move-slot-overview.md) | The human-readable list of slots and their inputs | Superseded by `data/moves/move-slots.json` (138 slots), which is canonical |
| [move-damage](move-damage.md) | Health, max health, joint stamina, the four-factor damage formula, repeating moves | **Built**: `src/combat/damage.ts`, `types.ts` |
| [Parameters](Parameters.md) | The ten 1–5 offense/defense values, the 30-point budget, what they do and do not affect | **Built**: `src/combat/profiles.ts` |
| [move-animation-plan](move-animation-plan.md) | Animation files, the animation manifest, `move_key`, character movesets | **Proposed**, not built |

Two more documents feed the pipeline and are referenced below:
[REVERSALS](REVERSALS.md) (grapple reversal odds, built in
`src/combat/reversal.ts` but never called) and the
[state vocabulary stress test](state-vocabulary-stress-test.md) (the
`actor` / `target` vocabulary and the named changes A–I for schema v3).

---

## The pipeline

One move, from input to result. Each step names the document that owns it
and the code or data that implements it, if any.

```text
 input ─► state ─► slot ─► moveset ─► move ─► animation ─► execute ─► reversal ─► damage ─► next state
```

| # | Step | Owner | Today |
|---|---|---|---|
| 1 | **Input.** Buttons are read and timestamped with the simulation frame. Tap vs hold separates weak from strong. | HSFM §4.1–4.2 | `PadInput`, `InputBuffer` |
| 2 | **State.** The wrestler's combat state decides which slots are even possible: `Neutral.Idle` can strike, `GrappleHold.FrontWeak` can pick a front weak grapple. | HSFM §2–3 | Not built. `CharacterController` has a flat `state` string |
| 3 | **Context.** Range, facing, and Special! come from the orthogonal Interaction and Special Meter regions. | HSFM §1, §6 | `inStrikeRange` in the combat test only |
| 4 | **Slot.** State + input + context resolve to one `slot_id` — a slot whose `actor_state`, `target_state`, `range`, `requires_special` and `input_pattern` all match. | move-slots.json; HSFM §4.4 | Data complete; no resolver |
| 5 | **Moveset.** The character's moveset maps the slot to one move. An empty slot does nothing. | move-animation-plan §7 | Not built. `data/characters/` is empty |
| 6 | **Move.** The move supplies power, `ko`, `bleed`, `feature`, and (planned) damage values. | moves.json; move-damage §3 | 878 moves load; 3 different ones in `combat/moves.ts` are played |
| 7 | **Animation.** The move's `animation_id` names a manifest entry, which supplies the clip(s), hit frames, counter window, and for paired moves the target clip and offset. | move-animation-plan §4–5 | `animation_id` null everywhere; clips baked into the character GLB |
| 8 | **Execute.** The move runs on the fixed 60 Hz clock. Damage is scheduled for the hit frame, not applied on the button press. | HSFM §4.8, §7; `data/AGENT.md` "How time works" | `Match.throwMove` / `Match.step` |
| 9 | **Reversal.** Strikes: the target may fire a counter slot inside the counter window. Grapples: the defender's press during the hold triggers a spirit-weighted RNG roll. | REVERSALS; HSFM §5 — see [disagreement 2](#2-when-grapple-reversals-are-decided) | Odds built, never rolled |
| 10 | **Damage.** Four factors: stamina-adjusted base, parameter bonus, spirit bonus, Special! ×1.2. Then current health, max health (¼), joint stamina. | move-damage §4–6; Parameters §3–5 | `resolveMove` in `damage.ts` |
| 11 | **Next state.** Hit stun, knockdown, grounded, or back to neutral, per the move's effects. | HSFM §3; stress test change C | Not built |

### What feeds the damage formula

The damage step pulls from four places, which is where the documents
interlock most tightly:

| Input | Symbol | Comes from | Defined in |
|---|---|---|---|
| Base health damage | `D` | the move | move-damage §3 — **no data yet**, see [open decisions](#open-decisions) |
| Body part used | selects `A` | the move | Parameters §3 |
| Body part hit | selects `B` | the move | Parameters §4 |
| Attacker offense | `A` | the attacker's profile | Parameters |
| Defender defense | `B` | the defender's profile | Parameters |
| Joint stamina of the part used | `S` | match state | move-damage §2 |
| Spirit difference | `ΔSpirit` | match state | move-damage §4.3, REVERSALS |
| Special! | — | Special Meter region | move-damage §4.4, HSFM §6 |
| Submission skill | `B` in §6.2 | both profiles | move-damage §6.2, Parameters §6 |

---

## How the data files reference each other

```text
data/characters/steve-austin.json        (planned)
  moveset: { slot_id → move_key }
        │                 │
        ▼                 ▼
data/moves/move-slots.json    data/moves/moves.json
  slot_id, actor_state,         move_key (planned), slot_ids[],
  target_state, input_pattern   power, damage (planned), animation_id
                                        │
                                        ▼
                         data/animations/animations.json   (planned)
                           animation_id → file, kind, events,
                                          target_offset
                                        │
                                        ▼
                         assets/animations/{moves,reactions,common}/*.glb
                           clips: actor, target, actor.start …
```

Profiles — the parameters — sit beside this chain in `src/combat/profiles.ts`
and are expected to move into the character file later.

---

## Vocabulary

The same idea goes by different names across the documents. These are the
names to use.

| Use | Not | Meaning | Source |
|---|---|---|---|
| `actor` / `target` | player/opponent, attacker/defender | Who performs a move, who receives it. Slot fields, clip names | stress test change A |
| `attacker` / `defender` | initiator/recipient | Roles *inside an engagement* (a lock-up). Swap on a reversal | stress test change A; REVERSALS; `damage.ts` |
| `slot_id`, snake_case | kebab-case | `weak_arm_strike_1`, not `weak-arm-strike-1` | move-slots.json |
| `move_key` | `move_id` | Unique move reference. `move_id` repeats | move-animation-plan §6 |
| power grade | power tier, move rating | S–G on a move. Not the same as `D` | moves.json |
| base health damage, `D` | move power | The number the damage formula multiplies | move-damage §3 |
| `countered` | reversed | A strike cancelled by the target's counter slot | stress test change C |
| `reversed` | countered | A grapple whose roles swap after an RNG roll | stress test change C; REVERSALS |
| Special! | special mode, finisher mode | The meter-full state | REVERSALS; move-damage |

### HSFM states and slot states

The HSFM names hierarchical states; `move-slots.json` names the leaf states
a slot requires. They describe the same thing at different resolutions.

| HSFM state | Slot state values (`actor_state` / `target_state`) |
|---|---|
| `Neutral.Idle`, `Neutral.Moving` | `standing` |
| `Neutral.Running` | `running` |
| `GrappleHold.FrontWeak` | `front_weak_grapple_attacking` (actor); `front_weak_grapple_defending` (target) |
| `GrappleHold.FrontStrong` | `front_strong_grapple_attacking` / `_defending` |
| `GrappleHold.BackWeak`, `BackStrong` | `back_weak_grapple_*`, `back_strong_grapple_*` |
| `Damage.Rising` | `getting_up` |
| `Grounded.Prone` | `down_facing_up`, `down_facing_down`, `sitting_up`, `kneeling_all_fours` — target-only today |
| *(none)* | `at_turnbuckle`, `on_turnbuckle`, `on_apron`, `running_on_apron`, `outside_ring`, `held_on_shoulders`, the `turnbuckle_*`, `apron_*` and `double_team_*` grapple states, `ducking`, `entering` |

The last row is the gap: the HSFM tree has no states for the turnbuckle, the
apron, outside the ring, or double teams, while 54 of the 138 slots require them.
The tree needs a location dimension before it can drive those slots — which
is the stress test's change **G**.

---

## Where the documents disagree

Each entry names the conflict, which side wins, and why.

### 1. The damage formula

- **Parameters §9–10:** `Effective Damage = Move Rating × (Offense − Defense)`,
  with a scale running to −4, "very low damage".
- **move-damage §4.2:** `Factor2 = ⌊max(0, A − B) · D · 0.1⌋`, added to the
  other factors. Never negative.

**move-damage wins**, and `damage.ts` implements it. Parameters §9 is a
summary of play-testing, not the formula: defense can cancel the offense
bonus but never pushes damage below Factor 1. The −1 to −4 half of
Parameters' scale does not happen. Parameters §9–10 should be rewritten to
point at move-damage rather than restate it.

### 2. When grapple reversals are decided

- **HSFM §5:** reversals are frame-window checks inside `ExecutingMove`; a
  correct input inside the window succeeds. Purely arithmetic.
- **REVERSALS:** the defender presses once *during the hold, before the
  attacker picks a move*, and the result is a spirit- and weight-weighted
  RNG roll.

**REVERSALS wins for grapples.** It is the AKI behaviour and it is what
`reversal.ts` implements. **HSFM's window model survives for strikes**: the
`counter_punch` slot is "press [R] during the opponent's punch animation",
which is a window on the attacker's clip — the `counter_window` in the
animation manifest. HSFM §5 should be split into those two cases.

### 3. How a finisher is triggered

- **HSFM §6:** `GrappleInitiation` checks Special! and *replaces* the grapple
  with the finisher automatically.
- **move-slots.json:** `front_finisher` is its own slot, entered from
  `front_strong_grapple_attacking`, with `requires_special: true` and input
  `[Control Stick]`. move-slot-overview agrees.

**The data wins.** A finisher is a slot the player chooses from a strong
hold, not an override. HSFM §6's injection point moves from
`GrappleInitiation` to the slot resolver's ordinary `requires_special`
check, which needs no special mechanism at all.

### 4. One state or two for the receiver

- **HSFM §2** keeps a single `ExecutingMove` state and lets the move
  instance decide who is attacker and defender.
- **Animation** needs the target to play a clip in lockstep with the actor.

**Compatible.** The target's clip comes from the same animation file (paired
moves) or the reaction table (solo moves), driven by the same move instance,
so no `ReceivingMove` state is needed. See move-animation-plan §4.

### 5. The worked example in move-damage

move-damage §7 applies the Special! ×1.2 bonus, which means the attacker is
in Special!, but computes Factor 1 with stamina 35. §4.1 says an attacker in
Special! is treated as having 50. With 50 the initial Factor 1 is 5, not 4,
and the total is ⌊(5 + 0 + 3) · 1.2⌋ = 9, not 8. **§4.1 wins** — it is the
rule, and `damage.ts` follows it. The example needs correcting.

### 6. Slot naming and listing

- move-slot-overview and `src/combat/moves.ts` use kebab-case ids;
  `move-slots.json` uses snake_case. **The JSON wins.**
- move-slot-overview lists `back-weak-grapple-4` under Back Strong Grapple;
  it is `back_strong_grapple_4`.
- move-slot-overview omits the counter slots, Irish whip slots and several
  others the JSON has. Treat it as an introduction, not a reference.

### 7. Small drift

- `data/README.md` and `data/AGENT.md` say 919 moves; `moves.json` has 878.
- move-damage §4.3 caps the spirit bonus at 5 but does not say what a spirit
  *deficit* does. `damage.ts` floors it at 0. That is the reading this page
  adopts.
- move-damage §1.1 says current health regenerates "to a certain extent"
  with no rate. Not implemented.

---

## Built, partly built, on paper

| Piece | State |
|---|---|
| Fixed 60 Hz sim clock, seeded RNG | Built |
| Damage formula, health, joint stamina, held limb | Built and tested |
| Parameter profiles and budget check | Built; five profiles in code |
| Reversal odds | Built and tested; nothing calls it |
| Slot and move catalog loading | Built; nothing selects from it |
| Strike scheduling on hit frames | Built for two strikes |
| Slot resolver | Not built |
| HSFM state machine | Not built |
| Grappling, pins, submissions, win condition | Not built |
| Character movesets | Planned — move-animation-plan §7 |
| Animation files and manifest | Planned — move-animation-plan §2–5 |
| Base damage for catalog moves | No data, no agreed rule |
| Repeating-move second entries | No data (move-damage §3 requires them; stress test gap) |
| Effects / outcomes (schema v3) | Designed in the stress test, not applied |

---

## Open decisions

Collected from all five documents. Decisions specific to animation storage
are listed at the top of [move-animation-plan](move-animation-plan.md).

1. **Power grade → base health damage.** Every catalog move has a grade S–G
   and none has a `D`. Either a fixed table (grade → `D`) with per-move
   overrides, or per-move values from the start. Blocks damage for 874 moves.
2. **Body part used / hit for catalog moves.** Needed by Factor 2 and joint
   stamina. Parameters §7.4 gives a play-testing method; nobody has applied it.
3. **Repeating moves.** Two entries per submission (initial and per-wrench),
   as move-damage §3 says, or one entry with a `repeat` block.
4. **HSFM location dimension.** How turnbuckle, apron, outside and double-team
   states enter the tree (stress test change G).
5. **Strike block.** HSFM §5 describes a 4-frame perfect block that negates a
   strike; no slot or document defines what a held block does outside that
   window. The combat test's block currently has no combat effect.
6. **Weak strike selection.** `weak_arm_strike_1` and `weak_leg_strike_1`
   are both `[B]`, chosen by range. The combat test uses two keys instead.
   Range selection arrives with the slot resolver.
