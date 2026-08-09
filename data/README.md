# data/

Structured content for the VPG engine: move definitions, slot structures,
arenas, menu content, control bindings, and the schemas describing them.

No design rationale lives here — for how the systems work, see `docs/`.

## Contents

```text
data/
├── README.md
├── moves/
│   ├── moves.json              master move list (919 moves)
│   └── move-slots.json         slot definitions (138 slots)
├── arenas/
│   └── <arena>.json            one file per arena, 10 so far
├── ui/
│   └── main-menu.json          menu pages, items, and instruction copy
├── settings/
│   └── control-mappings.json   default N64 pad -> keyboard bindings
├── characters/                 empty; per-character data not started
└── schemas/
    ├── moves.schema.json
    ├── move-slots.schema.json
    ├── arenas.schema.json
    └── main-menu.schema.json
```

## Validation

```bash
npm run validate:data
```

Checks three things, and also runs as part of `npm test`:

1. **Schema conformance.** `main-menu.schema.json` is draft-07; the rest are
   2020-12. The validator picks the matching ajv build per file.
2. **Asset references.** Every `assets/...` string must name a file that
   exists. Deliberate exceptions live in `PENDING_ASSETS` in
   `tools/validate-data.mjs`.
3. **Menu targets.** A target with no dot names a page and must resolve.

## Conventions

- Filenames are kebab-case: `move-slots.json`, `main-menu.schema.json`.
- **Property naming is split, by file.** `moves.json` and `move-slots.json`
  use `snake_case` (`move_id`, `slot_display_name`); `arenas/*.json` and
  `ui/main-menu.json` use `camelCase` (`displayName`, `ringOverrides`). This
  is a real inconsistency, not a rule — follow whichever file you are editing,
  and do not "fix" one in isolation, since the loaders and schemas are written
  against the existing shapes.
- Asset paths are repository paths from the root (`assets/textures/...`), not
  URLs. `src/data/assets.ts` maps them to real URLs at build time.
- Schemas in `schemas/` describe data; they are not data themselves.

## Core concepts

### Move slots
A **slot** is a named input/state combination available to every wrestler.
Every wrestler has the same slots; what differs is the move assigned to each.

### Moves
A **move** is an entry in `moves/moves.json`. A move's `groups` reference group
identifiers from `move-slots.json` — the move becomes eligible for every slot
in any group it belongs to.

Note that 62 `move_id`s appear twice, as weak and strong variants; `move_id` is
unique only together with `position`.

### Power tiers

`S → A → B → C → D → E → F → G`, strongest to weakest. `null` is allowed for
moves that do no damage.

### Features and flags

| Field | Meaning |
|---|---|
| `feature: "Pin"` | Transitions directly into a pin attempt |
| `feature: "Submit"` | Applies a submission hold |
| `feature: null` | No special outcome |
| `ko` | Can cause a knockout at sufficient damage |
| `bleed` | Can open a blade job |

## Known data issues

- 58 moves reference a `running_strike` group that no slot defines, so they
  cannot currently be selected. Pinned by a test in `tests/unit/data.test.ts`.
- **8 of the 10 arenas share `apron_raw.png`**, the RAW is WAR apron, as
  placeholder art. Only King of the Ring has its own, and WrestleMania has
  none. The renderer is applying these correctly — the art is the gap.
- WrestleMania has no `mat_canvas`, `mat_apron` or `mat_turnbuckle` override;
  it falls back to the ring's own materials until bespoke art exists.
- `characters/` is empty. Per-character move assignments are not started; the
  four playable profiles are currently hardcoded in `src/combat/profiles.ts`.

## Related

- `docs/mechanics/` — how the combat systems work
- `src/data/` — the loaders that read these files
