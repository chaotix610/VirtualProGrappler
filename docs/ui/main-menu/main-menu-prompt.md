# VPG Engine — Main Menu Design Plan

A complete design specification for the VPG Engine main menu system. Covers layout, components, CSS architecture, asset inventory, interaction model, data sources, Controls mapping, and the migration path from the current 2D CSS background prototype to the eventual 3D scene.

---

## 1. Concept overview

The main menu is a single full-screen interface. A backstage locker-room scene fills the background. Three pages — **Multi Play**, **Single Play**, **Commissioner** — share **the same fixed on-screen menu chrome**: a title bar across the top of the viewport, an item panel anchored to the bottom-left, and the rest of the screen showing the background.

When the player switches between pages, the **menu chrome stays put** and the **background pans horizontally** behind it to reveal a different region of the same scene. Multi Play shows the table/cage area on the left; Single Play shows the staircase in the middle; Commissioner shows the lockers on the right. This is the No Mercy convention — the menu is the camera viewfinder, and switching pages slides the camera, not the UI.

What changes per page:

- Title logo (Multi Play / Single Play / Commissioner)
- Item list contents
- Background's horizontal pan position

What stays identical:

- Title bar geometry and notch shape
- Item panel position, size, and styling
- White outline frame
- All chrome typography and effects

Pressing **Z** over an active menu item opens an Instructions popup — a centered modal overlay with a backdrop dimming the scene. Pressing Z again closes it.

In Phase 1 (current), the background is a wide PNG that zooms and pans via CSS `transform`, using the `docs/ui/mockups/bgmap-*.png` images as framing references. In Phase 2, that PNG is replaced with a Babylon scene whose camera tweens between three look-at points. The menu chrome stays in DOM/CSS in both phases.

---

## 2. Visual language

### 2.1 Shared chrome (all three panels)

- **White outer frame**, 1px solid, wrapping the entire panel
- **Title bar** across the top, ~22% of panel height, using the tiled/sliced background asset `assets/textures/ui/menu_heading_bg.png`, with a notched right edge (45° cut, ~25% from the right edge, descending to roughly 60% of the bar height before flattening out and continuing to the right edge as a thin extension)
- **Title logo** in the top-left of the title bar — chunky stylized lettering, page-specific accent color, baked into a PNG
- **Item panel** below-left, occupying roughly the left third of the content area, translucent purple-blue fill (`rgba(54,45,187,0.35)`) with a light-blue inset glow
- **Instructions popup** is not part of the panel chrome. It is a centered body-level modal over a dimmed backdrop, opened by Z.

### 2.2 Per-page accents

|Page|Title color|Title font effect|
|---|---|---|
|Multi Play|Red-orange `#e8442b`|Italic, slight forward slant|
|Single Play|Cyan-blue `#3ec0e8`|Italic with chrome highlight|
|Commissioner|Lime green `#5fe83e`|Italic, electric outline|

Item panel chrome and Instructions modal styling are **identical across all three pages**. Only the title logo PNG and (optionally) the active-state accent color change.

### 2.3 Item states

- **Idle**: white fill `#ffffff`, 0.5px black stroke, no glow
- **Active** (cursor on this item): orange fill `#f28f3d`, 2px black stroke, pulsing outer glow via the existing `glowPulse` animation
- **Disabled** (future, for locked content): grey fill `#888888`, no glow, no interaction
- **Pressed** (briefly, on A): brief flash to white, 100ms

Transitions between states use the existing 0.2s ease curve.

---

## 3. Layout system

### 3.1 Stage architecture

The viewport contains three stacked layers:

```
┌──────────────────────────────────────────┐
│  Layer 3: Instructions modal (when open) │
├──────────────────────────────────────────┤
│  Layer 2: Menu chrome (fixed, full-screen)│
├──────────────────────────────────────────┤
│  Layer 1: Zooming/panning background     │
└──────────────────────────────────────────┘
```

