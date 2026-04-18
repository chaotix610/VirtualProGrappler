# VPG Engine — Move Slots Reference (v2)

## Overview

A **move slot** is a named input combination available to every wrestler, organized by position and context. Every wrestler has the same set of slots — what differs between wrestlers is which move from the move database is assigned to each slot.

Each slot belongs to an **eligibility group**. When defining a move in the move database, the move's eligible slots are specified by referencing groups rather than individual slots. This keeps the move database compact — a move eligible for `front-strong-grapple` can be assigned to any of the 8 front strong grapple slots without listing each one individually.

The full slot system is organized into the following categories:

| Category | Description |
| --- | --- |
| Grappling | Front and back grapples, weak and strong, plus finisher slots |
| Standing | Strikes, counter attacks, recovering strike, and walking style |
| Running | Running strikes, running grapples, running ground strikes, and evasion |
| Ground | Submissions, ground finishers, and ground strikes against downed opponents |
| Turnbuckle | Corner strikes, corner grapples, tree-of-woe attacks, flying attacks, and corner/top-rope taunts |
| Ringside | Attacks and grapples at the ropes and to the outside |
| Apron | Strikes, grapples, flying attacks, and taunts from the ring apron |
| Irish Whip | Follow-up strikes, grapples, and finishers after whipping an opponent into the ropes |
| Taunt | Standing, ducking, special, celebration, and entryway taunts |
| Double Team | Co-op grapples and flying attacks with a partner |

---

## Slot Counts Quick Reference

### Grapple Slots by Position

| Position | Grapple Type | Move Slots | Finisher Slot |
| --- | --- | --- | --- |
| Front | Weak Grapple | 8 | — |
| Front | Strong Grapple | 8 | 1 |
| Back | Weak Grapple | 4 | — |
| Back | Strong Grapple | 4 | 1 |
| Front Turnbuckle | Weak Grapple | 2 | — |
| Front Turnbuckle | Strong Grapple | 2 | 1 |
| Back Turnbuckle | Weak Grapple | 2 | — |
| Back Turnbuckle | Strong Grapple | 2 | 1 |
| Apron (from inside) | Weak Grapple | 1 | — |
| Apron (from inside) | Strong Grapple | 1 | 1 |
| Apron (from apron) | Weak Grapple | 1 | — |
| Apron (from apron) | Strong Grapple | 1 | 1 |

### Slot Totals by Category

| Category | Total Slots |
| --- | --- |
| Grappling | 28 (includes 2 reversals) |
| Standing | 14 |
| Running | 11 |
| Ground | 14 (includes 4 finishers) |
| Turnbuckle | 30 |
| Ringside | 10 |
| Apron | 12 |
| Irish Whip | 6 |
| Taunt | 7 |
| Double Team | 7 |
| **Total** | **139** |

---

## Grapple Switching Transitions

During a grapple, the attacker can press [L] to switch between front and back positions while maintaining the same grapple tier (weak/strong). These are state transitions handled by the engine, not move slots.

| From State | Action | To State |
| --- | --- | --- |
| `front-weak-grapple-attacking` | Press [L] | `back-weak-grapple-attacking` |
| `back-weak-grapple-attacking` | Press [L] | `front-weak-grapple-attacking` |
| `front-strong-grapple-attacking` | Press [L] | `back-strong-grapple-attacking` |
| `back-strong-grapple-attacking` | Press [L] | `front-strong-grapple-attacking` |

The opponent's state transitions correspondingly (e.g. `front-weak-grapple-defending` → `back-weak-grapple-defending`).

> **Note:** The [L] switch preserves the grapple tier. You cannot switch from a weak grapple to a strong grapple or vice versa — the tier is determined at lockup time by whether the player tapped or held [A].

---

## Column Definitions

