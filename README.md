# Virtual Pro Grappler

![Virtual Pro Grappler](assets/artwork/vpg-box-art.png)

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)
![Babylon.js](https://img.shields.io/badge/Babylon.js-9.x-gray?logo=babylondotjs)
![Vite](https://img.shields.io/badge/Vite-5.x-646CFF?logo=vite&logoColor=white)

Virtual Pro Grappler is an open-source professional wrestling game and engine inspired by the AKI-era N64 wrestling games: WWF No Mercy, Virtual Pro Wrestling 2, WCW/nWo Revenge, and related titles.

The project is currently in an early engine and tooling phase. The focus right now is building the data model, UI flow, arena rendering pipeline, and control mapping foundation before full match gameplay comes online.

## Current State

What runs today:

- A data-driven main menu built from `data/ui/main-menu.json`.
- Three primary menu pages: Multi Play, Single Play, and Commissioner.
- A Commissioner Controls screen with remappable keyboard bindings.
- UI button texture support for D-pad, control stick, C-buttons, A, B, Z, Start, L, and R.
- An Arena Viewer selection screen with arena preview images.
- Babylon.js arena loading only after an arena is selected/opened.
- Arena Viewer camera controls for rotate and zoom.
- JSON schemas for main menu data, moves, and move slots.
- Move and move-slot data files under `data/moves`.
- Arena definitions under `data/arenas`.
- Vite build/dev tooling and Vitest test setup.

What is still in progress:

- Match runtime and fighter controller.
- Character loading and animation playback in match context.
- Grapple, strike, reversal, damage, pin, and submission systems.
- Full match setup flow.
- Superstar select and character editor.
- Save data, championship progression, and AI.

## Project Goals

The long-term goal is a legally clean, fully moddable wrestling game that preserves the feel of the N64 classics while using modern browser technology.

Core principles:

- Data-driven content: menus, arenas, moves, move slots, wrestlers, and match rules should live in JSON where practical.
- Frame-deterministic gameplay: combat logic should be testable and reproducible.
- N64-inspired presentation: low-poly assets, stylized textures, bold menu typography, and direct controller-driven UI.
- Mod-friendly structure: adding arenas, wrestlers, moves, attires, and menu options should not require invasive engine changes.
- Original final assets: the project may use classic games as design references, but final shipped content should be legally clean.

## Running The Project

Install dependencies:

```bash
npm install
```

Start the dev server:

```bash
npm run dev
```

Build for production:

```bash
npm run build
```

Run tests:

```bash
npm run test
```

Preview a production build:

```bash
npm run preview
```

## Controls

Controls are stored in browser `localStorage` and can be remapped from the Commissioner -> Controls screen.

Default keyboard mappings:

| Game input | Default key |
| --- | --- |
| D-Pad Up | ArrowUp |
| D-Pad Down | ArrowDown |
| D-Pad Left | ArrowLeft |
| D-Pad Right | ArrowRight |
| Control Stick Up | W |
| Control Stick Down | S |
| Control Stick Left | A |
| Control Stick Right | D |
| A | Enter |
| B | Escape |
| Z | Z |
| L | Q |
| R | E |
| Start | Space |
| C-Up | I |
| C-Down | K |
| C-Left | J |
| C-Right | L |

Current Arena Viewer controls after opening an arena:

| Game input | Action |
| --- | --- |
| Control Stick Up | Rotate arena down |
| Control Stick Down | Rotate arena up |
| Control Stick Left | Rotate arena right |
| Control Stick Right | Rotate arena left |
| C-Up | Zoom in |
| C-Down | Zoom out |
| B | Exit back to arena selection |

## Data And Content

Important data files:

| Path | Purpose |
| --- | --- |
| `data/ui/main-menu.json` | Main menu page, item, target, and instruction data |
| `data/schemas/main-menu.schema.json` | Schema for the main menu data |
| `data/arenas/*.json` | Arena IDs, display names, preview images, and render data |
| `data/moves/moves.json` | Move database |
| `data/moves/move-slots.json` | Input/context move-slot mapping data |
| `data/schemas/moves.schema.json` | Schema for move definitions |
| `data/schemas/move-slots.schema.json` | Schema for move-slot definitions |

Important docs:

| Path | Purpose |
| --- | --- |
| `docs/ui/main-menu.md` | Main menu flow reference |
| `docs/ui/superstar-select.md` | Superstar select planning/reference |
| `docs/mechanics/move-slots.md` | Move-slot design reference |
| `docs/mechanics/move-damage.md` | Damage formula research |
| `docs/mechanics/REVERSALS.md` | Reversal-system research |
| `docs/mechanics/HSFM Blueprint.md` | Hierarchical state machine plan |

## Rendering And Assets

The runtime uses Babylon.js for rendering. The current render path is centered on arena loading:

- `src/renderer/SceneManager.js` creates the Babylon engine, scene, camera, and base light.
- `src/renderer/ArenaRenderer.js` loads arena/ring GLB assets and applies arena data.
- `src/renderer/MaterialManager.js` handles material and texture setup.
- `src/main.js` currently owns the menu shell, controls screen, arena selector, and viewer input.

Key asset folders:

| Path | Purpose |
| --- | --- |
| `assets/glb/arena` | Arena and arena prop GLB files |
| `assets/glb/ring` | Ring GLB files |
| `assets/textures/arena` | Arena textures and preview images |
| `assets/textures/ring` | Ring, canvas, rope, post, and turnbuckle textures |
| `assets/textures/ui` | Menu backgrounds, headings, button icons, and fonts |
| `assets/models/blender` | Source Blender files |

## Project Structure

```text
.
├── assets/              # Artwork, GLB files, Blender files, textures, UI assets
├── data/                # JSON content and JSON schemas
├── docs/                # UI, environment, and mechanics documentation
├── src/
│   ├── data/            # Data loading helpers
│   ├── renderer/        # Babylon.js scene, arena, and material renderers
│   └── main.js          # Current UI shell and arena viewer runtime
├── tests/               # Vitest tests
├── index.html           # App entry point and current UI styles
├── package.json         # Scripts and dependencies
└── vite.config.js       # Vite config
```

## Technology

| Layer | Current technology |
| --- | --- |
| Runtime | Vanilla JavaScript ES modules |
| Renderer | Babylon.js 9 |
| Bundler/dev server | Vite 5 |
| Tests | Vitest |
| Schema validation | AJV |
| Audio dependency | Howler.js |
| Data format | JSON |
| 3D source assets | Blender |
| Runtime 3D assets | GLB |

## Roadmap

Near-term:

- Continue polishing the main menu, controls, and arena viewer.
- Expand and validate move/move-slot schemas.
- Add more arena data and preview coverage.
- Move large inline UI code toward dedicated modules as screens stabilize.

Gameplay foundation:

- Fixed-step game loop and input buffer.
- Fighter entity model.
- Hierarchical fighter state machine.
- Movement, running, facing, and interaction regions.
- Strike and grapple initiation.
- Move resolver and move execution.

Combat systems:

- Damage calculation.
- Limb stamina and health caps.
- Reversal windows and probability rules.
- Pins, submissions, rope breaks, count outs, and match rules.

Game flow:

- Match setup screens.
- Superstar select.
- Character data, attires, parameters, and move assignment.
- Championship/career progression.
- Save/load.

## License

Virtual Pro Grappler is licensed under the GNU General Public License v3.0. See [LICENSE](LICENSE).

