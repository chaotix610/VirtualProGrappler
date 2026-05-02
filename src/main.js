import { SceneManager } from './renderer/SceneManager.js';
import { ArenaRenderer } from './renderer/ArenaRenderer.js';
import '@babylonjs/core/Helpers/sceneHelpers.js';

const arenaModules = import.meta.glob('../data/arenas/*.json', {
  eager: true,
  import: 'default',
});

const MENU_OPTIONS = [
  {
    id: 'arena-viewer',
    label: 'Arena Viewer',
    description: 'Preview every arena package loaded from the arena data files.',
  },
  {
    id: 'test-option-1',
    label: 'Test Option 1',
    description: 'Prototype a match setup flow with keyboard-driven rules and arena picks.',
  },
  {
    id: 'test-option-2',
    label: 'Test Option 2',
    description: 'Inspect arena package diagnostics, renderer state, and asset readiness.',
  },
];

const MATCH_SETUP_FIELDS = [
  {
    key: 'matchType',
    label: 'Match Type',
    options: ['Single', 'Tag', 'Triple Threat', 'Ladder'],
  },
  {
    key: 'playerMode',
    label: 'Player Mode',
    options: ['1P vs CPU', '1P vs 2P', 'Watch'],
  },
  {
    key: 'arenaId',
    label: 'Arena',
    options: [],
  },
  {
    key: 'rules',
    label: 'Rules',
    options: ['Normal', 'Hardcore', 'No DQ', 'Iron Man'],
  },
  {
    key: 'belt',
    label: 'Belt',
    options: ['Non Title', 'World Title', 'Intercontinental', 'Tag Titles'],
  },
];

const DIAGNOSTIC_PANELS = [
  {
    id: 'arena-files',
    label: 'Arena Files',
    getValue: () => `${availableArenas.length} loaded`,
    getDetails: () => [
      `JSON source: data/arenas`,
      `Available arenas: ${availableArenas.map((arena) => arena.displayName).join(', ')}`,
      'Arena list is populated from the current repo data files at startup.',
    ],
  },
  {
    id: 'renderer',
    label: 'Renderer',
    getValue: () => 'Babylon 9.x',
    getDetails: () => [
      'SceneManager boots the scene, camera, and environment lighting.',
      'ArenaRenderer assembles the ring plus modular arena parts from JSON.',
      `Preview framing target: ${getPreviewFrameTargetFromQuery()}`,
    ],
  },
  {
    id: 'asset-kit',
    label: 'Asset Kit',
    getValue: () => '4 core GLBs',
    getDetails: () => [
      'Ring: ring-standard.glb',
      'Floor: arena-floor.glb',
      'Barricade: barricade.glb',
      'Steps: ring-steps-positioned.glb',
    ],
  },
  {
    id: 'controls',
    label: 'Controls',
    getValue: () => 'Keyboard Ready',
    getDetails: () => [
      'Main Menu: Up / Down, Enter',
      'Arena Viewer: Enter to open list, Esc to back out',
      'Prototype screens: Up / Down to move, Left / Right to adjust',
    ],
  },
];

function getArenaIdFromQuery() {
  const params = new URLSearchParams(window.location.search);
  const arenaId = params.get('arena');

  if (!arenaId) {
    return 'raw';
  }

  return arenaId.trim() || 'raw';
}

function getPreviewFrameTargetFromQuery() {
  const params = new URLSearchParams(window.location.search);
  const frameTarget = params.get('frame');

  if (!frameTarget) {
    return 'ring';
  }

  return frameTarget.trim().toLowerCase() || 'ring';
}

function framePreviewCamera(camera, bounds) {
  const maxDimension = Math.max(bounds.size.x, bounds.size.y, bounds.size.z);
  const target = bounds.center.clone();

  target.y += bounds.size.y * 0.1;

  camera.setTarget(target);
  camera.radius = Math.max(maxDimension * 1.2, 12);
  camera.lowerRadiusLimit = Math.max(maxDimension * 0.35, 8);
  camera.upperRadiusLimit = Math.max(maxDimension * 3, camera.radius + 10);
}

