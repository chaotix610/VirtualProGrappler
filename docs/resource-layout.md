# Resource layout

`data/`, `assets/` and `docs/` share the same game domains. JSON in `data/`
describes resources; `assets/` holds the media those descriptions point at;
`docs/` holds the design notes for each domain. Resource IDs and file names are
kept stable when files move between folders.

```text
data/                              assets/
  animations/  (empty)               animations/
                                       shared/turnbuckle/climbing/
  characters/                        characters/
    steve_austin_data.md               models/       character GLBs
                                       textures/     face and body art
  combat/                            combat/       (empty)
    moves.json
    move-slots.json
  environments/                      environments/
    stages.json                        arenas/
    arenas/<id>.json                     shared/
    ring/                                  models/      stage, floor, barricade,
      ring-standard.json                                outer, ceiling trusses
      ring-steps.json                      textures/    arena art and previews
                                           ring/
                                             models/    ring and ring steps
                                             textures/  canvas, apron, posts,
                                                        ropes, turnbuckles
                                       props/      (empty)
  settings/                          settings/     (empty)
    control-mappings.json
  ui/                                ui/
    main-menu.json                     fonts/
                                       textures/     menu art, headings
                                         artwork/    logo, box art, backgrounds
                                         controller/ N64 button icons
                                       audio/
                                         music/      layered menu music
                                         effects/    bells and record scratches
                                       main-menu-scene/
                                       favicon.ico
  schemas/                           source/       Blender and raw originals
                                                   (git-ignored, never shipped)
```

`docs/` follows the same split: `docs/combat/` for the HFSM, move, damage,
parameter and reversal specifications, `docs/animations/` for the AKI rig and
move-animation plans, and `docs/characters/` for the Create-a-Wrestler plan.

Schemas stay together in `data/schemas/` because they describe file types
across domains. Empty domains hold a `.gitkeep` until something lands in them.

## Shared and per-arena resources

Every arena model and texture today is used by more than one arena definition,
so they all live under `assets/environments/arenas/shared/`. Resources used by
only one arena belong in `assets/environments/arenas/<arena-id>/`, with
`models/`, `textures/` and `audio/` subfolders as needed. The ring is reused by
every arena and stays under `shared/ring/`. The model component folders
(`models/stage/`, `models/floor/`, `models/barricade/`, `models/outer/`) keep
their names because `data/environments/stages.json` groups pieces by them.

Future wrestlers follow the same pattern: matching IDs in
`data/characters/<id>.json` and `assets/characters/<id>/{models,textures}/`.
Props go in `data/environments/props/` and `assets/environments/props/`.

## How assets reach the browser

Asset paths in JSON and in config are repository-relative strings beginning
with `assets/`. Turn one into a URL with `resolveAsset()` or `requireAsset()`
from `src/data/assets.ts`; never build asset URLs by hand.

Vite's public directory is disabled. `src/data/assets.ts` globs the images,
fonts and GLBs under `assets/characters/`, `assets/environments/` and
`assets/ui/`, and Vite emits each one with a hashed URL. Menu audio, the
controller icons and the favicon are imported directly by the code or
`index.html`. A file ships only if one of these names it. The glob leaves out:

- `assets/source/` and any `source/` folder inside a domain (authoring files);
- file names containing `#`, which are unprocessed extractor output;
- `assets/animations/`: clips reach the game baked into the character GLBs.

`npm run assets:promote` copies and prepares the shipped subset out of
`assets/source/`; the manifest in `tools/promote-assets.mjs` records each
source and destination. Character GLBs land in `assets/characters/models/`,
and the ring, ring steps and RAW floor and barricade in
`assets/environments/arenas/shared/`.

## Data that code reads

- Arena definitions: `data/environments/arenas/*.json`, discovered by
  `src/data/arenas.ts`. The Arena Editor's development endpoint
  (`tools/vite-arena-editor.mjs`) is the only thing that writes them.
- Stage compatibility: `data/environments/stages.json`.
- Move catalog: `data/combat/moves.json` and `data/combat/move-slots.json`,
  loaded by `src/data/moveCatalog.ts`.
- Menu: `data/ui/main-menu.json`. Default controls:
  `data/settings/control-mappings.json`.

Run `npm run validate:data` (also part of `npm test`) to check every data file
against its schema and confirm that every `assets/...` path it names exists.
