# State Vocabulary Stress Test

Hand-authored `effects` for six moves chosen to break the proposed three-axis
model, before 138 slots and 878 moves are committed to it.

**Verdict: adopt with named changes (A–I below). Five of the six cases needed a
special case, a new field, or a vocabulary the proposal does not have.**

The core claim survives: state must be *absolute*, and a two-body state must be
one engagement id plus a role, not two mirrored strings. Case 5 proves that
directly. Both deliberate exclusions also hold — nothing in the six wanted
facing as a stored axis, and nothing wanted `throwing_punch` as a posture.

What does not survive is the effect *shape* around the axes. Four separate
under-specifications, each hit independently by a different case.

---

## Shape under test

Roles, not sides. Slots and effects are keyed `actor` / `target` — who performs
the move and who receives it; the words `player` and `opponent` never appear.
`attacker` / `defender` are reserved for the two roles *inside* an engagement,
which is what `reversal.ts`, `damage.ts` and REVERSALS.md already mean by them.
(This is change **A**, assumed by every example below — without it the proposal
reproduces finding 5 one layer up.)

**Applied.** `move-slots.json` and its schema now carry `actor_state` /
`target_state` in place of `player_state` / `opponent_state`, at
`schema_version: 2`. The rest of change A — role-keyed *effects* — lands with
schema v3.

```jsonc
// slot
{
  "slot_id": "...",
  "preconditions":  { "actor": {...}, "target": {...} },
  "allowed_effects": { "target.posture": ["..."] },
  "default_effects": {
    "always":   { "actor": {...}, "target": {...} },   // change B
    "hit":      { "actor": {...}, "target": {...} },
    "miss":     { ... },
    "reversed": { ... },
    "escaped":  { ... }
  }
}

// move — overrides only what genuinely varies
{ "move_id": "...", "effects": { "hit": { "target": { "posture": "..." } } } }
```

---

## 1. Suplex — `snap_suplex` — CLEAN

Real move, 13 slots: `front_weak_grapple_5..8`, `front_strong_grapple_1..8`,
`front_finisher`.

```jsonc
// slot default — front_strong_grapple_1
{
  "slot_id": "front_strong_grapple_1",
  "preconditions": {
    "actor": { "engagement": "front_strong_grapple", "role": "attacker" },
    "target": { "engagement": "front_strong_grapple", "role": "defender" }
  },
  "allowed_effects": {
    "target.posture": ["down_face_up", "down_face_down", "sitting_up",
                         "kneeling", "standing", "cornered"]
  },
  "default_effects": {
    "hit": {
      "actor": { "engagement": null, "posture": "standing",     "location": "in_ring", "activity": "idle" },
      "target": { "engagement": null, "posture": "down_face_up", "location": "in_ring", "activity": "idle" }
    },
    "miss": {
      "actor": { "engagement": null, "posture": "standing", "activity": "idle" },
      "target": { "engagement": null, "posture": "standing", "activity": "idle" }
    },
    "reversed": { "swap_roles": true, "engagement": "front_strong_grapple" },
    "escaped": {
      "actor": { "engagement": null, "posture": "standing" },
      "target": { "engagement": null, "posture": "standing" }
    }
  }
}

// move override
{ "move_id": "snap_suplex", "effects": {} }
```

Nothing to override. The model works exactly as advertised: one slot default,
zero per-move authoring, and the same move riding thirteen slots across two
different engagements without the engagement leaking into the move record.

Worth noting because it validates the layering: `snap_suplex` spans both
`front_weak_grapple` and `front_strong_grapple`. If `effects` had been a flat
per-move property, that move would need to know which engagement it was
entered from. Slot-owns-engagement, move-owns-posture is the right cut.

---

## 2. Submission — `figure_4_leg_lock` — STRAINS

Slot `lower_body_submission_facing_up`: attacker `standing`, defender
`down_facing_up`, `feature: "submit"`.

```jsonc
{
  "slot_id": "lower_body_submission_facing_up",
  "preconditions": {
    "actor": { "posture": "standing",     "location": "in_ring" },
    "target": { "posture": "down_face_up", "location": "in_ring" }
  },
  "default_effects": {
    "hit": {
      "engagement": "lower_body_submission",          // (E) not one of the 15
      "actor": { "role": "attacker" },             // (F) posture omitted — the hold owns it
      "target": { "role": "defender" },
      "loop": { "repeat_move_id": "figure_4_leg_lock_wrench",   // (E) does not exist
                "exit_outcomes": ["escaped", "submitted"] }
    },
    "miss":      { "actor": { "posture": "kneeling" }, "target": {} },
    "escaped":   { "actor": { "engagement": null, "posture": "standing" },
                   "target": { "engagement": null, "posture": "sitting_up" } },
    "submitted": { "target": { "posture": "defeated" } },     // (C) fifth outcome
    "reversed":  null                                           // (C) not applicable
  }
}
```