- **position** — broad area of the game system (Grappling, Standing, Running, Ground, Turnbuckle, Ringside, Apron, Irish Whip, Taunt, Double Team)
- **category** — functional grouping within a position
- **group** — eligibility group for the move database (a move's eligibility references groups, not individual slots)
- **slot_id** — the specific assignable slot (unique identifier)
- **player_state** — what state the player must be in for this slot to fire
- **opponent_state** — what state the opponent must be in (comma-separated if multiple valid states)
- **range** — distance modifier where applicable (close, mid, any, n/a)
- **requires_special** — whether the player must have special meter to trigger this slot
- **input** — button/input combo that triggers the slot

---

## State Vocabulary Reference

### Neutral Player States
- `standing` — upright, not in any special state
- `running` — moving with [Run] held
- `ducking` — crouched low after duck input
- `getting-up` — in the process of recovering from being downed
- `airborne` — mid flying attack
- `at-turnbuckle` — standing in the corner, not climbed
- `on-turnbuckle` — climbed to top or second rope
- `on-apron` — standing on the ring apron
- `running-on-apron` — running along the ring apron
- `outside-ring` — standing on the floor at ringside
- `entering` — making entrance to the ring (pre-match)

### Paired Grapple States (attacker / defender)
- `front-weak-grapple-attacking` / `front-weak-grapple-defending`
- `front-strong-grapple-attacking` / `front-strong-grapple-defending`
- `back-weak-grapple-attacking` / `back-weak-grapple-defending`
- `back-strong-grapple-attacking` / `back-strong-grapple-defending`
- `turnbuckle-front-weak-grapple-attacking` / `-defending`
- `turnbuckle-front-strong-grapple-attacking` / `-defending`
- `turnbuckle-back-weak-grapple-attacking` / `-defending`
- `turnbuckle-back-strong-grapple-attacking` / `-defending`
- `apron-weak-grapple-from-inside-attacking` / `-defending`
- `apron-strong-grapple-from-inside-attacking` / `-defending`
- `apron-weak-grapple-from-apron-attacking` / `-defending`
- `apron-strong-grapple-from-apron-attacking` / `-defending`
- `double-team-grapple-front-attacking` / `-defending`
- `double-team-grapple-back-attacking` / `-defending`
- `double-team-grapple-sandwich-attacking` / `-defending`

### Defender-Only States
- `standing-facing-player` — upright, facing the attacker
- `standing-facing-away` — upright, back to the attacker
- `down-facing-up` — laying flat on back
- `down-facing-down` — laying flat on stomach
- `sitting-up` — sitting on mat with legs straight out
- `kneeling-all-fours` — on hands and knees
- `tree-of-woe` — hanging upside down in turnbuckle
- `at-turnbuckle-facing-out` — slumped in corner, back against turnbuckle, facing player
- `at-turnbuckle-facing-in` — slumped in corner, facing turnbuckle, back to player
- `on-turnbuckle-facing-player` — on top rope facing player
- `on-turnbuckle-facing-away` — on top rope facing away from player
- `on-apron` — standing on ring apron
- `outside-ring` — standing on floor at ringside
- `down-outside-ring` — laying down outside the ring
- `down-in-ring` — laying down in the ring (generic, for flying attacks where facing direction doesn't matter)
- `running-toward-from-weak-whip` — running toward player after weak Irish whip
- `running-toward-from-strong-whip` — running toward player after strong Irish whip
- `running-toward-opponent` — running toward player (generic)
- `throwing-punch` — mid-punch animation (for counter punch window)
- `throwing-kick` — mid-kick animation (for counter kick window)
- `held-on-shoulders` — held up on partner's shoulders (double team)
- `defeated` — match is over, opponent has lost
- `n/a` — no opponent state required (taunts, walking style, evasion)

### Orthogonal Flags
- `has-special` — player has special meter available (modeled via `requires_special` column)

---

## Grappling

| position | category | group | slot_id | player_state | opponent_state | range | requires_special | input |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Grappling | Front Weak Grapple | front-weak-grapple-a | front-weak-grapple-1 | front-weak-grapple-attacking | front-weak-grapple-defending | n/a | FALSE | [A] |
| Grappling | Front Weak Grapple | front-weak-grapple-a | front-weak-grapple-2 | front-weak-grapple-attacking | front-weak-grapple-defending | n/a | FALSE | [Left/Right] + [A] |
| Grappling | Front Weak Grapple | front-weak-grapple-a | front-weak-grapple-3 | front-weak-grapple-attacking | front-weak-grapple-defending | n/a | FALSE | [D-Pad Up] + [A] |
| Grappling | Front Weak Grapple | front-weak-grapple-a | front-weak-grapple-4 | front-weak-grapple-attacking | front-weak-grapple-defending | n/a | FALSE | [D-Pad Down] + [A] |
| Grappling | Front Weak Grapple | front-weak-grapple-b | front-weak-grapple-5 | front-weak-grapple-attacking | front-weak-grapple-defending | n/a | FALSE | [B] |
| Grappling | Front Weak Grapple | front-weak-grapple-b | front-weak-grapple-6 | front-weak-grapple-attacking | front-weak-grapple-defending | n/a | FALSE | [Left/Right] + [B] |
| Grappling | Front Weak Grapple | front-weak-grapple-b | front-weak-grapple-7 | front-weak-grapple-attacking | front-weak-grapple-defending | n/a | FALSE | [D-Pad Up] + [B] |
| Grappling | Front Weak Grapple | front-weak-grapple-b | front-weak-grapple-8 | front-weak-grapple-attacking | front-weak-grapple-defending | n/a | FALSE | [D-Pad Down] + [B] |
| Grappling | Front Strong Grapple | front-strong-grapple | front-strong-grapple-1 | front-strong-grapple-attacking | front-strong-grapple-defending | n/a | FALSE | [A] |
| Grappling | Front Strong Grapple | front-strong-grapple | front-strong-grapple-2 | front-strong-grapple-attacking | front-strong-grapple-defending | n/a | FALSE | [Left/Right] + [A] |
| Grappling | Front Strong Grapple | front-strong-grapple | front-strong-grapple-3 | front-strong-grapple-attacking | front-strong-grapple-defending | n/a | FALSE | [D-Pad Up] + [A] |
| Grappling | Front Strong Grapple | front-strong-grapple | front-strong-grapple-4 | front-strong-grapple-attacking | front-strong-grapple-defending | n/a | FALSE | [D-Pad Down] + [A] |
| Grappling | Front Strong Grapple | front-strong-grapple | front-strong-grapple-5 | front-strong-grapple-attacking | front-strong-grapple-defending | n/a | FALSE | [B] |
| Grappling | Front Strong Grapple | front-strong-grapple | front-strong-grapple-6 | front-strong-grapple-attacking | front-strong-grapple-defending | n/a | FALSE | [Left/Right] + [B] |
| Grappling | Front Strong Grapple | front-strong-grapple | front-strong-grapple-7 | front-strong-grapple-attacking | front-strong-grapple-defending | n/a | FALSE | [D-Pad Up] + [B] |
| Grappling | Front Strong Grapple | front-strong-grapple | front-strong-grapple-8 | front-strong-grapple-attacking | front-strong-grapple-defending | n/a | FALSE | [D-Pad Down] + [B] |
| Grappling | Front Strong Grapple | front-finisher | front-finisher | front-strong-grapple-attacking | front-strong-grapple-defending | n/a | TRUE | [Control Stick] |
| Grappling | Back Weak Grapple | back-weak-grapple | back-weak-grapple-1 | back-weak-grapple-attacking | back-weak-grapple-defending | n/a | FALSE | [A] |
| Grappling | Back Weak Grapple | back-weak-grapple | back-weak-grapple-2 | back-weak-grapple-attacking | back-weak-grapple-defending | n/a | FALSE | [D-Pad] + [A] |
| Grappling | Back Weak Grapple | back-weak-grapple | back-weak-grapple-3 | back-weak-grapple-attacking | back-weak-grapple-defending | n/a | FALSE | [B] |
| Grappling | Back Weak Grapple | back-weak-grapple | back-weak-grapple-4 | back-weak-grapple-attacking | back-weak-grapple-defending | n/a | FALSE | [D-Pad] + [B] |
| Grappling | Back Strong Grapple | back-strong-grapple | back-strong-grapple-1 | back-strong-grapple-attacking | back-strong-grapple-defending | n/a | FALSE | [A] |
| Grappling | Back Strong Grapple | back-strong-grapple | back-strong-grapple-2 | back-strong-grapple-attacking | back-strong-grapple-defending | n/a | FALSE | [D-Pad] + [A] |
| Grappling | Back Strong Grapple | back-strong-grapple | back-strong-grapple-3 | back-strong-grapple-attacking | back-strong-grapple-defending | n/a | FALSE | [B] |
| Grappling | Back Strong Grapple | back-strong-grapple | back-strong-grapple-4 | back-strong-grapple-attacking | back-strong-grapple-defending | n/a | FALSE | [D-Pad] + [B] |
| Grappling | Back Strong Grapple | back-finisher | back-finisher | back-strong-grapple-attacking | back-strong-grapple-defending | n/a | TRUE | [Control Stick] |
| Grappling | Grapple Reversal | back-weak-grapple-counter | back-weak-grapple-counter | back-weak-grapple-defending | back-weak-grapple-attacking | n/a | FALSE | [R] |
| Grappling | Grapple Reversal | back-strong-grapple-counter | back-strong-grapple-counter | back-strong-grapple-defending | back-strong-grapple-attacking | n/a | FALSE | [R] |

## Standing

| position | category | group | slot_id | player_state | opponent_state | range | requires_special | input |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Standing | Weak Striking | weak-arm-strike | weak-arm-strike-1 | standing | standing-facing-player, standing-facing-away | close | FALSE | [B] |
| Standing | Weak Striking | weak-arm-strike | weak-arm-strike-2 | standing | standing-facing-player, standing-facing-away | close | FALSE | [D-Pad] + [B] |
| Standing | Weak Striking | weak-leg-strike | weak-leg-strike-1 | standing | standing-facing-player, standing-facing-away | mid | FALSE | [B] |
| Standing | Weak Striking | weak-leg-strike | weak-leg-strike-2 | standing | standing-facing-player, standing-facing-away | mid | FALSE | [D-Pad] + [B] |
| Standing | Strong Striking | strong-strike | strong-strike-1 | standing | standing-facing-player, standing-facing-away | any | FALSE | [B] |
| Standing | Strong Striking | strong-strike | strong-strike-2 | standing | standing-facing-player, standing-facing-away | any | FALSE | [D-Pad] + [B] |
| Standing | Strong Striking | strong-strike | strong-strike-3 | standing | standing-facing-player, standing-facing-away | any | FALSE | [A + B] |
| Standing | Recovering Strike | ducking-strike | ducking-strike | getting-up | standing-facing-player, standing-facing-away | any | FALSE | [B] |
| Standing | Counter Attack | counter-punch | counter-punch | standing | throwing-punch | any | FALSE | [R] |
| Standing | Counter Attack | special-counter-punch | special-counter-punch | standing | throwing-punch | any | TRUE | [R] |
| Standing | Counter Attack | counter-kick | counter-kick-1 | standing | throwing-kick | any | FALSE | [R] + [A] |
| Standing | Counter Attack | counter-kick | counter-kick-2 | standing | throwing-kick | any | FALSE | [R] + [B] |
| Standing | Counter Attack | special-counter-kick | special-counter-kick | standing | throwing-kick | any | TRUE | [R] + [A/B] |
| Standing | Walking Style | walking-style | walking-style | standing | n/a | n/a | FALSE | [D-Pad] |

## Running

| position | category | group | slot_id | player_state | opponent_state | range | requires_special | input |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Running | Running Strike | weak-running-strike | weak-running-strike-1 | running | standing-facing-player, standing-facing-away | any | FALSE | [Run] + [B] |
| Running | Running Strike | weak-running-strike | weak-running-strike-2 | running | standing-facing-player, standing-facing-away | any | FALSE | [Run] + [A + B] |
| Running | Running Strike | strong-running-strike | strong-running-strike-1 | running | standing-facing-player, standing-facing-away | any | FALSE | [D-Pad] + [Run] + [B] |
| Running | Running Strike | strong-running-strike | strong-running-strike-2 | running | standing-facing-player, standing-facing-away | any | FALSE | [D-Pad] + [Run] + [A + B] |
| Running | Running Grapple | run-front-grapple | run-front-grapple | running | standing-facing-player | any | FALSE | [Run] + [A] |
| Running | Running Grapple | run-back-grapple | run-back-grapple | running | standing-facing-away | any | FALSE | [Run] + [A] |
| Running | Running Ground Strike | run-ground-strike | run-ground-strike-facing-up | running | down-facing-up | any | FALSE | [Run] + [B] |
| Running | Running Ground Strike | run-ground-strike | run-ground-strike-facing-down | running | down-facing-down | any | FALSE | [Run] + [B] |
| Running | Running Ground Strike | run-ground-strike | run-ground-strike-sitting-up | running | sitting-up | any | FALSE | [Run] + [B] |
| Running | Running Ground Strike | run-ground-strike | run-ground-strike-kneeling-all-fours | running | kneeling-all-fours | any | FALSE | [Run] + [B] |
| Running | Evasion | evasion | evasion | running | n/a | n/a | FALSE | [Run] + [R] |

## Ground

| position | category | group | slot_id | player_state | opponent_state | range | requires_special | input |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Ground | Upper Body Submission | upper-body-submission | upper-body-submission-facing-up | standing | down-facing-up | close | FALSE | [A] |
| Ground | Upper Body Submission | upper-body-submission | upper-body-submission-facing-down | standing | down-facing-down | close | FALSE | [A] |
| Ground | Upper Body Submission | upper-body-submission | upper-body-submission-sitting-up | standing | sitting-up | close | FALSE | [A] |
| Ground | Upper Body Submission | upper-body-submission | upper-body-submission-kneeling-all-fours | standing | kneeling-all-fours | close | FALSE | [A] |
| Ground | Upper Body Finisher | upper-body-finisher | upper-body-finisher-facing-up | standing | down-facing-up | close | TRUE | [A] |
| Ground | Upper Body Finisher | upper-body-finisher | upper-body-finisher-facing-down | standing | down-facing-down | close | TRUE | [A] |
| Ground | Lower Body Submission | lower-body-submission | lower-body-submission-facing-up | standing | down-facing-up | close | FALSE | [A] |
| Ground | Lower Body Submission | lower-body-submission | lower-body-submission-facing-down | standing | down-facing-down | close | FALSE | [A] |
| Ground | Lower Body Finisher | lower-body-finisher | lower-body-finisher-facing-up | standing | down-facing-up | close | TRUE | [A] |
| Ground | Lower Body Finisher | lower-body-finisher | lower-body-finisher-facing-down | standing | down-facing-down | close | TRUE | [A] |
| Ground | Ground Striking | ground-strike | ground-strike-facing-up | standing | down-facing-up | close | FALSE | [B] |
| Ground | Ground Striking | ground-strike | ground-strike-facing-down | standing | down-facing-down | close | FALSE | [B] |
| Ground | Ground Striking | ground-strike | ground-strike-sitting-up | standing | sitting-up | close | FALSE | [B] |
| Ground | Ground Striking | ground-strike | ground-strike-kneeling-all-fours | standing | kneeling-all-fours | close | FALSE | [B] |

## Turnbuckle

| position | category | group | slot_id | player_state | opponent_state | range | requires_special | input |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Turnbuckle | Turnbuckle Strikes | turnbuckle-strike | turnbuckle-strike-1 | standing | at-turnbuckle-facing-out | close | FALSE | [B] |
| Turnbuckle | Turnbuckle Strikes | turnbuckle-strike | turnbuckle-strike-2 | standing | at-turnbuckle-facing-out | close | FALSE | [D-Pad] + [B] |
| Turnbuckle | Turnbuckle Strikes | running-turnbuckle-strike | running-turnbuckle-strike-1 | running | at-turnbuckle-facing-out | any | FALSE | [Run] + [B] |
| Turnbuckle | Turnbuckle Strikes | running-turnbuckle-strike | running-turnbuckle-strike-2 | running | at-turnbuckle-facing-out | any | FALSE | [Run] + [A + B] |
| Turnbuckle | Corner Counter | corner-counter | irish-whip-to-corner-counter | at-turnbuckle | standing-facing-player | n/a | FALSE | Rapidly tap [R], [A], [B] |
| Turnbuckle | Tree of Woe | tree-of-woe-strike | tree-of-woe-strike-1 | standing | tree-of-woe | close | FALSE | [B] |
| Turnbuckle | Tree of Woe | tree-of-woe-strike | tree-of-woe-strike-2 | standing | tree-of-woe | close | FALSE | [D-Pad] + [B] |
| Turnbuckle | Tree of Woe | running-tree-of-woe-strike | running-tree-of-woe-strike | running | tree-of-woe | any | FALSE | [Run] + [B] |
| Turnbuckle | Front Turnbuckle Grapple | turnbuckle-front-weak-grapple | turnbuckle-front-weak-grapple-1 | turnbuckle-front-weak-grapple-attacking | turnbuckle-front-weak-grapple-defending | n/a | FALSE | [A] |
| Turnbuckle | Front Turnbuckle Grapple | turnbuckle-front-weak-grapple | turnbuckle-front-weak-grapple-2 | turnbuckle-front-weak-grapple-attacking | turnbuckle-front-weak-grapple-defending | n/a | FALSE | [B] |
| Turnbuckle | Front Turnbuckle Grapple | turnbuckle-front-strong-grapple | turnbuckle-front-strong-grapple-1 | turnbuckle-front-strong-grapple-attacking | turnbuckle-front-strong-grapple-defending | n/a | FALSE | [A] |
| Turnbuckle | Front Turnbuckle Grapple | turnbuckle-front-strong-grapple | turnbuckle-front-strong-grapple-2 | turnbuckle-front-strong-grapple-attacking | turnbuckle-front-strong-grapple-defending | n/a | FALSE | [B] |
| Turnbuckle | Front Turnbuckle Grapple | turnbuckle-front-finisher | turnbuckle-front-finisher | turnbuckle-front-strong-grapple-attacking | turnbuckle-front-strong-grapple-defending | n/a | TRUE | [Control Stick] |
| Turnbuckle | Back Turnbuckle Grapple | turnbuckle-back-weak-grapple | turnbuckle-back-weak-grapple-1 | turnbuckle-back-weak-grapple-attacking | turnbuckle-back-weak-grapple-defending | n/a | FALSE | [A] |
| Turnbuckle | Back Turnbuckle Grapple | turnbuckle-back-weak-grapple | turnbuckle-back-weak-grapple-2 | turnbuckle-back-weak-grapple-attacking | turnbuckle-back-weak-grapple-defending | n/a | FALSE | [B] |
| Turnbuckle | Back Turnbuckle Grapple | turnbuckle-back-strong-grapple | turnbuckle-back-strong-grapple-1 | turnbuckle-back-strong-grapple-attacking | turnbuckle-back-strong-grapple-defending | n/a | FALSE | [A] |
| Turnbuckle | Back Turnbuckle Grapple | turnbuckle-back-strong-grapple | turnbuckle-back-strong-grapple-2 | turnbuckle-back-strong-grapple-attacking | turnbuckle-back-strong-grapple-defending | n/a | FALSE | [B] |
| Turnbuckle | Back Turnbuckle Grapple | turnbuckle-back-finisher | turnbuckle-back-finisher | turnbuckle-back-strong-grapple-attacking | turnbuckle-back-strong-grapple-defending | n/a | TRUE | [Control Stick] |
| Turnbuckle | Flying Move Counter | flying-move-counter | front-flying-move-counter | standing | on-turnbuckle-facing-player | close | FALSE | [A] |
| Turnbuckle | Flying Move Counter | flying-move-counter | back-flying-move-counter | standing | on-turnbuckle-facing-away | close | FALSE | [A] |
| Turnbuckle | Flying Attack (Standing) | flying-top-turnbuckle-standing | flying-top-turnbuckle-standing-opponent | on-turnbuckle | standing-facing-player, standing-facing-away | n/a | FALSE | [D-Pad] + [Run] into corner, release [Run] |
| Turnbuckle | Flying Attack (Standing) | flying-top-turnbuckle-standing-to-outside | flying-top-turnbuckle-standing-opponent-to-outside | on-turnbuckle | outside-ring | n/a | FALSE | [D-Pad] + [Run] into corner, release [Run] |
| Turnbuckle | Flying Attack (Standing) | flying-top-turnbuckle-standing-special | flying-top-turnbuckle-standing-opponent-special | on-turnbuckle | standing-facing-player, standing-facing-away, outside-ring | n/a | TRUE | [D-Pad] + [Run] into corner, release [Run] |
| Turnbuckle | Flying Attack (Laying) | flying-top-turnbuckle-laying | flying-top-turnbuckle-laying-opponent | on-turnbuckle | down-in-ring | n/a | FALSE | [D-Pad] + [Run] into corner, release [Run] |
| Turnbuckle | Flying Attack (Laying) | flying-top-turnbuckle-laying-to-outside | flying-top-turnbuckle-laying-opponent-to-outside | on-turnbuckle | down-outside-ring | n/a | FALSE | [D-Pad] + [Run] into corner, release [Run] |
| Turnbuckle | Flying Attack (Laying) | flying-top-turnbuckle-laying-special | flying-top-turnbuckle-laying-opponent-special | on-turnbuckle | down-in-ring, down-outside-ring | n/a | TRUE | [D-Pad] + [Run] into corner, release [Run] |
| Turnbuckle | Flying Attack (Second Rope) | flying-second-turnbuckle | flying-second-turnbuckle-laying-opponent | at-turnbuckle | down-in-ring | close | FALSE | [A] |
| Turnbuckle | Turnbuckle Taunt | corner-taunt | corner-taunt | at-turnbuckle | n/a | n/a | FALSE | [D-Pad] + [Control Stick] |
| Turnbuckle | Turnbuckle Taunt | top-rope-taunt | top-rope-taunt | on-turnbuckle | n/a | n/a | FALSE | [Control Stick] |

## Ringside

| position | category | group | slot_id | player_state | opponent_state | range | requires_special | input |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Ringside | Grapple to Apron | apron-weak-grapple-from-inside | weak-grapple-to-apron | apron-weak-grapple-from-inside-attacking | apron-weak-grapple-from-inside-defending | n/a | FALSE | [A] or [B] |
| Ringside | Grapple to Apron | apron-strong-grapple-from-inside | strong-grapple-to-apron | apron-strong-grapple-from-inside-attacking | apron-strong-grapple-from-inside-defending | n/a | FALSE | [A] or [B] |
| Ringside | Grapple to Apron | apron-special-grapple-from-inside | special-grapple-to-apron | apron-strong-grapple-from-inside-attacking | apron-strong-grapple-from-inside-defending | n/a | TRUE | [Control Stick] |
| Ringside | Grapple to Apron | counter-grapple-from-apron-inside | counter-grapple-from-apron | apron-weak-grapple-from-inside-defending, apron-strong-grapple-from-inside-defending | apron-weak-grapple-from-inside-attacking, apron-strong-grapple-from-inside-attacking | n/a | FALSE | Rapidly tap [A] and [B] |
| Ringside | Rope Inside Attack | springboard-attack | springboard-attack-to-inside | standing | down-in-ring | close | FALSE | [D-Pad] + [A] |
| Ringside | Flying Attack to Outside | flying-attack-to-outside | flying-attack-to-outside | standing | outside-ring | close | FALSE | [D-Pad] + [A] |
| Ringside | Flying Attack to Outside | running-diving-attack | running-diving-attack-1 | running | outside-ring | any | FALSE | [A] |
| Ringside | Flying Attack to Outside | running-diving-attack | running-diving-attack-2 | running | outside-ring | any | FALSE | [D-Pad] + [A] |
| Ringside | Running Diving Taunt | running-diving-taunt | running-diving-taunt | running | n/a | n/a | FALSE | [Control Stick] |
| Ringside | Rebound Flying Attack | rebound-flying-attack | rebound-flying-attack | running | standing-facing-player, standing-facing-away | any | FALSE | [A] |

## Apron

| position | category | group | slot_id | player_state | opponent_state | range | requires_special | input |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Apron | Apron Strike | apron-kick | apron-kick-to-inside | on-apron | standing-facing-player, standing-facing-away | close | FALSE | [B] |
| Apron | Apron Strike | apron-kick | apron-kick-to-outside | on-apron | outside-ring | close | FALSE | [B] |
| Apron | Grapple from Apron | apron-weak-grapple-from-apron | weak-grapple-from-apron | apron-weak-grapple-from-apron-attacking | apron-weak-grapple-from-apron-defending | n/a | FALSE | [A] or [B] |
| Apron | Grapple from Apron | apron-strong-grapple-from-apron | strong-grapple-from-apron | apron-strong-grapple-from-apron-attacking | apron-strong-grapple-from-apron-defending | n/a | FALSE | [A] or [B] |
| Apron | Grapple from Apron | apron-finisher-from-apron | finisher-from-apron | apron-strong-grapple-from-apron-attacking | apron-strong-grapple-from-apron-defending | n/a | TRUE | [Control Stick] |
| Apron | Counter Grapple from Apron | counter-grapple-from-apron-apron | counter-grapple-from-apron-apron | apron-weak-grapple-from-apron-defending, apron-strong-grapple-from-apron-defending | apron-weak-grapple-from-apron-attacking, apron-strong-grapple-from-apron-attacking | n/a | FALSE | Rapidly tap [A] and [B] |
| Apron | Flying Attack from Apron | flying-attack-from-apron | flying-attack-from-apron | on-apron | outside-ring | any | FALSE | [D-Pad] + [A] |
| Apron | Flying Attack from Apron | running-flying-attack-from-apron | running-flying-attack-from-apron | running-on-apron | outside-ring | any | FALSE | [A] |
| Apron | Flying Attack to Ring (Standing) | flying-attack-to-ring-standing | flying-attack-to-ring-standing | on-apron | standing-facing-player, standing-facing-away | any | FALSE | [A] |
| Apron | Flying Attack to Ring (Laying) | flying-attack-to-ring-laying | flying-attack-to-ring-laying | on-apron | down-in-ring | any | FALSE | [A] |
| Apron | Flying Attack to Ring (Special) | flying-attack-to-ring-special | flying-attack-to-ring-special | on-apron | standing-facing-player, standing-facing-away, down-in-ring | any | TRUE | [A] |
| Apron | Apron Taunt | apron-taunt | apron-taunt | on-apron | n/a | n/a | FALSE | [Control Stick] |

## Irish Whip

| position | category | group | slot_id | player_state | opponent_state | range | requires_special | input |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Irish Whip | Irish Whip Strike | irish-whip-strike | irish-whip-strike | standing | running-toward-opponent | any | FALSE | [B] |
| Irish Whip | Irish Whip Grapple (Weak) | weak-irish-whip-grapple | weak-irish-whip-grapple-1 | standing | running-toward-from-weak-whip | any | FALSE | Tap [A] |
| Irish Whip | Irish Whip Grapple (Weak) | weak-irish-whip-grapple | weak-irish-whip-grapple-2 | standing | running-toward-from-weak-whip | any | FALSE | Hold [A] |
| Irish Whip | Irish Whip Grapple (Strong) | strong-irish-whip-grapple | strong-irish-whip-grapple-1 | standing | running-toward-from-strong-whip | any | FALSE | Tap [A] |
| Irish Whip | Irish Whip Grapple (Strong) | strong-irish-whip-grapple | strong-irish-whip-grapple-2 | standing | running-toward-from-strong-whip | any | FALSE | Hold [A] |
| Irish Whip | Irish Whip Grapple (Strong) | irish-whip-finisher | irish-whip-finisher | standing | running-toward-from-strong-whip | any | TRUE | [Control Stick] |

## Taunt

| position | category | group | slot_id | player_state | opponent_state | range | requires_special | input |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Taunt | Taunt | taunt | taunt-1 | standing | n/a | n/a | FALSE | [Control Stick Up] |
| Taunt | Taunt | taunt | taunt-2 | standing | n/a | n/a | FALSE | [Control Stick Left] |
| Taunt | Taunt | taunt | taunt-3 | standing | n/a | n/a | FALSE | [Control Stick Right] |
| Taunt | Taunt | special-taunt | special-taunt | standing | n/a | n/a | TRUE | [Control Stick Up/Left/Right] |
| Taunt | Taunt | ducking-taunt | ducking-taunt | ducking | n/a | n/a | FALSE | [Control Stick Down] |
| Taunt | Taunt | celebration-taunt | celebration-taunt | standing | defeated | n/a | FALSE | Automatic |
| Taunt | Taunt | entryway-taunt | entryway-taunt | entering | n/a | n/a | FALSE | Automatic |

## Double Team

| position | category | group | slot_id | player_state | opponent_state | range | requires_special | input |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Double Team | Double Team Grapple | double-team-grapple-front | front-double-team-grapple | double-team-grapple-front-attacking | double-team-grapple-front-defending | n/a | FALSE | [A] |
| Double Team | Double Team Grapple | double-team-grapple-back | back-double-team-grapple | double-team-grapple-back-attacking | double-team-grapple-back-defending | n/a | FALSE | [A] |
| Double Team | Double Team Grapple | double-team-grapple-sandwich | sandwich-double-team-grapple | double-team-grapple-sandwich-attacking | double-team-grapple-sandwich-defending | n/a | FALSE | [A] |
| Double Team | Double Team Grapple | running-double-team-grapple | running-double-team-grapple | running | running-toward-opponent | any | FALSE | [A] |
| Double Team | Double Team Flying Attack | double-team-flying-attack | double-team-flying-off-top-turnbuckle | on-turnbuckle | held-on-shoulders | n/a | FALSE | — |
| Double Team | Double Team Flying Attack | double-team-flying-attack | double-team-flying-off-top-turnbuckle-to-outside | on-turnbuckle | held-on-shoulders | n/a | FALSE | — |
| Double Team | Double Team Flying Attack | double-team-flying-attack | double-team-flying-from-apron-over-top-rope | on-apron | held-on-shoulders | n/a | FALSE | — |

---

## JSON Schema Reference

The slot structure maps to a JSON schema used by the engine at `data/schemas/move-slots.json`. Property names use camelCase. The pattern follows this structure:

```json
{
  "grappling": {
    "frontGrapple": {
      "frontWeakGrapple": {
        "opponentState": "standing-facing-player",
        "setup": "Tap A in front of standing opponent",
        "slots": {
          "A": "frontWeakGrappleSlot1",
          "leftRight+A": "frontWeakGrappleSlot2",
          "up+A": "frontWeakGrappleSlot3",
          "down+A": "frontWeakGrappleSlot4",
          "B": "frontWeakGrappleSlot5",
          "leftRight+B": "frontWeakGrappleSlot6",
          "up+B": "frontWeakGrappleSlot7",
          "down+B": "frontWeakGrappleSlot8"
        }
      },
      "frontStrongGrapple": {
        "opponentState": "standing-facing-player",
        "setup": "Hold A in front of standing opponent",
        "slots": {
          "A": "frontStrongGrappleSlot1",
          "leftRight+A": "frontStrongGrappleSlot2",
          "up+A": "frontStrongGrappleSlot3",
          "down+A": "frontStrongGrappleSlot4",
          "B": "frontStrongGrappleSlot5",
          "leftRight+B": "frontStrongGrappleSlot6",
          "up+B": "frontStrongGrappleSlot7",
          "down+B": "frontStrongGrappleSlot8",
          "controlStick": "frontFinisherSlot"
        }
      }
    },
    "backGrapple": {
      "backWeakGrapple": {
        "opponentState": "standing-facing-away",
        "setup": "Tap A when behind a standing opponent",
        "slots": {
          "A": "backWeakGrappleSlot1",
          "anyDirection+A": "backWeakGrappleSlot2",
          "B": "backWeakGrappleSlot3",
          "anyDirection+B": "backWeakGrappleSlot4"
        }
      },
      "backStrongGrapple": {
        "opponentState": "standing-facing-away",
        "setup": "Hold A when behind a standing opponent",
        "slots": {
          "A": "backStrongGrappleSlot1",
          "anyDirection+A": "backStrongGrappleSlot2",
          "B": "backStrongGrappleSlot3",
          "anyDirection+B": "backStrongGrappleSlot4",
          "controlStick": "backFinisherSlot"
        }
      }
    },
    "reversals": {
      "slots": [
        "backWeakGrappleCounterSlot",
        "backStrongGrappleCounterSlot"
      ]
    }
  }
}
```

> **TODO:** Expand the JSON schema to cover all categories (Standing, Running, Ground, Turnbuckle, Ringside, Apron, Irish Whip, Taunt, Double Team). Each category follows the same pattern: nested objects by category/subcategory, with `opponentState`, `setup`, and `slots` at the leaf level. The full schema will live at `data/schemas/move-slots.json`.