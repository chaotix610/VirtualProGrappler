# Claude Implementation Notes: Main Menu And Control Mapper

Use this document to recreate the Virtual Pro Grappler menu shell and keyboard control mapper in a newer version of the product.

The newer product currently only has a single playable/testable feature: **Combat System Test**. Place that feature as its own menu item inside **Smackdown Mall**.

## Goal

Build a simple, data-driven menu system with this navigation shape:

```text
Main Menu
├── Multi Play
├── Single Play
└── Commissioner
    ├── Smackdown Mall
    │   └── Combat System Test
    ├── Options
    └── Controls
```

Do not recreate the older three-screen horizontal menu carousel. There should be one root menu screen, with `Multi Play`, `Single Play`, and `Commissioner` as menu options. Opening one of those options shows that submenu. Do not add or depend on a 3D main menu scene.

## Data Model

Prefer a JSON-driven menu definition so menu content can be edited without changing UI code.

Recommended shape:

```json
{
  "version": "1.0.0",
  "pages": {
    "mainMenu": {
      "id": "main_menu",
      "displayName": "Main Menu",
      "menuItems": [
        {
          "id": "multi_play",
          "displayName": "Multi Play",
          "target": "multiPlay"
        },
        {
          "id": "single_play",
          "displayName": "Single Play",
          "target": "singlePlay"
        },
        {
          "id": "commissioner",
          "displayName": "Commissioner",
          "target": "commissioner"
        }
      ]
    },
    "commissioner": {
      "id": "commissioner",
      "displayName": "Commissioner",
      "menuItems": [
        {
          "id": "smackdown_mall",
          "displayName": "Smackdown Mall",
          "target": "smackdownMall"
        },
        {
          "id": "options",
          "displayName": "Options",
          "target": "commissioner.options"
        },
        {
          "id": "controls",
          "displayName": "Controls",
          "target": "commissioner.controls"
        }
      ]
    },
    "smackdownMall": {
      "id": "smackdown_mall",
      "displayName": "Smackdown Mall",
      "menuItems": [
        {
          "id": "combat_system_test",
          "displayName": "Combat System Test",
          "target": "test.combat_system"
        }
      ]
    }
  }
}
```

Add placeholder `multiPlay` and `singlePlay` pages even if their items are not implemented yet. Give submenus a Back row in UI code, or include Back in data if the product architecture prefers explicit routes.

## Routing Behavior

- Track the active menu page by key, for example `activeMenuKey = "mainMenu"`.
- If a selected item target matches a key in `pages`, switch to that page.
- If the target is `commissioner.controls`, show the control mapper screen.
- If the target is `test.combat_system`, open the existing Combat System Test.
- For unimplemented targets, show a lightweight status message or disabled state instead of crashing.
- Pressing Back/B/Escape from a submenu should return to the previous menu or root menu.
- Pressing Back/B/Escape from the control mapper should return to `Commissioner`.
- Pressing Back/B/Escape from Smackdown Mall should return to `Commissioner`.

## Input Model

Use a small virtual controller layer. Keyboard keys map to N64-style game inputs, and all menus should consume virtual inputs instead of raw key names.

Default bindings:

```json
{
  "version": "1.0.0",
  "profile": "default",
  "bindings": {
    "dpadUp": ["ArrowUp"],
    "dpadDown": ["ArrowDown"],
    "dpadLeft": ["ArrowLeft"],
    "dpadRight": ["ArrowRight"],
    "controlStickUp": ["KeyW"],
    "controlStickDown": ["KeyS"],
    "controlStickLeft": ["KeyA"],
    "controlStickRight": ["KeyD"],
    "a": ["Enter"],
    "b": ["Escape"],
    "z": ["KeyZ"],
    "l": ["KeyQ"],
    "r": ["KeyE"],
    "start": ["Space"],
    "cUp": ["KeyI"],
    "cDown": ["KeyK"],
    "cLeft": ["KeyJ"],
    "cRight": ["KeyL"]
  }
}
```

Normalize keyboard events with `event.code || event.key`. Convert them into virtual inputs:

```text
dpadUp -> up
dpadDown -> down
dpadLeft -> left
dpadRight -> right
controlStickUp -> stickUp
controlStickDown -> stickDown
controlStickLeft -> stickLeft
controlStickRight -> stickRight
a -> a
b -> b
z -> z
start -> start
cUp/cDown/cLeft/cRight -> cUp/cDown/cLeft/cRight
```

Menu controls:

- Up/down move the active menu cursor.
- A/Enter opens the selected target.
- B/Escape goes back.
- Z toggles the selected item instructions/help modal if the product includes one.
- Left/right should not switch top-level menu pages in this newer menu.

## Control Mapper

Create a `Controls` screen under `Commissioner`.

Rows to expose:

```text
D-Pad Up
D-Pad Down
D-Pad Left
D-Pad Right
Control Stick Up
Control Stick Down
Control Stick Left
Control Stick Right
C-Up
C-Down
C-Left
C-Right
A
B
Z
Start
L
R
```

Required behavior:

- The mapper displays the current keyboard binding for each virtual controller input.
- Up/down moves through rows.
- A/Enter on a binding row enters listening mode.
- The next key pressed replaces that binding.
- Escape cancels listening mode.
- If the new key is already assigned to another input, show a confirmation dialog: `Replace existing binding?`
- If confirmed, remove the old assignment and assign the key to the selected row.
- Include actions for `Reset Defaults`, `Export JSON`, and `Back`.
- Persist remapped controls to browser `localStorage`.
- Export should download a JSON file in the same shape as the defaults above.

Use the storage key:

```text
vpg-control-mappings
```

When loading mappings, merge saved bindings over defaults so newly added controls still receive default values.

## Smackdown Mall Requirement

The newer product currently has one existing feature: **Combat System Test**.

Place it here:

```text
Main Menu -> Commissioner -> Smackdown Mall -> Combat System Test
```

The `Combat System Test` menu item should route to the existing test screen/component. Use a route id such as:

```text
test.combat_system
```

If the existing test already has a route name, use that existing route, but keep the visible menu label exactly:

```text
Combat System Test
```

## Presentation

Keep the first implementation simple:

- Static full-screen menu background.
- No 3D menu scene.
- One visible menu panel at a time.
- Clear active-row highlight.
- Typography and colors can be styled later, but preserve the N64-inspired direct controller feel.
- Avoid page carousel transitions. Page changes can be simple fades or immediate swaps.

## Acceptance Criteria

- The first screen shows `Multi Play`, `Single Play`, and `Commissioner`.
- Selecting `Commissioner` opens the Commissioner submenu.
- Selecting `Smackdown Mall` opens a Smackdown Mall submenu.
- Selecting `Combat System Test` launches the existing Combat System Test.
- Selecting `Controls` opens the control mapper.
- Control remaps persist after refresh.
- Reset restores defaults.
- Export downloads the active mappings as JSON.
- B/Escape backs out of submenus and the controls screen.
- Left/right no longer changes top-level menu pages.