function getAvailableArenas() {
  return Object.entries(arenaModules)
    .map(([path, data]) => {
      const id = path.split('/').pop()?.replace(/\.json$/i, '') ?? '';
      return {
        id,
        displayName: data.displayName ?? id,
      };
    })
    .filter((arena) => arena.id.length > 0)
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

function sanitizeArenaId(arenaId, arenas) {
  if (arenas.some((arena) => arena.id === arenaId)) {
    return arenaId;
  }

  return arenas[0]?.id ?? 'raw';
}

function updateQuery(paramsToSet) {
  const params = new URLSearchParams(window.location.search);

  for (const [key, value] of Object.entries(paramsToSet)) {
    if (value === null || value === undefined || value === '') {
      params.delete(key);
    } else {
      params.set(key, value);
    }
  }

  const query = params.toString();
  const nextUrl = query ? `${window.location.pathname}?${query}` : window.location.pathname;
  window.history.replaceState({}, '', nextUrl);
}

const previewFrameTarget = getPreviewFrameTargetFromQuery();
const availableArenas = getAvailableArenas();
const initialArenaId = sanitizeArenaId(getArenaIdFromQuery(), availableArenas);

const canvas = document.getElementById('vpg-canvas');
const app = document.getElementById('app');
const sceneManager = new SceneManager(canvas);
const arenaRenderer = new ArenaRenderer();

sceneManager.init();
window._scene = sceneManager.scene;
window._sceneManager = sceneManager;

sceneManager.scene.createDefaultEnvironment({
  createGround: false,
  createSkybox: false,
});

let loadToken = 0;

const state = {
  screen: 'menu',
  selectedMenuIndex: 0,
  arenaId: initialArenaId,
  matchSetupFieldIndex: 0,
  diagnosticPanelIndex: 0,
  matchSetup: {
    matchType: 'Single',
    playerMode: '1P vs CPU',
    arenaId: initialArenaId,
    rules: 'Normal',
    belt: 'Non Title',
  },
};

const elements = {
  menuButtons: [],
  arenaTrigger: null,
  arenaMenu: null,
  arenaOptions: [],
  arenaRoot: null,
  arenaTitle: null,
  arenaStatus: null,
  matchSetupRows: [],
  matchSetupValueNodes: new Map(),
  matchSetupSummary: null,
  diagnosticRows: [],
  diagnosticValueNodes: new Map(),
  diagnosticDetail: null,
};

function buildMainMenu() {
  const shell = document.createElement('section');
  shell.className = 'screen main-menu-screen';
  shell.dataset.screen = 'menu';

  const marquee = document.createElement('div');
  marquee.className = 'menu-marquee';

  const eyebrow = document.createElement('div');
  eyebrow.className = 'menu-eyebrow';
  eyebrow.textContent = 'Virtual Pro Grappler';

  const title = document.createElement('h1');
  title.className = 'menu-title';
  title.textContent = 'Main Menu';

  const subtitle = document.createElement('p');
  subtitle.className = 'menu-subtitle';
  subtitle.textContent = 'Choose a mode with the D-Pad and press Enter.';

  marquee.append(eyebrow, title, subtitle);

  const panel = document.createElement('div');
  panel.className = 'menu-panel';

  const list = document.createElement('div');
  list.className = 'menu-list';
  list.setAttribute('role', 'menu');
  list.setAttribute('aria-label', 'Main Menu');

  const detail = document.createElement('div');
  detail.className = 'menu-detail';

  const detailTitle = document.createElement('div');
  detailTitle.className = 'menu-detail-title';

  const detailText = document.createElement('p');
  detailText.className = 'menu-detail-text';

  const menuButtons = MENU_OPTIONS.map((option, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'menu-option';
    button.setAttribute('role', 'menuitem');
    button.dataset.optionId = option.id;
    button.innerHTML = `
      <span class="menu-option-index">${String(index + 1).padStart(2, '0')}</span>
      <span class="menu-option-label">${option.label}</span>
    `;

    button.addEventListener('click', () => {
      state.selectedMenuIndex = index;
      updateMainMenuSelection();
      openMenuOption(option.id);
    });

    list.append(button);
    return button;
  });

  elements.menuButtons = menuButtons;

  function updateMainMenuSelection() {
    menuButtons.forEach((button, index) => {
      const isSelected = index === state.selectedMenuIndex;
      button.dataset.selected = String(isSelected);
      if (isSelected) {
        button.focus();
      }
    });

    const selected = MENU_OPTIONS[state.selectedMenuIndex];
    detailTitle.textContent = selected.label;
    detailText.textContent = selected.description;
  }

  window.updateMainMenuSelection = updateMainMenuSelection;

  detail.append(detailTitle, detailText);
  panel.append(list, detail);
  shell.append(marquee, panel);

  const footer = document.createElement('div');
  footer.className = 'screen-footer';
  footer.textContent = 'Up / Down: Move   Enter: Confirm';
  shell.append(footer);

  app.append(shell);
  updateMainMenuSelection();
}

function buildArenaViewer() {
  const shell = document.createElement('section');
  shell.className = 'screen arena-viewer-screen';
  shell.dataset.screen = 'arena-viewer';

  const title = document.createElement('h1');
  title.className = 'viewer-title';
  title.textContent = 'Arena Viewer';

  const toolbar = document.createElement('div');
  toolbar.className = 'viewer-toolbar';

  const label = document.createElement('span');
  label.className = 'viewer-label';
  label.textContent = 'Arena';

  const dropdown = document.createElement('div');
  dropdown.className = 'arena-select';
  dropdown.dataset.open = 'false';

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'arena-select-trigger';
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');

  const triggerText = document.createElement('span');
  triggerText.className = 'arena-select-trigger-text';

  const triggerHint = document.createElement('span');
  triggerHint.className = 'arena-select-trigger-hint';
  triggerHint.textContent = 'Press Enter';

  trigger.append(triggerText, triggerHint);

  const menu = document.createElement('ul');
  menu.className = 'arena-select-menu';
  menu.setAttribute('role', 'listbox');
  menu.tabIndex = -1;
  menu.hidden = true;

  const status = document.createElement('div');
  status.className = 'viewer-status';

  function closeMenu() {
    dropdown.dataset.open = 'false';
    trigger.setAttribute('aria-expanded', 'false');
    menu.hidden = true;
  }

  function openMenu() {
    dropdown.dataset.open = 'true';
    trigger.setAttribute('aria-expanded', 'true');
    menu.hidden = false;
    const selected = menu.querySelector('[aria-selected="true"]');
    selected?.focus();
  }

  function toggleMenu() {
    if (dropdown.dataset.open === 'true') {
      closeMenu();
    } else {
      openMenu();
    }
  }

  trigger.addEventListener('click', () => toggleMenu());
  trigger.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      toggleMenu();
    }

    if (event.key === 'ArrowDown' && dropdown.dataset.open !== 'true') {
      event.preventDefault();
      openMenu();
    }
  });

  menu.addEventListener('keydown', (event) => {
    const items = elements.arenaOptions;
    const currentIndex = items.indexOf(document.activeElement);

    if (event.key === 'Escape') {
      event.preventDefault();
      closeMenu();
      trigger.focus();
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      const nextIndex = currentIndex < items.length - 1 ? currentIndex + 1 : 0;
      items[nextIndex]?.focus();
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      const prevIndex = currentIndex > 0 ? currentIndex - 1 : items.length - 1;
      items[prevIndex]?.focus();
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      document.activeElement?.click?.();
    }
  });

  for (const arena of availableArenas) {
    const option = document.createElement('li');
    option.className = 'arena-select-option';
    option.setAttribute('role', 'option');
    option.tabIndex = -1;
    option.dataset.arenaId = arena.id;
    option.textContent = arena.displayName;

    option.addEventListener('click', () => {
      closeMenu();
      loadArena(arena.id);
      trigger.focus();
    });

    menu.append(option);
    elements.arenaOptions.push(option);
  }

  document.addEventListener('click', (event) => {
    if (!dropdown.contains(event.target)) {
      closeMenu();
    }
  });

  dropdown.append(trigger, menu);
  toolbar.append(label, dropdown, status);
  shell.append(title, toolbar);

  const footer = document.createElement('div');
  footer.className = 'screen-footer';
  footer.textContent = 'Enter: Open Arena List   Esc: Back to Main Menu';
  shell.append(footer);

  app.append(shell);

  elements.arenaRoot = shell;
  elements.arenaTitle = triggerText;
  elements.arenaTrigger = trigger;
  elements.arenaMenu = menu;
  elements.arenaStatus = status;
}