**Layer 1 — zooming/panning background.** A single background image fills an `overflow: hidden` stage container. CSS `transform`, `transform-origin`, and scale values move it through the five-stage zoom/pan sequence when the active page changes. The `docs/ui/mockups/bgmap-menu-multiplay.png`, `docs/ui/mockups/bgmap-menu-singleplay.png`, and `docs/ui/mockups/bgmap-menu-commissioner.png` files show the intended background framing for each page.

**Layer 2 — menu chrome.** A `position: fixed` overlay covering the full viewport. Three `.vpg-menu-panel` elements occupy this layer, all stacked at the same screen position. Only one has `data-active="true"` at a time — the others have `opacity: 0` and `pointer-events: none`. Crossfading between panels is fast (250ms) and runs in parallel with the background zoom/pan.

**Layer 3 — instructions modal.** Body-level elements that overlay everything else when Z is pressed.

### 3.2 Menu chrome layout (same for all three pages)

Each panel uses absolute positioning rather than grid, since the regions don't share boundaries:

- **Title bar**: `top: 0; left: 0; right: 0; height: 11vh` — full viewport width
- **Item panel**: `top: 11vh; left: 0; bottom: 0; width: 26vw` — anchored bottom-left
- **Empty area** (the rest): no element, just the layers below showing through

The white outline frame is implemented as borders on the title bar (bottom edge) and item panel (right and bottom edges). The notch on the title bar's right side is rendered with `clip-path: polygon(...)`.

### 3.3 Background pan

The background image uses `assets/textures/ui/mainmenu_bg.png` and is framed to match the bgmap mockups. Use `transform-origin` as the main page position control and scale to create the zoomed-in page view:

|Page|Reference mockup|What's visible behind the empty area|
|---|---|---|
|Multi Play|`docs/ui/mockups/bgmap-menu-multiplay.png`|Left region — table/cage|
|Single Play|`docs/ui/mockups/bgmap-menu-singleplay.png`|Middle region — staircase|
|Commissioner|`docs/ui/mockups/bgmap-menu-commissioner.png`|Right region — lockers|

The `.vpg-stage` container has `data-page`, `data-zoom`, and `data-transition` attributes. JS sets those attributes during the transition; CSS owns the actual transform values.

### 3.4 Page transitions

The transition between pages is a five-stage cinematic sequence rather than a simple crossfade. Total duration: ~1.35 seconds.

|Stage|Duration|What happens|
|---|---|---|
|1. Hide menu|150ms|Active panel fades out. Title bar, item panel, and any open instructions all clear.|
|2. Zoom out|400ms|Background scales from 1.6 down to 1.0, revealing the whole panorama. The transform-origin animates to the midpoint between the old and new focus regions during this stage.|
|3. Slide / hold|250ms|A held beat at the wide view. Visually the camera holds steady on the panorama. Internally, `transform-origin` continues animating to its destination.|
|4. Zoom in|400ms|Background scales from 1.0 back up to 1.6, now centered on the new region.|
|5. Show menu|150ms|New panel fades in with its updated title logo and item list.|

**Wide-view hold.** At scale 1.0, the full background is visible. Stage 3 is a deliberate beat that lets the player register the whole room before zooming in on the new region. If the CSS framing needs a visible lateral adjustment at wide view, it should happen during this stage, still driven by the same `data-page` and transform-origin system.

**Implementation.** A JS state machine in the prototype walks the five stages with `await sleep(...)` between them. The CSS handles the actual transform animations — JS just sets `data-page`, `data-zoom`, and `data-transition` attributes on the `.vpg-stage` element at the right times. CSS rules keyed off those attributes handle the rest.

**Input during transitions.** While `transitionInProgress` is true:

- Up/down/Z/Enter are ignored
- Left/right inputs are stored in a `queuedDirection` slot — only the latest one is kept
- When the current transition finishes, if a queued direction exists, a new transition fires immediately