**Posture, engagement, or both?** Both — but not independently. It produces an
engagement, and the engagement then *dictates* both postures. While a hold is
active there is no meaningful separate answer to "what posture is the
attacker in"; they are in whatever the Figure Four puts them in.

Four strains:

- **The engagement inventory is short.** `lower_body_submission` is not among
  the 15 pairs derived from the slots, because slots express this as two
  absolute states rather than an `_attacking`/`_defending` pair. Effects need
  engagements that no precondition anywhere names. Same for
  `upper_body_submission` and for `pin` (48 moves carry `feature: "pin"`).
- **Posture is not orthogonal to engagement.** It is subordinate. If effects
  must state a posture while an engagement is active, every slot restates a
  fact the engagement already fixes, and two authors will disagree about what
  a Boston Crab's attacker posture is called.
- **The outcome enum is short.** `submitted` is a distinct terminal state from
  `escaped`, and `reversed` is meaningless here — a submission applied to a
  downed body is not a lockup and has no RNG reversal roll. `allowed_effects`
  must be able to declare *which* outcomes a slot has, and the validator must
  not demand all of them.
- **The loop has nothing to point at.** `move-damage.md` §3 requires two
  entries for a repeating move (initial + per-wrench, with different base
  damage and the Submission Skill matrix applied per pulse). `moves.json` has
  one entry per move. There is no `figure_4_leg_lock_wrench`.

---

## 3. Turnbuckle, attacker's location changes mid-move — `body_splash` — STRAINS

Real move, three slots: `flying_top_turnbuckle_laying_opponent` (defender
`down_in_ring`), `..._to_outside` (defender `down_outside_ring`), and
`..._special` (defender `down_in_ring` **or** `down_outside_ring`).

```jsonc
{
  "slot_id": "flying_top_turnbuckle_laying_opponent",
  "preconditions": {
    "actor": { "posture": "on_turnbuckle", "location": "turnbuckle" },
    "target": { "posture": ["down_face_up", "down_face_down"], "location": "in_ring" }
  },
  "default_effects": {
    "always": { "actor": { "location": "in_ring" } },   // (B) true on every outcome
    "hit":    { "actor": { "posture": "kneeling",       "activity": "idle" },
                "target": { "posture": "down_face_up" } },
    "miss":   { "actor": { "posture": "down_face_down", "activity": "idle" },
                "target": {} },
    "reversed": null,
    "escaped":  null
  }
}

// the _special variant, same move, disjunctive precondition
{
  "slot_id": "flying_top_turnbuckle_laying_opponent_special",
  "default_effects": {
    "always": { "actor": { "location": "$target.location" } }   // (B) awkward
  }
}

// move override
{ "move_id": "body_splash", "effects": {} }
```

- **`always` is needed, not optional.** The attacker leaves the turnbuckle on
  every outcome — hit, miss, whatever. Without an `always` block you repeat
  the location in every branch, and then a validator cannot distinguish "the
  author meant unchanged" from "the author forgot".