function buildMatchSetupScreen() {
  const shell = document.createElement('section');
  shell.className = 'screen test-screen';
  shell.dataset.screen = 'test-option-1';

  const title = document.createElement('h1');
  title.className = 'viewer-title';
  title.textContent = 'Test Option 1';

  const layout = document.createElement('div');
  layout.className = 'test-layout';

  const card = document.createElement('div');
  card.className = 'test-card';

  const cardHeader = document.createElement('div');
  cardHeader.className = 'test-card-header';
  cardHeader.textContent = 'Match Setup Prototype';

  const list = document.createElement('div');
  list.className = 'test-list';

  for (const field of MATCH_SETUP_FIELDS) {
    const item = document.createElement('div');
    item.className = 'test-row';
    item.dataset.fieldKey = field.key;

    const label = document.createElement('span');
    label.className = 'test-row-label';
    label.textContent = field.label;

    const value = document.createElement('span');
    value.className = 'test-row-value';
    value.textContent = '';

    item.append(label, value);
    list.append(item);
    elements.matchSetupRows.push(item);
    elements.matchSetupValueNodes.set(field.key, value);
  }

  card.append(cardHeader, list);

  const summary = document.createElement('div');
  summary.className = 'test-card';

  const summaryHeader = document.createElement('div');
  summaryHeader.className = 'test-card-header';
  summaryHeader.textContent = 'Current Card';

  const summaryText = document.createElement('div');
  summaryText.className = 'test-summary';

  summary.append(summaryHeader, summaryText);
  layout.append(card, summary);
  shell.append(title, layout);

  const footer = document.createElement('div');
  footer.className = 'screen-footer';
  footer.textContent = 'Up / Down: Select   Left / Right: Change   Esc: Back';
  shell.append(footer);

  app.append(shell);
  elements.matchSetupSummary = summaryText;
}