This handles d-pad mashing without queuing up an arbitrary number of pending transitions.

**Phase 2 (Babylon scene).** The same five-stage sequence applies, but instead of CSS `transform` animations on a 2D image, the bg uses Babylon `Animation` to tween the camera's position and field-of-view. Stage 2 pulls the camera back to a wide framing, stage 4 dollies it back in on the new look-at point. The DOM menu chrome timing stays identical.

---

## 4. Component anatomy

### 4.1 `<MenuPanel>`

The top-level component for a single page. Receives one entry from the JSON `pages` object.

**Structure:**

```html
<div class="vpg-menu-panel" data-page="multi-play">
  <div class="vpg-menu-frame">
    <div class="vpg-menu-titlebar">
      <img class="vpg-menu-title-logo" src="..." alt="Multi Play">
    </div>
    <ul class="vpg-menu-items" role="menu">
      <!-- MenuItem components -->
    </ul>
    <!-- The rest of the viewport is intentionally empty; the background scene shows through -->
  </div>
</div>
```

**Props/data:**

- `page`: one of `multi-play`, `single-play`, `commissioner`
- `activeItemId`: which item currently has the cursor

### 4.2 `<MenuItem>`

A single menu entry within a panel.

**Structure:**

```html
<li class="vpg-menu-item" data-id="exhibition" data-state="active" role="menuitem" tabindex="0">
  Exhibition
</li>
```

**States** (managed via `data-state`):

- `idle`
- `active`
- `disabled`

### 4.3 `<InstructionsModal>` (body-level overlay)

Renders the contents of an `instructions` block from the JSON. **Lives at the body level**, not inside any panel. This matches the in-game reference behavior: a centered modal that overlays the menu, with a backdrop dimming the scene behind.

**Visual language (distinct from the menu chrome):**

- Solid dark purple fill `#1a0d4a` — much darker and more saturated than the translucent menu panel
- Light cyan double border (~`#b8e0f0`), achieved with stacked `box-shadow` rings to create the embossed/beveled look
- Drop shadow below the modal for separation
- White text throughout (no orange accent in the modal; orange is reserved for the active menu item)
- Heading positioned top-left with comfortable padding
- Definition lists rendered as a centered two-column grid: left-aligned terms, right-aligned definitions, generous column gap

**Structure:**

```html
<!-- Direct children of body, after the .vpg-stage element -->
<div class="vpg-instructions-backdrop" data-state="hidden"></div>
<div class="vpg-instructions-modal" data-state="hidden" role="dialog" aria-modal="true">
  <h3 class="vpg-instructions-title">&lt;&lt; Exhibition Mode &gt;&gt;</h3>
  <div class="vpg-instructions-body">
    <!-- One element per block in the JSON -->
    <dl>
      <dt>Single Match</dt><dd>1 vs. 1</dd>
      ...
    </dl>
    <!-- or <p> for paragraph blocks -->
  </div>
</div>
```

**Behavior:**

- Both `backdrop` and `modal` are always in the DOM. Visibility is controlled via `data-state`.
- Hidden: opacity 0, pointer-events none
- Visible: opacity 1, modal scales from 0.96 → 1.0 (subtle pop-in)
- Backdrop is `rgba(0, 0, 0, 0.45)` — dims the scene without obliterating it
- Content is regenerated from the active menu item's `instructions` data **whenever the cursor moves**, even if the modal is hidden, so there's no flash when opening
- The body iterates over `instructions.blocks` and renders each block according to its `type`:
    - `paragraph` → `<p>`
    - `definitionList` → `<dl>` with `<dt>`/`<dd>` pairs

**Why not inside the panel?** The reference image shows the modal centered on screen, overlapping the menu rather than sitting beside it. Keeping it at body level also means it isn't constrained by the menu panel's dimensions or transform animations during page switches.

---

## 5. CSS architecture

### 5.1 Design tokens

