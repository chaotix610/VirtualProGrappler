# data/

This directory contains all structured reference data for VPG Engine. It is the source of truth for game rules, move definitions, slot structures, character rosters, and data schemas.

No system explanations or design rationale live here — for that, see `docs/`. This directory is purely reference data.

---

## Directory Structure

```
data/
├── README.md               ← this file
├── moves/
│   ├── README.md           ← explains the moves directory
│   ├── move-slots.md       ← human-readable slot definitions (authoritative)
│   └── move-database.json  ← programmatic master move list
│
├── characters/
│   ├── README.md           ← explains the characters directory
│   └── roster.json         ← list of all playable characters
│
└── schemas/
    ├── README.md           ← explains the schemas directory
    └── move-slots.json     ← JSON schema for the slot system structure
```

---

## Core Concepts

### Move Slots
A **move slot** is a named input combination available to every wrestler, defined by position and context. Every wrestler has the same set of slots — what differs between wrestlers is which move is assigned to each slot.

See `moves/move-slots.md` for the full slot reference.

### Moves
A **move** is a named action from the master move database. Moves are assigned to slots on a per-character basis in `assets/characters/{character}/moves.json`.

See `moves/move-database.json` for the full move list.

### Move Assignments
A **move assignment** is the relationship between a slot and the move a specific character has assigned to it. These live in `assets/characters/{character}/moves.json`, not in this directory.

---

## Shared Constants

These values are used across multiple files in this directory and throughout the engine. They are defined here as the single authoritative reference.

### Power Tier Scale

Move power is expressed as a single letter grade on the following scale:

| Tier | Description |
|---|---|
| `S` | Strongest — match-defining moves |
| `A` | Very heavy damage |
| `B` | Heavy damage |
| `C` | Significant damage |
| `D` | Moderate damage |
| `E` | Minor damage |
| `F` | Light damage |
| `G` | Weakest — quick, low-damage moves |

The scale runs `S → A → B → C → D → E → F → G` from strongest to weakest.

### Move Features

A move's `feature` property describes a special outcome it triggers on successful execution:

| Value | Description |
|---|---|
| `Pin` | Move transitions directly into a pin attempt |
| `Submit` | Move applies a submission hold |
| `null` | No special outcome |

### Boolean Flags

| Flag | Description |
|---|---|
| `ko` | If `true`, this move can cause a knockout when the opponent's damage is sufficiently high |
| `bleed` | If `true`, this move can open a blade job (cause the opponent to bleed) |

---

## Conventions

- All filenames use **kebab-case**: `move-database.json`, `move-slots.md`
- JSON files use **camelCase** for property names: `eligibleSlots`, `powerTier`
- Markdown files are the human-readable authority — if a `.md` and `.json` file conflict, the `.md` is correct until reconciled
- Schema files in `data/schemas/` define the structure of data files — they are not data themselves

---

## Related

- `assets/characters/` — Per-character move assignments and model data
- `docs/mechanics/` — Explanations of how game systems work
- `docs/environment/` — Explanations of environmental systems
- `CONTRIBUTING.md` — How to contribute data, documentation, and research