function buildDiagnosticsScreen() {
  const shell = document.createElement('section');
  shell.className = 'screen test-screen';
  shell.dataset.screen = 'test-option-2';

  const title = document.createElement('h1');
  title.className = 'viewer-title';
  title.textContent = 'Test Option 2';

  const layout = document.createElement('div');
  layout.className = 'test-layout';

  const card = document.createElement('div');
  card.className = 'test-card';

  const cardHeader = document.createElement('div');
  cardHeader.className = 'test-card-header';
  cardHeader.textContent = 'Diagnostics';

  const list = document.createElement('div');
  list.className = 'test-list';

  for (const panel of DIAGNOSTIC_PANELS) {
    const item = document.createElement('div');
    item.className = 'test-row';
    item.dataset.panelId = panel.id;

    const label = document.createElement('span');
    label.className = 'test-row-label';
    label.textContent = panel.label;

    const value = document.createElement('span');
    value.className = 'test-row-value';
    value.textContent = '';

    item.append(label, value);
    list.append(item);
    elements.diagnosticRows.push(item);
    elements.diagnosticValueNodes.set(panel.id, value);
  }

  card.append(cardHeader, list);

  const detail = document.createElement('div');
  detail.className = 'test-card';

  const detailHeader = document.createElement('div');
  detailHeader.className = 'test-card-header';
  detailHeader.textContent = 'Detail';

  const detailBody = document.createElement('div');
  detailBody.className = 'test-summary';

  detail.append(detailHeader, detailBody);
  layout.append(card, detail);
  shell.append(title, layout);

  const footer = document.createElement('div');
  footer.className = 'screen-footer';
  footer.textContent = 'Up / Down: Select   Enter: Refresh Detail   Esc: Back';
  shell.append(footer);

  app.append(shell);
  elements.diagnosticDetail = detailBody;
}