Centralized in a `:root` block as CSS custom properties so the three pages can share chrome and override only what differs.

```css
:root {
  /* --- Panel chrome --- */
  --vpg-frame-color: #ffffff;
  --vpg-frame-width: 1px;
  --vpg-titlebar-bg: rgba(160, 165, 195, 0.92);
  --vpg-panel-bg: rgba(54, 45, 187, 0.35);
  --vpg-panel-glow: #ADD8E6;

  /* --- Instructions modal chrome (distinct from menu chrome) --- */
  --vpg-modal-bg: #1a0d4a;
  --vpg-modal-border: #b8e0f0;
  --vpg-modal-backdrop: rgba(0, 0, 0, 0.45);

  /* --- Typography --- */
  --vpg-font-display: "Oswald", sans-serif;
  --vpg-font-body: "Oswald", sans-serif;
  --vpg-item-size: 22px;
  --vpg-item-letter-spacing: -1px;

  /* --- Item state colors --- */
  --vpg-item-color-idle: #ffffff;
  --vpg-item-color-active: #f28f3d;
  --vpg-item-color-disabled: #888888;
  --vpg-item-stroke: #000000;

  /* --- Motion --- */
  --vpg-state-transition: 0.2s ease;
  --vpg-page-transition: 0.25s ease-out;
  --vpg-modal-transition: 0.18s ease-out;
}

/* Per-page overrides */
.vpg-menu-panel[data-page="multi-play"]    { --vpg-title-accent: #e8442b; }
.vpg-menu-panel[data-page="single-play"]   { --vpg-title-accent: #3ec0e8; }
.vpg-menu-panel[data-page="commissioner"]  { --vpg-title-accent: #5fe83e; }
```

### 5.2 Class naming

A `vpg-` prefix on every class to avoid collisions. The existing `.menu-style` and `.menu-item` rules become `.vpg-menu-frame` and `.vpg-menu-item`. The typo in the current CSS (`.gamemenu-item` in the `:focus`/`.active` selectors) is normalized to `.vpg-menu-item`.

### 5.3 Reusing the existing CSS

The provided CSS is preserved as-is for the **glow, fill, font, and active-state behaviors**. It moves into the new class names but the property values stay intact. The design tokens above are derived from those values, not replacements for them.

---

## 6. Asset inventory

### Pre-rendered (PNG)

|Asset path|Use|Size guidance|
|---|---|---|
|`assets/textures/ui/mainmenu_bg.png`|Background until Phase 2|1376×768, will be replaced by Babylon scene|
|`assets/textures/ui/menu_heading_bg.png`|Title bar background|617×68, tile or slice horizontally behind title logo|
|`assets/textures/ui/heading_multiplay.png`|Multi Play title logo|~280×60 with transparency|
|`assets/textures/ui/heading_singleplay.png`|Single Play title logo|~280×60 with transparency|
|`assets/textures/ui/heading_commissioner.png`|Commissioner title logo|~280×60 with transparency|

The `headingImage` field in the menu JSON points at the heading PNGs directly. The background path is hardcoded in the prototype CSS (single fixed asset).

### Reference mockups

|Asset path|Use|
|---|---|
|`docs/ui/mockups/menu-multiplay.png`|Chrome/layout reference for Multi Play|
|`docs/ui/mockups/menu-singleplay.png`|Chrome/layout reference for Single Play|
|`docs/ui/mockups/menu-commissioner.png`|Chrome/layout reference for Commissioner|
|`docs/ui/mockups/bgmap-menu-multiplay.png`|Background framing reference for Multi Play|
|`docs/ui/mockups/bgmap-menu-singleplay.png`|Background framing reference for Single Play|
|`docs/ui/mockups/bgmap-menu-commissioner.png`|Background framing reference for Commissioner|

### CSS-rendered

- Outer white frame
- Title bar fill and notch
- Item panel translucent fill and inset glow
- All item text styling and state animations