- **Miss changes the attacker, not the defender.** The proposal's framing
  ("moves override only what genuinely varies — in practice usually just the
  opponent's posture on hit") is true of grapples and false of aerials. Here
  the interesting authoring is on `miss.actor`.
- **`_special` cannot take a literal.** Its precondition spans two locations,
  so its effect must reference one — `$target.location` or a `$keep`
  sentinel. Two of the 138 slots have disjunctive preconditions that cross
  locations (`flying_top_turnbuckle_laying_opponent_special`,
  `flying_top_turnbuckle_standing_opponent_special`); both are `requires_special`.
  Small blast radius, but the shape has to support it.
- **Posture and location are not orthogonal.** `on_turnbuckle` (posture)
  entails `turnbuckle` (location). So does `cornered`, so does `tree_of_woe`.
  On exit you must clear both, and nothing in the model stops
  `{posture: on_turnbuckle, location: outside}`.
- **`reversed` here means something else.** `front_flying_move_counter` exists
  (attacker `standing`, defender `on_turnbuckle_facing_player`) but it is a
  *separate slot the defender picks before the jump*, not an outcome of this
  move. The data has two unrelated mechanisms both called reversal.

---

## 4. Irish whip — BLOCKED, and it strains

**There is no Irish whip in the data.** No move in `moves.json` whips. No slot
in `move-slots.json` produces `running_toward_from_weak_whip` or
`running_toward_from_strong_whip`. `REVERSALS.md` names the input — C-Down from
a tie-up, listed alongside A and B as a grapple move — and there is no C-Down
slot. All five `irish_whip`-position slots are unfilled.

So the producer has to be invented to author this case at all:

```jsonc
{
  "slot_id": "front_weak_grapple_irish_whip",   // DOES NOT EXIST — must be added
  "preconditions": {
    "actor": { "engagement": "front_weak_grapple", "role": "attacker" },
    "target": { "engagement": "front_weak_grapple", "role": "defender" }
  },
  "default_effects": {
    "hit": {
      "actor": { "engagement": null, "posture": "standing", "activity": "idle" },
      "target": { "engagement": null, "posture": "standing",
                    "activity": "whipped_weak",
                    "destination": "far_ropes" }      // (H) not on any axis
    },
    "reversed": { "swap_roles": true },
    "miss": null, "escaped": null
  }
}
```

**Does the axis split hold? Half of it.** Splitting
`running_toward_from_weak_whip` into `posture: standing` +
`activity: whipped_weak` is a real improvement — the consumer slot
(`weak_irish_whip_grapple_1`) reads only the activity and does not care about
posture, which is exactly what an axis should buy. But:

- **The activity needs a destination, and destination is not posture, location,
  or activity.** It is a target the body is travelling *toward*. Whipped to the
  far ropes → rebounds into `activity: running`. Whipped into the corner →
  terminates in `posture: cornered` and arms `irish_whip_to_corner_counter`.
  Same activity value, two different terminal states. Either `activity` takes a
  parameter or you enumerate `whipped_weak_to_ropes` / `whipped_weak_to_corner`
  and it stops being an axis.
- **The termination is engine-owned.** Nothing in `moves.json` can say what
  happens when the whipped body reaches the ropes. The graph closes through an
  engine transition or not at all.
- **The activity axis currently has zero producers.** `idle` is the default,
  `running` comes from input, and `whipped_weak` / `whipped_strong` are
  produced by exactly one move — which does not exist. The axis ships
  unexercised.

---

## 5. Counter / reversal — `counter_snapmare` — MODEL CLEAN, GRAPH BROKEN

```jsonc
// the attacker's move, back_weak_grapple_1 — outcome branch
"reversed": { "swap_roles": true, "engagement": "back_weak_grapple" }

// the landing site
{
  "slot_id": "back_weak_grapple_counter",
  "preconditions": {
    "actor": { "engagement": "back_weak_grapple", "role": "defender" },
    "target": { "engagement": "back_weak_grapple", "role": "attacker" }
  },
  "default_effects": {
    "hit": { "actor": { "engagement": null, "posture": "standing" },
             "target": { "engagement": null, "posture": "down_face_up" } }
  }
}

// move override — a snapmare leaves them seated, not flat. The one genuine
// per-move override in all six cases.
{ "move_id": "counter_snapmare", "effects": { "hit": { "target": { "posture": "sitting_up" } } } }
```

**Yes, the engagement id survives the swap — cleanly, and this is the single
strongest argument for the proposal.** `back_weak_grapple` stays one id; only
`role` flips. Under today's vocabulary the same event is two independent string
rewrites on two different bodies, and an effect that said
`"opponent": "back_weak_grapple_defending"` would mean the wrong thing to
whichever side read it. That is finding 5 exactly, and roles dissolve it.

Two problems, neither in the model:

**Nine of fifteen engagements have nowhere to land.** Counter slots exist only
for `back_weak_grapple`, `back_strong_grapple`, and the two apron families
(`counter_grapple_from_apron`, `counter_grapple_from_apron_apron`). There is no
`front_weak_grapple_counter`, no `front_strong_grapple_counter`, none of the
four turnbuckle grapple counters, and none of the three double-team ones. A
reversed front grapple has no slot to enter. Today that is invisible because
nothing declares effects; the moment effects exist, the reachability validator
reports nine dead ends on its first run. Phase 1 must either add the missing
counter slots or define a fallback (`reversed` → break the hold, both to
`standing`).

**`reversed` and `countered` are different events.** `counter_punch` /
`counter_kick_1` / `counter_kick_2` and the two `special_counter_*` slots are
not engagement reversals — they read "the opponent is in `ExecutingMove` with a
move of category strike", which the proposal correctly makes a guard rather than
a posture. But the *loser's* resulting state differs between the two: an RNG
grapple reversal swaps roles inside a surviving engagement, while a countered
strike cancels the move and leaves both in `Neutral`. One outcome name cannot
carry both.

**Determinism note.** `reversed` is the only outcome that consumes an `Rng`
draw (`REVERSALS.md`: read the pre-rolled value, compare, write the flag,
generate a replacement). No other field in this shape may introduce randomness
— in particular `allowed_effects` must stay a validation constraint and never
become a weighted pick list, or `snapshot().draws` stops being comparable
across replays.

---

## 6. Taunt — `austin_corner_taunt` — STRAINS

```jsonc
{
  "slot_id": "corner_taunt",
  "preconditions": { "actor": { "posture": "cornered", "location": "turnbuckle" } },
  "default_effects": {
    "completed":   { "actor": {}, "resources": { "actor": { "spirit": 8 } } },  // (C)(D)
    "interrupted": { "actor": {} }
  }
}
```

**Does the shape tolerate the empty case without special-casing? No — twice.**

- **The outcome enum does not fit.** `hit` / `miss` / `reversed` / `escaped` are
  all target-relative, and a taunt has no target (`target_state: "n/a"`).
  Writing `"hit": {}` to mean "the taunt played" is a lie the validator cannot
  catch. The honest base pair is `completed` / `interrupted`, with `hit` / `miss`
  as target-relative refinements of `completed`.
- **A taunt is not empty.** In AKI a taunt raises Spirit, and Spirit is Factor 3
  of the damage formula (`move-damage.md` §4.3) *and* the sole driver of reversal
  probability (`REVERSALS.md`). The entire point of the move is an effect the
  three axes cannot express. The empty case turns out to be the *resource* case,
  and that same missing channel is where `feature: "pin" | "submit"`, `ko`,
  `bleed`, and joint-stamina damage all have to live.

Genuinely empty entries do exist — `walking_style` (12 moves) is a locomotion
style, not a move at all; `evasion` (`roll`, `cartwheel`) has no target — and
those tolerate `{}` fine.

One more: `celebration_taunt` reads `target_state: "defeated"`, and `defeated`
is not a posture. It is decided by a pin count, a submission, or a KO — by the
match, not by any move's effect. No effect can ever produce it. It should be a
`match.outcome` guard, not a value on the Posture axis.

Note that both case 4 and case 6 had to reach outside their intended slot for a
real move: `taunt_1` is unfilled, as are all seven `taunt`-position slots.

---

## Where the model needed help

| # | Case | Verdict | What broke |
|---|---|---|---|
| 1 | `snap_suplex` | clean | — |
| 2 | `figure_4_leg_lock` | strains | engagement inventory short; posture subordinate to engagement; `submitted` outcome; repeat-phase entries missing |
| 3 | `body_splash` | strains | needs `always`; `_special` needs a reference not a literal; posture⇄location redundancy; two meanings of "reversal" |
| 4 | Irish whip | blocked + strains | producer absent from data entirely; `destination` is a fourth field; activity axis has zero producers |
| 5 | `counter_snapmare` | model clean, graph broken | engagement + role survives perfectly; 9/15 engagements have no counter slot; `reversed` vs `countered` conflated |
| 6 | `austin_corner_taunt` | strains | outcome enum is target-relative; Spirit has no channel; `defeated` is match-level |

Five of six. The three axes themselves held up in all six — no case wanted
facing back, and no case wanted `throwing_punch` as a posture. What failed each
time was the shape *around* them.

---

## Named changes

Gate Phase 1 on **A, C, E, F** — each changes what a slot record looks like, so
finding any of them later means re-authoring all 138.

**A. Effects are keyed by role, never by side.** `attacker` / `defender`, with
`swap_roles: true` as the reversal primitive. Without this the proposal
reproduces finding 5 at the effect layer. Non-negotiable.

*Half done.* The slot fields are renamed (`schema_version: 2`); effects do not
exist yet, so the other half lands with v3.

**Two senses, two vocabularies — settled.** A first pass renamed the slot fields
to `attacker_state` / `defender_state`, which collided: on a slot those words
mean *who performs this move*, but inside an engagement they mean *which role
you hold in the hold*, and the two come apart on the counter slots. The
engagement sense won the words, because it already had them — `attacker` /
`defender` appears ~74 times across `src/combat/` (`ReversalContext`, the
Submission Skill matrix, Factor 2's offense-minus-defense) and ~36 times across
REVERSALS.md, move-damage.md and the HSFM Blueprint, always meaning the lockup
role. `initiator` / `recipient` was considered for the engagement and rejected:
it is a historical name, so `swap_roles: true` would leave the wrestler who did
*not* initiate holding the title "initiator". The slot fields took the new words
instead:

```jsonc
// back_weak_grapple_counter — the actor of the counter is the engagement's defender
"actor_state":  ["back_weak_grapple_defending"],
"target_state": ["back_weak_grapple_attacking"]

// post-normalization — correct, and now it also reads correct
"actor": { "engagement": "back_weak_grapple", "role": "defender" }
```

`target_state: ["n/a"]` also reads better than a null defender for the ~30
targetless slots: a taunt genuinely has no target.

**C. Replace the outcome enum.** Base pair `completed` / `interrupted`;
target-relative refinements `hit` / `miss`; plus `reversed` (RNG role swap
inside a surviving engagement), `countered` (move cancelled by an opponent's
pre-emptive slot), `escaped` (persistent engagement broken by the defender),
`submitted` (persistent engagement ended in defeat). `allowed_effects` declares
which apply per slot; the validator must not require the full set.

**E. Grow the engagement inventory past the 15 derived from slots.** Effects
need `lower_body_submission`, `upper_body_submission`, `pin`, and
`double_team_carry`. That last one is the `held_on_shoulders` case, and it is
**three**-body: the defender is held by the attacker's partner while a third
wrestler dives off the turnbuckle. Either engagement allows more than two
participants or double-team gets its own model. Decide now — three of the 138
slots depend on it.

**F. Posture is subordinate to engagement, not orthogonal to it.** While
`engagement != null`, posture is derived from the engagement and effects should
omit it.

Then:

**B. Add an `always` block** beside the outcome branches, for facts true on
every outcome. Also allow `$keep` / `$target.location`-style references, for
the two disjunctive `_special` slots.

**G. Collapse the posture/location redundancy** — `on_turnbuckle`, `cornered`
and `tree_of_woe` all entail `location: turnbuckle` — by deriving location from
posture where posture implies it, or by shipping a compatibility matrix the
validator enforces. Drop `defeated` from Posture. Add the two postures the
proposal dropped: `ducking` and `entering`, used by `ducking_taunt` and
`entryway_taunt`.

**D. Add a `resources` channel** to effects: spirit delta, special meter, and
the pin/submission entry that `feature` currently encodes. Without it, taunts,
`feature`, `ko` and `bleed` have no home, and Phase 3's power-tier backfill has
nothing to backfill them into.

**H. `activity: whipped_*` needs a destination.** Model activity as
`{ kind, destination }`, or accept that it is two fields.

**I. Declare the engine-owned transitions before writing the reachability
check.** Rising from `down_face_*`, rebounding off the ropes, climbing and
leaving the turnbuckle, and entering and leaving the apron are not moves and
never will be. This matters more than it sounds: `down_facing_up`,
`down_facing_down`, `sitting_up`, `kneeling_all_fours`, `tree_of_woe` and
`defeated` are **target-only** in today's vocabulary — no slot anywhere has an
`actor_state` matching them — so without a declared engine-transition set,
every downed-state effect reads as a dead end.

---

## Data gaps found on the way (Phase 1 blockers, not vocabulary problems)

- **The Irish whip has no representation at all.** No producing slot, no move,
  and `REVERSALS.md`'s C-Down grapple input has no slot. Add it in Phase 1 or
  the activity axis ships with nothing producing it.
- **37 of 138 slots have no moves.** Including all 5 `irish_whip` slots, all 7
  `taunt`-position slots, all 12 apron slots, all 4 double-team grapple slots
  and all 3 double-team flying slots. Two of the six cases had to substitute a
  move from a neighbouring slot.
- **Repeating moves have one entry, not two.** `move-damage.md` §3 requires an
  initial entry and a per-wrench entry with its own base damage; `moves.json`
  has 80 `feature: "submit"` moves and no repeat phases. The submission effect
  loop has nothing to point at.
- **Nine of fifteen engagements have no counter slot** (front weak/strong, all
  four turnbuckle, all three double-team). Add them, or define the `reversed`
  fallback.