function updateArenaViewerSelection() {
  const currentArena = availableArenas.find((arena) => arena.id === state.arenaId);
  elements.arenaTitle.textContent = currentArena?.displayName ?? state.arenaId;

  elements.arenaOptions.forEach((option) => {
    const isSelected = option.dataset.arenaId === state.arenaId;
    option.setAttribute('aria-selected', String(isSelected));
  });
}

function updateMatchSetupScreen() {
  for (const field of MATCH_SETUP_FIELDS) {
    const valueNode = elements.matchSetupValueNodes.get(field.key);
    let value = state.matchSetup[field.key];

    if (field.key === 'arenaId') {
      value = availableArenas.find((arena) => arena.id === value)?.displayName ?? value;
    }

    if (valueNode) {
      valueNode.textContent = value;
    }
  }

  elements.matchSetupRows.forEach((row, index) => {
    row.dataset.selected = String(index === state.matchSetupFieldIndex);
  });

  const arenaName = availableArenas.find((arena) => arena.id === state.matchSetup.arenaId)?.displayName
    ?? state.matchSetup.arenaId;
  elements.matchSetupSummary.textContent =
    `${state.matchSetup.matchType} | ${state.matchSetup.playerMode} | ${arenaName} | ` +
    `${state.matchSetup.rules} | ${state.matchSetup.belt}`;
}

function updateDiagnosticsScreen() {
  DIAGNOSTIC_PANELS.forEach((panel) => {
    const valueNode = elements.diagnosticValueNodes.get(panel.id);
    if (valueNode) {
      valueNode.textContent = panel.getValue();
    }
  });

  elements.diagnosticRows.forEach((row, index) => {
    row.dataset.selected = String(index === state.diagnosticPanelIndex);
  });

  const panel = DIAGNOSTIC_PANELS[state.diagnosticPanelIndex];
  elements.diagnosticDetail.innerHTML = panel.getDetails()
    .map((line) => `<div class="test-summary-line">${line}</div>`)
    .join('');
}

function renderScreenVisibility() {
  for (const screen of app.querySelectorAll('.screen')) {
    const isActive = screen.dataset.screen === state.screen;
    screen.dataset.active = String(isActive);
  }

  canvas.dataset.dimmed = state.screen === 'arena-viewer' ? 'false' : 'true';
}

function focusActiveScreen() {
  if (state.screen === 'menu') {
    window.updateMainMenuSelection?.();
    return;
  }

  if (state.screen === 'arena-viewer') {
    elements.arenaTrigger?.focus();
    return;
  }

  if (state.screen === 'test-option-1') {
    updateMatchSetupScreen();
    return;
  }

  if (state.screen === 'test-option-2') {
    updateDiagnosticsScreen();
  }
}

function showScreen(screenId) {
  state.screen = screenId;
  renderScreenVisibility();
  focusActiveScreen();
}

function openMenuOption(optionId) {
  if (optionId === 'arena-viewer') {
    showScreen('arena-viewer');
    loadArena(state.arenaId);
    return;
  }

  if (optionId === 'test-option-1') {
    arenaRenderer.dispose();
    showScreen('test-option-1');
    updateMatchSetupScreen();
    return;
  }

  if (optionId === 'test-option-2') {
    arenaRenderer.dispose();
    showScreen('test-option-2');
    updateDiagnosticsScreen();
  }
}

function cycleMatchSetupField(direction) {
  const field = MATCH_SETUP_FIELDS[state.matchSetupFieldIndex];
  const currentValue = state.matchSetup[field.key];
  const options = field.key === 'arenaId'
    ? availableArenas.map((arena) => arena.id)
    : field.options;
  const currentIndex = options.indexOf(currentValue);
  const nextIndex = (currentIndex + direction + options.length) % options.length;
  state.matchSetup[field.key] = options[nextIndex];
  updateMatchSetupScreen();
}