The mockup PNGs in `docs/ui/mockups` are **reference only**. The shipping menu reproduces them with HTML/CSS, not by displaying the mockups.

---

## 7. Data sources

### 7.1 Main menu data

The top-level menu is driven by `data/schemas/main-menu-schema.json`.

Despite the filename, this file currently behaves as the menu data file, not as a strict JSON Schema validator. That is acceptable for this prototype. Treat it as the source of truth for:

- Top-level page order
- Page ids and display names
- Heading image paths
- Menu item ids, labels, targets, and Instructions modal content

The file currently includes a `$schema` pointer to `./main-menu.schema.json`, but that validator file is not present yet. Do not block the prototype on that pointer.

The current shape works for the top-level menu:

```json
{
  "version": "1.0.0",
  "pages": {
    "multiPlay": {
      "id": "multi_play",
      "displayName": "Multi Play",
      "headingImage": "assets/textures/ui/heading_multiplay.png",
      "menuItems": [
        {
          "id": "exhibition",
          "displayName": "Exhibition",
          "target": "match_setup.exhibition",
          "instructions": {
            "title": "<< Exhibition Mode >>",
            "blocks": [
              {
                "type": "definitionList",
                "items": [
                  { "term": "Single Match", "definition": "1 vs. 1" }
                ]
              }
            ]
          }
        }
      ]
    }
  }
}
```

Implementation notes:

- Render pages in this explicit order: `multiPlay`, `singlePlay`, `commissioner`.
- Use each page's `id` as the DOM-facing page id (`multi_play`, `single_play`, `commissioner`) unless the implementation normalizes ids consistently.
- Use each item `target` as a route/action id. Pressing A/Enter opens that target. It should not exit the menu shell unless the target intentionally leaves the menu system.
- Render `instructions.title` exactly as authored. Do not automatically append "Mode".
- Render instruction blocks by `type`: `paragraph` and `definitionList` are currently required.

### 7.2 Arena data

Arena selection and Arena Viewer screens should load arenas from `data/arenas/*.json`, using each file's `displayName` and `previewImage`. Do not hardcode the historical No Mercy arena list. Show only arenas backed by current JSON and preview assets.

### 7.3 Controls mapping data

Controls use a separate JSON file, tentatively `data/settings/control-mappings.json`, with defaults seeded from the app if that file does not exist yet. The browser cannot silently write arbitrary repo files, so the prototype should:

- Keep the active mappings in app state.
- Persist mappings to `localStorage` for normal browser use.
- Provide an Export JSON action that downloads/writes the same JSON shape as `control-mappings.json`.
- Keep the JSON shape simple enough that a future desktop/dev bridge can save it directly to `data/settings/control-mappings.json` without changing the UI.

Recommended shape:

```json
{
  "version": "1.0.0",
  "profile": "default",
  "bindings": {
    "dpadUp": ["ArrowUp"],
    "dpadDown": ["ArrowDown"],
    "dpadLeft": ["ArrowLeft"],
    "dpadRight": ["ArrowRight"],
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

---

## 8. Interaction model

### 8.1 Input map

|Input|Action|Notes|
|---|---|---|
|Left / Right (D-pad or stick)|Switch active page|Wraps: Commissioner → Multi Play|
|**L / R shoulder buttons**|Switch active page|Same behavior as left/right d-pad|
|Up / Down (D-pad or stick)|Move cursor between items in active page|Wraps within page|
|A|Open the highlighted item|Routes to the item's `target` from the JSON|
|Z|Toggle Instructions modal for the highlighted item|Body-level overlay, centered|
|B / Esc|Close Instructions if open; otherwise back/exit the current menu system|Two-stage|
|Start|Reserved (pause / shortcut menu, future)|—|

Keyboard fallbacks for development: arrow keys mirror the d-pad; **Q/E mirror the L/R shoulders**; Enter = A; Z = Z; Esc = B.

### 8.2 State machine

The menu has two nested state machines: one for **page**, one for **item cursor + instructions**.

```
PageState: { multiPlay | singlePlay | commissioner }
  on LEFT  → previous page
  on RIGHT → next page

ItemState (per page): { idle | instructionsOpen }
  on UP/DOWN  → move cursor (allowed in both states)
  on Z (idle) → instructionsOpen
  on Z (instructionsOpen) → idle
  on A (idle) → open target
  on A (instructionsOpen) → ignored
  on B (instructionsOpen) → idle
  on B (idle) → back/exit current menu system
```

Switching pages while Instructions is open closes the popup as part of the transition.

### 8.3 The Z-button modal

The Instructions backdrop and modal are always present in the DOM at the body level (siblings of `.vpg-stage`); their visibility is controlled by a `data-state` attribute on each. When `data-state="hidden"`, opacity is 0 and pointer-events are off. When `data-state="visible"`, opacity is 1 and the modal scales from 0.96 → 1.0 for a subtle pop-in.

The content inside the modal updates whenever the cursor moves, even if the modal is hidden — so opening it always shows the current item's instructions immediately, with no flash.

The backdrop dims the scene without obscuring it; the menu panel remains visible underneath, just darker. This gives the player visual continuity — they always know which menu item the modal corresponds to.

---

## 9. Controls page

The Commissioner page includes a `Controls` menu item from `data/schemas/main-menu-schema.json`:

```json
{
  "id": "controls",
  "displayName": "Controls",
  "target": "commissioner.controls"
}
```

Pressing A/Enter on Controls opens a full-screen menu page for mapping keyboard keys to N64 controller buttons.

### 9.1 Visual requirements

- Use the same VPG menu chrome: title bar, item panel styling, white frame, and active orange cursor treatment.
- Title should read `Controls` using text or a future heading image.
- Show/list the N64 controller buttons as the primary rows:
  - D-Pad Up
  - D-Pad Down
  - D-Pad Left
  - D-Pad Right
  - A
  - B
  - Z
  - L
  - R
  - Start
  - C-Up
  - C-Down
  - C-Left
  - C-Right
- Each row shows the currently mapped keyboard key(s).
- Use existing button art where available: `assets/textures/ui/button_l.png`, `assets/textures/ui/button_r.png`, and `assets/textures/ui/button_z.png`.
- For buttons without art yet, use compact text labels with the same styling as the rest of the UI.
- Include visible actions for `Reset Defaults`, `Export JSON`, and `Back`.

### 9.2 Mapping behavior

- Up/down moves through button rows and action rows.
- A/Enter on a button row enters `listening` mode.
- In `listening` mode, the next keyboard key pressed becomes the primary binding for that N64 button.
- Escape/B cancels listening mode without changing the binding.
- Duplicate bindings are allowed only after confirmation. If the new key is already assigned elsewhere, show a small confirmation dialog: `Replace existing binding?` with `Yes` / `No`.
- Reset Defaults restores the recommended default map.
- Export JSON exports the current mapping using the shape in section 7.3.
- B/Escape from the Controls page returns to the Commissioner page.

### 9.3 Build scope

The first pass only needs keyboard-to-N64 mapping. Gamepad remapping can be added later using the same page and JSON shape.

---

## 10. Migration path: 2D -> 3D

### Phase 1 (now): CSS background zoom/pan prototype

- `assets/textures/ui/mainmenu_bg.png` is rendered as a fullscreen CSS background layer
- Page framing matches the `docs/ui/mockups/bgmap-*.png` references
- Page transitions use the five-stage sequence from section 3.4: hide menu, zoom out, wide hold/optional pan, zoom in, show menu
- CSS handles scale and transform-origin; JS only sets stage attributes and transition state
- Menu panels are absolutely positioned over it using viewport-relative units (`vw` / `vh` or `%`)
- No Babylon scene is required for Phase 1

### Phase 2 (later): Babylon scene

- The `<body>` background becomes a Babylon canvas filling the viewport
- A static camera frames the entire room as the default
- On page switch, the camera tweens to the appropriate region using `Animation` with `EASINGFUNCTION_INOUTCUBIC`
- Menu panels remain in the DOM, positioned with `position: fixed` over the canvas
- The Babylon GUI library is **not** used for the menu chrome — staying in DOM/CSS keeps the styling sharper and easier to iterate
- Instructions popup remains DOM-based for the same reason

The crucial design decision here: **the menu chrome lives in HTML/CSS, not Babylon GUI**, even after the background goes 3D. This keeps the typography crisp (Babylon GUI's text rendering is weaker than the browser's), keeps responsive layout easy, and means all the work done in Phase 1 carries forward directly.

### What changes between phases

|Aspect|Phase 1|Phase 2|
|---|---|---|
|Background|`<div>` with `background-image`|`<canvas>` with Babylon scene|
|Camera|None|Tweens between three look-at points|
|Panels|Same|Same|
|Page transition|CSS zoom/pan plus panel fade|Panel fade + camera zoom/pan using same timing|
|Audio|Optional ambient loop|Spatialized ambient + camera move whoosh|

---

## 11. Open questions and future work

- **Cursor sound effects.** No Mercy had a distinct chime for cursor movement and a heavier thud for activation. Need to spec these once SFX assets are picked.
- **Memory card/save indicator.** No Mercy showed a small "Controller Pak" icon when active. The Commissioner page mentions Controller Pak in its Smackdown Mall instructions — worth deciding whether VPG ships a save indicator on the menu screen and where it lives.
- **Localization.** All instruction copy is in English in the JSON. A `locale` key per instruction block would let the JSON support multiple languages without restructuring. Not urgent.
- **Accessibility.** Keyboard navigation is built in; screen reader semantics need a pass (the `role="menu"` / `role="menuitem"` attributes are a start). Color-only state distinction (orange vs white) should be backed up by the glow animation, which the current CSS already does.
- **Disabled items.** The state is specced but no current items use it. Will become relevant when locked content (e.g. unlockable arenas) is added.
- **The notched title-bar shape on Commissioner.** The Commissioner mockup has a different aspect ratio than the other two. Need to confirm whether that's intentional or a mockup artifact, and lock the notch geometry as a single shared shape across all three pages.
- **Main menu data naming.** `data/schemas/main-menu-schema.json` is currently menu data, not a JSON Schema. Consider renaming it later to `data/ui/main-menu.json` and adding a real schema separately.

---

## 12. Acceptance checklist

A correctly-implemented main menu should pass all of these:

- [ ] All three pages render with correct title logos and item lists driven from the JSON
- [ ] Background framing matches the `docs/ui/mockups/bgmap-*.png` references
- [ ] Left/right (and L/R shoulders) switch pages with the five-stage CSS zoom/pan transition; wraps at the ends
- [ ] Up/down moves the cursor within a page; wraps top/bottom
- [ ] The active item glows orange and pulses; idle items are white
- [ ] Z opens a centered Instructions modal with backdrop dimming the scene; Z again closes it
- [ ] Modal content updates as the cursor moves, even while hidden
- [ ] Smackdown Mall and Arena Viewer modal headings show without "Mode" (per the JSON's `title` field)
- [ ] A/Enter opens the highlighted item's `target`
- [ ] B/Escape closes the modal if open, otherwise backs out/exits the current menu system
- [ ] Switching pages while the modal is open closes the modal
- [ ] Commissioner includes Controls, and A/Enter opens the Controls mapping page
- [ ] Controls page lists N64 buttons, captures keyboard mappings, resets defaults, and exports JSON
- [ ] All chrome scales cleanly from 1280×720 up to 4K without artifacts
- [ ] No CSS class name collisions with the rest of the site
- [ ] Phase 1 background swap to Phase 2 Babylon scene requires no menu chrome changes