async function loadArena(arenaId) {
  const token = ++loadToken;
  state.arenaId = sanitizeArenaId(arenaId, availableArenas);
  updateArenaViewerSelection();
  arenaRenderer.dispose();
  elements.arenaStatus.textContent = 'Loading...';
  updateQuery({ arena: state.arenaId });

  try {
    await arenaRenderer.init(sceneManager.scene, state.arenaId);

    if (token !== loadToken) {
      return;
    }

    const previewBounds = previewFrameTarget === 'arena'
      ? (arenaRenderer.getArenaBounds() ?? arenaRenderer.getRingBounds())
      : (arenaRenderer.getRingBounds() ?? arenaRenderer.getArenaBounds());

    if (previewBounds) {
      framePreviewCamera(sceneManager.camera, previewBounds);
    }

    elements.arenaStatus.textContent = `${availableArenas.length} arenas online`;
    console.log(`ArenaRenderer: loaded arena "${state.arenaId}" successfully`);
  } catch (err) {
    elements.arenaStatus.textContent = 'Load failed';
    console.error(`ArenaRenderer: failed to load arena "${state.arenaId}"`, err);
  }
}

function handleGlobalKeyboard(event) {
  if (state.screen === 'menu') {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      state.selectedMenuIndex = (state.selectedMenuIndex + 1) % MENU_OPTIONS.length;
      window.updateMainMenuSelection?.();
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      state.selectedMenuIndex = (state.selectedMenuIndex - 1 + MENU_OPTIONS.length) % MENU_OPTIONS.length;
      window.updateMainMenuSelection?.();
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openMenuOption(MENU_OPTIONS[state.selectedMenuIndex].id);
    }

    return;
  }

  if (state.screen === 'test-option-1') {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      state.matchSetupFieldIndex = (state.matchSetupFieldIndex + 1) % MATCH_SETUP_FIELDS.length;
      updateMatchSetupScreen();
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      state.matchSetupFieldIndex = (state.matchSetupFieldIndex - 1 + MATCH_SETUP_FIELDS.length)
        % MATCH_SETUP_FIELDS.length;
      updateMatchSetupScreen();
      return;
    }

    if (event.key === 'ArrowRight' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      cycleMatchSetupField(1);
      return;
    }

    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      cycleMatchSetupField(-1);
      return;
    }
  }

  if (state.screen === 'test-option-2') {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      state.diagnosticPanelIndex = (state.diagnosticPanelIndex + 1) % DIAGNOSTIC_PANELS.length;
      updateDiagnosticsScreen();
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      state.diagnosticPanelIndex = (state.diagnosticPanelIndex - 1 + DIAGNOSTIC_PANELS.length)
        % DIAGNOSTIC_PANELS.length;
      updateDiagnosticsScreen();
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      updateDiagnosticsScreen();
      return;
    }
  }

  if (event.key === 'Escape') {
    event.preventDefault();
    if (state.screen === 'arena-viewer') {
      const dropdown = elements.arenaRoot?.querySelector('.arena-select');
      const arenaMenuIsOpen = dropdown?.dataset.open === 'true';

      if (arenaMenuIsOpen) {
        dropdown.dataset.open = 'false';
        elements.arenaMenu.hidden = true;
        elements.arenaTrigger?.setAttribute('aria-expanded', 'false');
        elements.arenaTrigger?.focus();
        return;
      }
    }

    arenaRenderer.dispose();
    showScreen('menu');
  }
}

buildMainMenu();
buildArenaViewer();
buildMatchSetupScreen();
buildDiagnosticsScreen();

updateArenaViewerSelection();
updateMatchSetupScreen();
updateDiagnosticsScreen();
showScreen('menu');
document.addEventListener('keydown', handleGlobalKeyboard);
sceneManager.run();
