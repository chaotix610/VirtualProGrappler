import { SceneManager } from './renderer/SceneManager.js';
import { ArenaRenderer } from './renderer/ArenaRenderer.js';
import '@babylonjs/core/Helpers/sceneHelpers.js';
import mainMenuData from '../data/ui/main-menu.json';

const arenaModules = import.meta.glob('../data/arenas/*.json', {
  eager: true,
  import: 'default',
});

const PAGE_KEYS = ['multiPlay', 'singlePlay', 'commissioner'];
const DEFAULT_CONTROL_MAPPINGS = {
  version: '1.0.0',
  profile: 'default',
  bindings: {
    dpadUp: ['ArrowUp'],
    dpadDown: ['ArrowDown'],
    dpadLeft: ['ArrowLeft'],
    dpadRight: ['ArrowRight'],
    a: ['Enter'],
    b: ['Escape'],
    z: ['KeyZ'],
    l: ['KeyQ'],
    r: ['KeyE'],
    start: ['Space'],
    cUp: ['KeyI'],
    cDown: ['KeyK'],
    cLeft: ['KeyJ'],
    cRight: ['KeyL'],
  },
};

const CONTROL_ROWS = [
  { id: 'dpadUp', label: 'D-Pad Up' },
  { id: 'dpadDown', label: 'D-Pad Down' },
  { id: 'dpadLeft', label: 'D-Pad Left' },
  { id: 'dpadRight', label: 'D-Pad Right' },
  { id: 'a', label: 'A' },
  { id: 'b', label: 'B' },
  { id: 'z', label: 'Z', image: 'assets/textures/ui/button_z.png' },
  { id: 'l', label: 'L', image: 'assets/textures/ui/button_l.png' },
  { id: 'r', label: 'R', image: 'assets/textures/ui/button_r.png' },
  { id: 'start', label: 'Start' },
  { id: 'cUp', label: 'C-Up' },
  { id: 'cDown', label: 'C-Down' },
  { id: 'cLeft', label: 'C-Left' },
  { id: 'cRight', label: 'C-Right' },
];

const CONTROL_ACTIONS = [
  { id: 'reset', label: 'Reset Defaults' },
  { id: 'export', label: 'Export JSON' },
  { id: 'back', label: 'Back' },
];

const LOCAL_STORAGE_KEY = 'vpg-control-mappings';
const PAGE_TRANSITION_MS = 1350;
const sleep = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

const app = document.getElementById('app');
const canvas = document.getElementById('vpg-canvas');
const availableArenas = getAvailableArenas();
const previewFrameTarget = getPreviewFrameTargetFromQuery();
const initialArenaId = sanitizeArenaId(getArenaIdFromQuery(), availableArenas);
const sceneManager = new SceneManager(canvas);
const arenaRenderer = new ArenaRenderer();

sceneManager.init();
window._scene = sceneManager.scene;
window._sceneManager = sceneManager;
sceneManager.scene.createDefaultEnvironment({
  createGround: false,
  createSkybox: false,
});
sceneManager.run();

let loadToken = 0;

const state = {
  screen: 'main-menu',
  pageIndex: 0,
  arenaIndex: Math.max(availableArenas.findIndex((arena) => arena.id === initialArenaId), 0),
  arenaId: initialArenaId,
  itemIndices: Object.fromEntries(PAGE_KEYS.map((pageKey) => [pageKey, 0])),
  instructionsOpen: false,
  transitionInProgress: false,
  queuedDirection: 0,
  controlsIndex: 0,
  listeningControlId: null,
  pendingBinding: null,
  confirmIndex: 0,
  mappings: loadControlMappings(),
};

const elements = {
  stage: null,
  panels: new Map(),
  menuItems: new Map(),
  backdrop: null,
  modal: null,
  modalTitle: null,
  modalBody: null,
  routeStatus: null,
  controlsRows: new Map(),
  controlsPage: null,
  confirmDialog: null,
  confirmOptions: [],
  arenaPage: null,
  arenaGrid: null,
  arenaStatus: null,
  arenaCards: [],
  arenas: [],
};

function getArenaIdFromQuery() {
  const params = new URLSearchParams(window.location.search);
  const arenaId = params.get('arena');
  return arenaId?.trim() || 'raw';
}

function getPreviewFrameTargetFromQuery() {
  const params = new URLSearchParams(window.location.search);
  return params.get('frame')?.trim().toLowerCase() || 'ring';
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

function framePreviewCamera(camera, bounds) {
  const maxDimension = Math.max(bounds.size.x, bounds.size.y, bounds.size.z);
  const target = bounds.center.clone();

  target.y += bounds.size.y * 0.1;
  camera.setTarget(target);
  camera.radius = Math.max(maxDimension * 1.2, 12);
  camera.lowerRadiusLimit = Math.max(maxDimension * 0.35, 8);
  camera.upperRadiusLimit = Math.max(maxDimension * 3, camera.radius + 10);
}

function toDomPageId(page) {
  return page.id.replaceAll('_', '-');
}

function getPageKey() {
  return PAGE_KEYS[state.pageIndex];
}

function getPage(pageKey = getPageKey()) {
  return mainMenuData.pages[pageKey];
}

function getActiveItem(pageKey = getPageKey()) {
  const page = getPage(pageKey);
  return page.menuItems[state.itemIndices[pageKey] ?? 0];
}

function normalizeKeyCode(event) {
  return event.code || event.key;
}

function cloneMappings(mappings) {
  return JSON.parse(JSON.stringify(mappings));
}

function loadControlMappings() {
  try {
    const stored = window.localStorage.getItem(LOCAL_STORAGE_KEY);
    if (stored) {
      return { ...cloneMappings(DEFAULT_CONTROL_MAPPINGS), ...JSON.parse(stored) };
    }
  } catch (error) {
    console.warn('Unable to load stored control mappings.', error);
  }

  return cloneMappings(DEFAULT_CONTROL_MAPPINGS);
}

function saveControlMappings() {
  window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(state.mappings));
}

function matchesBinding(event, actionId) {
  const bindings = state.mappings.bindings[actionId] ?? [];
  return bindings.includes(normalizeKeyCode(event)) || bindings.includes(event.key);
}

function getInput(event) {
  if (matchesBinding(event, 'dpadUp')) return 'up';
  if (matchesBinding(event, 'dpadDown')) return 'down';
  if (matchesBinding(event, 'dpadLeft') || matchesBinding(event, 'l')) return 'left';
  if (matchesBinding(event, 'dpadRight') || matchesBinding(event, 'r')) return 'right';
  if (matchesBinding(event, 'a')) return 'a';
  if (matchesBinding(event, 'b')) return 'b';
  if (matchesBinding(event, 'z')) return 'z';
  if (matchesBinding(event, 'start')) return 'start';
  return null;
}

function buildApp() {
  app.textContent = '';

  elements.stage = document.createElement('main');
  elements.stage.className = 'vpg-stage';
  elements.stage.dataset.page = toDomPageId(getPage());
  elements.stage.dataset.zoom = 'in';
  elements.stage.dataset.transition = 'idle';

  const background = document.createElement('div');
  background.className = 'vpg-menu-background';

  const chrome = document.createElement('div');
  chrome.className = 'vpg-menu-chrome';

  for (const pageKey of PAGE_KEYS) {
    const panel = buildMenuPanel(pageKey);
    chrome.append(panel);
    elements.panels.set(pageKey, panel);
  }

  elements.routeStatus = document.createElement('div');
  elements.routeStatus.className = 'vpg-route-status';
  elements.routeStatus.setAttribute('aria-live', 'polite');

  elements.stage.append(background, chrome, elements.routeStatus);
  app.append(elements.stage);

  buildInstructionsModal();
  buildControlsPage();
  buildArenaPage();
  updateMenu();
  updateInstructionsContent();
}

function buildMenuPanel(pageKey) {
  const page = getPage(pageKey);
  const panel = document.createElement('section');
  panel.className = 'vpg-menu-panel';
  panel.dataset.page = toDomPageId(page);
  panel.dataset.active = 'false';

  const frame = document.createElement('div');
  frame.className = 'vpg-menu-frame';

  const titlebar = document.createElement('div');
  titlebar.className = 'vpg-menu-titlebar';

  const titleLogo = document.createElement('img');
  titleLogo.className = 'vpg-menu-title-logo';
  titleLogo.src = page.headingImage;
  titleLogo.alt = page.displayName;
  titlebar.append(titleLogo);

  const list = document.createElement('ul');
  list.className = 'vpg-menu-items';
  list.setAttribute('role', 'menu');
  list.setAttribute('aria-label', page.displayName);

  const itemNodes = page.menuItems.map((item, index) => {
    const node = document.createElement('li');
    node.className = 'vpg-menu-item';
    node.dataset.id = item.id;
    node.dataset.state = 'idle';
    node.setAttribute('role', 'menuitem');
    node.tabIndex = 0;
    node.textContent = item.displayName;
    node.addEventListener('click', () => {
      state.pageIndex = PAGE_KEYS.indexOf(pageKey);
      state.itemIndices[pageKey] = index;
      updateMenu();
      openActiveTarget();
    });
    list.append(node);
    return node;
  });

  elements.menuItems.set(pageKey, itemNodes);
  frame.append(titlebar, list);
  panel.append(frame);
  return panel;
}

function buildInstructionsModal() {
  elements.backdrop = document.createElement('div');
  elements.backdrop.className = 'vpg-instructions-backdrop';
  elements.backdrop.dataset.state = 'hidden';

  elements.modal = document.createElement('section');
  elements.modal.className = 'vpg-instructions-modal';
  elements.modal.dataset.state = 'hidden';
  elements.modal.setAttribute('role', 'dialog');
  elements.modal.setAttribute('aria-modal', 'true');

  elements.modalTitle = document.createElement('h3');
  elements.modalTitle.className = 'vpg-instructions-title';

  elements.modalBody = document.createElement('div');
  elements.modalBody.className = 'vpg-instructions-body';

  elements.modal.append(elements.modalTitle, elements.modalBody);
  document.body.append(elements.backdrop, elements.modal);
}

function buildControlsPage() {
  elements.controlsPage = document.createElement('section');
  elements.controlsPage.className = 'vpg-subscreen vpg-controls-page';
  elements.controlsPage.dataset.active = 'false';

  const titlebar = document.createElement('div');
  titlebar.className = 'vpg-menu-titlebar vpg-text-titlebar';
  const title = document.createElement('h1');
  title.className = 'vpg-text-title';
  title.textContent = 'Controls';
  titlebar.append(title);

  const panel = document.createElement('div');
  panel.className = 'vpg-subscreen-panel';

  const rows = document.createElement('div');
  rows.className = 'vpg-controls-rows';

  for (const row of CONTROL_ROWS) {
    const node = document.createElement('button');
    node.type = 'button';
    node.className = 'vpg-control-row';
    node.dataset.id = row.id;
    node.addEventListener('click', () => startListening(row.id));

    const label = document.createElement('span');
    label.className = 'vpg-control-label';
    if (row.image) {
      const image = document.createElement('img');
      image.className = 'vpg-control-button-art';
      image.src = row.image;
      image.alt = row.label;
      label.append(image);
    } else {
      label.textContent = row.label;
    }

    const value = document.createElement('span');
    value.className = 'vpg-control-binding';

    node.append(label, value);
    rows.append(node);
    elements.controlsRows.set(row.id, node);
  }

  for (const action of CONTROL_ACTIONS) {
    const node = document.createElement('button');
    node.type = 'button';
    node.className = 'vpg-control-row vpg-control-action';
    node.dataset.id = action.id;
    node.textContent = action.label;
    node.addEventListener('click', () => runControlAction(action.id));
    rows.append(node);
    elements.controlsRows.set(action.id, node);
  }

  panel.append(rows);
  elements.controlsPage.append(titlebar, panel);
  app.append(elements.controlsPage);

  buildConfirmDialog();
}

function buildConfirmDialog() {
  elements.confirmDialog = document.createElement('section');
  elements.confirmDialog.className = 'vpg-confirm-dialog';
  elements.confirmDialog.dataset.state = 'hidden';
  elements.confirmDialog.setAttribute('role', 'dialog');
  elements.confirmDialog.setAttribute('aria-modal', 'true');

  const message = document.createElement('p');
  message.textContent = 'Replace existing binding?';

  const actions = document.createElement('div');
  actions.className = 'vpg-confirm-actions';

  for (const label of ['Yes', 'No']) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'vpg-confirm-option';
    button.textContent = label;
    button.addEventListener('click', () => resolveBindingConflict(label === 'Yes'));
    actions.append(button);
    elements.confirmOptions.push(button);
  }

  elements.confirmDialog.append(message, actions);
  document.body.append(elements.confirmDialog);
}

function buildArenaPage() {
  elements.arenaPage = document.createElement('section');
  elements.arenaPage.className = 'vpg-subscreen vpg-arena-page';
  elements.arenaPage.dataset.active = 'false';

  const titlebar = document.createElement('div');
  titlebar.className = 'vpg-menu-titlebar vpg-text-titlebar';
  const title = document.createElement('h1');
  title.className = 'vpg-text-title';
  title.textContent = 'Arena Viewer';
  elements.arenaStatus = document.createElement('div');
  elements.arenaStatus.className = 'vpg-arena-status';
  titlebar.append(title, elements.arenaStatus);

  elements.arenaGrid = document.createElement('div');
  elements.arenaGrid.className = 'vpg-arena-grid';

  elements.arenas = availableArenas;

  for (const [index, arena] of elements.arenas.entries()) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'vpg-arena-card';
    card.dataset.index = String(index);
    card.addEventListener('click', () => {
      state.arenaIndex = index;
      updateArenaPage();
      loadArena(arena.id);
    });

    if (arena.previewImage) {
      const image = document.createElement('img');
      image.src = arena.previewImage;
      image.alt = arena.displayName;
      card.append(image);
    }

    const label = document.createElement('h2');
    label.textContent = arena.displayName;
    card.append(label);
    elements.arenaGrid.append(card);
    elements.arenaCards.push(card);
  }

  const backCard = document.createElement('button');
  backCard.type = 'button';
  backCard.className = 'vpg-arena-card vpg-arena-back-card';
  backCard.dataset.index = String(elements.arenas.length);
  backCard.innerHTML = '<h2>Back</h2>';
  backCard.addEventListener('click', () => showScreen('main-menu'));
  elements.arenaGrid.append(backCard);
  elements.arenaCards.push(backCard);

  elements.arenaPage.append(titlebar, elements.arenaGrid);
  app.append(elements.arenaPage);
}

function getAvailableArenas() {
  return Object.entries(arenaModules)
    .map(([path, data]) => ({
      id: path.split('/').pop()?.replace(/\.json$/i, '') ?? data.id,
      displayName: data.displayName ?? data.id,
      previewImage: data.previewImage,
    }))
    .filter((arena) => arena.id && arena.displayName)
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

function updateMenu() {
  const activePageKey = getPageKey();
  const activePage = getPage(activePageKey);
  elements.stage.dataset.page = toDomPageId(activePage);

  for (const pageKey of PAGE_KEYS) {
    const panel = elements.panels.get(pageKey);
    panel.dataset.active = String(pageKey === activePageKey && state.screen === 'main-menu');

    const selectedIndex = state.itemIndices[pageKey] ?? 0;
    for (const [index, item] of (elements.menuItems.get(pageKey) ?? []).entries()) {
      item.dataset.state = index === selectedIndex ? 'active' : 'idle';
      item.tabIndex = pageKey === activePageKey && index === selectedIndex ? 0 : -1;
    }
  }

  updateInstructionsContent();
}

function updateInstructionsContent() {
  const item = getActiveItem();
  elements.modalTitle.textContent = item.instructions.title;
  elements.modalBody.textContent = '';

  for (const block of item.instructions.blocks) {
    if (block.type === 'paragraph') {
      const paragraph = document.createElement('p');
      paragraph.textContent = block.text;
      elements.modalBody.append(paragraph);
    }

    if (block.type === 'definitionList') {
      const list = document.createElement('dl');
      for (const entry of block.items) {
        const term = document.createElement('dt');
        term.textContent = entry.term;
        const definition = document.createElement('dd');
        definition.textContent = entry.definition;
        list.append(term, definition);
      }
      elements.modalBody.append(list);
    }
  }
}

function setInstructionsOpen(isOpen) {
  state.instructionsOpen = isOpen;
  const modalState = isOpen ? 'visible' : 'hidden';
  elements.backdrop.dataset.state = modalState;
  elements.modal.dataset.state = modalState;
}

async function switchPage(direction) {
  if (state.transitionInProgress) {
    state.queuedDirection = direction;
    return;
  }

  state.transitionInProgress = true;
  setInstructionsOpen(false);
  elements.stage.dataset.transition = 'hiding';
  for (const panel of elements.panels.values()) panel.dataset.active = 'false';
  await sleep(150);

  elements.stage.dataset.zoom = 'out';
  elements.stage.dataset.transition = 'zoom-out';
  await sleep(400);

  state.pageIndex = (state.pageIndex + direction + PAGE_KEYS.length) % PAGE_KEYS.length;
  elements.stage.dataset.page = toDomPageId(getPage());
  elements.stage.dataset.transition = 'hold';
  await sleep(250);

  elements.stage.dataset.zoom = 'in';
  elements.stage.dataset.transition = 'zoom-in';
  await sleep(400);

  elements.stage.dataset.transition = 'showing';
  updateMenu();
  await sleep(150);

  elements.stage.dataset.transition = 'idle';
  state.transitionInProgress = false;

  const queuedDirection = state.queuedDirection;
  state.queuedDirection = 0;
  if (queuedDirection) {
    switchPage(queuedDirection);
  }
}

function moveCursor(direction) {
  const pageKey = getPageKey();
  const page = getPage(pageKey);
  const currentIndex = state.itemIndices[pageKey] ?? 0;
  state.itemIndices[pageKey] = (currentIndex + direction + page.menuItems.length) % page.menuItems.length;
  updateMenu();
}

function openActiveTarget() {
  const item = getActiveItem();
  setInstructionsOpen(false);

  if (item.target === 'commissioner.controls') {
    showScreen('controls');
    return;
  }

  if (item.target === 'commissioner.arena_viewer') {
    showScreen('arena-viewer');
    return;
  }

  elements.routeStatus.textContent = `Opened ${item.target}`;
  elements.routeStatus.dataset.state = 'visible';
  window.setTimeout(() => {
    elements.routeStatus.dataset.state = 'hidden';
  }, 1200);
}

function showScreen(screen) {
  const previousScreen = state.screen;
  state.screen = screen;
  const isMainMenu = screen === 'main-menu';
  elements.stage.dataset.active = String(isMainMenu);
  elements.controlsPage.dataset.active = String(screen === 'controls');
  elements.arenaPage.dataset.active = String(screen === 'arena-viewer');
  canvas.dataset.active = String(screen === 'arena-viewer');

  if (screen === 'arena-viewer') {
    loadArena(state.arenaId);
  } else if (previousScreen === 'arena-viewer') {
    loadToken += 1;
    arenaRenderer.dispose();
  }

  setInstructionsOpen(false);
  updateMenu();
  updateControlsPage();
  updateArenaPage();
}

function updateArenaPage() {
  for (const [index, card] of elements.arenaCards.entries()) {
    const isActive = index === state.arenaIndex;
    const isLoadedArena = index < elements.arenas.length && elements.arenas[index].id === state.arenaId;
    card.dataset.state = isActive ? 'active' : 'idle';
    card.dataset.loaded = String(isLoadedArena);
    card.tabIndex = isActive ? 0 : -1;
  }

  const currentArena = elements.arenas.find((arena) => arena.id === state.arenaId);
  if (elements.arenaStatus) {
    elements.arenaStatus.textContent = currentArena ? `${currentArena.displayName} loaded` : '';
  }
}

async function loadArena(arenaId) {
  const token = ++loadToken;
  state.arenaId = sanitizeArenaId(arenaId, availableArenas);
  const arena = availableArenas.find((candidate) => candidate.id === state.arenaId);

  updateArenaPage();
  updateQuery({ arena: state.arenaId });
  arenaRenderer.dispose();

  if (elements.arenaStatus) {
    elements.arenaStatus.textContent = `Loading ${arena?.displayName ?? state.arenaId}...`;
  }

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

    updateArenaPage();
  } catch (error) {
    if (elements.arenaStatus) {
      elements.arenaStatus.textContent = 'Load failed';
    }
    console.error(`ArenaRenderer: failed to load arena "${state.arenaId}"`, error);
  }
}

function updateControlsPage() {
  const allRows = [...CONTROL_ROWS, ...CONTROL_ACTIONS];
  for (const [index, row] of allRows.entries()) {
    const node = elements.controlsRows.get(row.id);
    if (!node) continue;

    node.dataset.state = index === state.controlsIndex ? 'active' : 'idle';
    node.dataset.listening = String(state.listeningControlId === row.id);

    if (state.mappings.bindings[row.id]) {
      node.querySelector('.vpg-control-binding').textContent =
        state.listeningControlId === row.id ? 'Press a key...' : state.mappings.bindings[row.id].join(', ');
    }
  }
}

function moveControlsCursor(direction) {
  const rowCount = CONTROL_ROWS.length + CONTROL_ACTIONS.length;
  state.controlsIndex = (state.controlsIndex + direction + rowCount) % rowCount;
  updateControlsPage();
}

function activateControlRow() {
  const allRows = [...CONTROL_ROWS, ...CONTROL_ACTIONS];
  const row = allRows[state.controlsIndex];
  if (state.mappings.bindings[row.id]) {
    startListening(row.id);
  } else {
    runControlAction(row.id);
  }
}

function startListening(controlId) {
  state.listeningControlId = controlId;
  updateControlsPage();
}

function setBinding(controlId, keyCode) {
  state.mappings.bindings[controlId] = [keyCode];
  state.listeningControlId = null;
  state.pendingBinding = null;
  saveControlMappings();
  updateControlsPage();
}

function handleNewBinding(event) {
  if (event.key === 'Escape') {
    state.listeningControlId = null;
    updateControlsPage();
    return;
  }

  const keyCode = normalizeKeyCode(event);
  const conflictId = Object.entries(state.mappings.bindings)
    .find(([id, bindings]) => id !== state.listeningControlId && bindings.includes(keyCode))?.[0];

  if (!conflictId) {
    setBinding(state.listeningControlId, keyCode);
    return;
  }

  state.pendingBinding = { controlId: state.listeningControlId, conflictId, keyCode };
  state.confirmIndex = 1;
  elements.confirmDialog.dataset.state = 'visible';
  updateConfirmDialog();
}

function updateConfirmDialog() {
  elements.confirmOptions.forEach((option, index) => {
    option.dataset.state = index === state.confirmIndex ? 'active' : 'idle';
  });
}

function resolveBindingConflict(shouldReplace) {
  elements.confirmDialog.dataset.state = 'hidden';

  if (!shouldReplace || !state.pendingBinding) {
    state.pendingBinding = null;
    updateControlsPage();
    return;
  }

  const { controlId, conflictId, keyCode } = state.pendingBinding;
  state.mappings.bindings[conflictId] = state.mappings.bindings[conflictId].filter((binding) => binding !== keyCode);
  setBinding(controlId, keyCode);
}

function runControlAction(actionId) {
  if (actionId === 'reset') {
    state.mappings = cloneMappings(DEFAULT_CONTROL_MAPPINGS);
    saveControlMappings();
    updateControlsPage();
    return;
  }

  if (actionId === 'export') {
    const blob = new Blob([`${JSON.stringify(state.mappings, null, 2)}\n`], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'control-mappings.json';
    anchor.click();
    URL.revokeObjectURL(url);
    return;
  }

  if (actionId === 'back') {
    showScreen('main-menu');
  }
}

function handleMainMenuInput(input, event) {
  if (state.transitionInProgress && (input === 'left' || input === 'right')) {
    event.preventDefault();
    state.queuedDirection = input === 'left' ? -1 : 1;
    return;
  }

  if (state.transitionInProgress) {
    return;
  }

  if (input === 'left' || input === 'right') {
    event.preventDefault();
    switchPage(input === 'left' ? -1 : 1);
    return;
  }

  if (input === 'up' || input === 'down') {
    event.preventDefault();
    moveCursor(input === 'up' ? -1 : 1);
    return;
  }

  if (input === 'z') {
    event.preventDefault();
    setInstructionsOpen(!state.instructionsOpen);
    return;
  }

  if (input === 'a') {
    event.preventDefault();
    if (!state.instructionsOpen) openActiveTarget();
    return;
  }

  if (input === 'b') {
    event.preventDefault();
    setInstructionsOpen(false);
  }
}

function handleControlsInput(input, event) {
  if (elements.confirmDialog.dataset.state === 'visible') {
    if (input === 'left' || input === 'right') {
      event.preventDefault();
      state.confirmIndex = state.confirmIndex === 0 ? 1 : 0;
      updateConfirmDialog();
      return;
    }

    if (input === 'a') {
      event.preventDefault();
      resolveBindingConflict(state.confirmIndex === 0);
      return;
    }

    if (input === 'b') {
      event.preventDefault();
      resolveBindingConflict(false);
    }
    return;
  }

  if (state.listeningControlId) {
    event.preventDefault();
    handleNewBinding(event);
    return;
  }

  if (input === 'up' || input === 'down') {
    event.preventDefault();
    moveControlsCursor(input === 'up' ? -1 : 1);
    return;
  }

  if (input === 'a') {
    event.preventDefault();
    activateControlRow();
    return;
  }

  if (input === 'b') {
    event.preventDefault();
    showScreen('main-menu');
  }
}

function handleArenaViewerInput(input, event) {
  const columnCount = getArenaColumnCount();
  const itemCount = elements.arenaCards.length;

  if (input === 'left' || input === 'right') {
    event.preventDefault();
    const direction = input === 'left' ? -1 : 1;
    state.arenaIndex = (state.arenaIndex + direction + itemCount) % itemCount;
    updateArenaPage();
    return;
  }

  if (input === 'up' || input === 'down') {
    event.preventDefault();
    const direction = input === 'up' ? -columnCount : columnCount;
    state.arenaIndex = (state.arenaIndex + direction + itemCount) % itemCount;
    updateArenaPage();
    return;
  }

  if (input === 'a') {
    event.preventDefault();
    if (state.arenaIndex === elements.arenas.length) {
      showScreen('main-menu');
      return;
    }

    loadArena(elements.arenas[state.arenaIndex].id);
    return;
  }

  if (input === 'b') {
    event.preventDefault();
    showScreen('main-menu');
  }
}

function getArenaColumnCount() {
  if (elements.arenaCards.length < 2) {
    return 1;
  }

  const firstTop = elements.arenaCards[0].offsetTop;
  const firstRowCount = elements.arenaCards.filter((card) => card.offsetTop === firstTop).length;
  return Math.max(firstRowCount, 1);
}

function handleGlobalKeyboard(event) {
  const input = getInput(event);

  if (state.screen === 'main-menu') {
    handleMainMenuInput(input, event);
    return;
  }

  if (state.screen === 'controls') {
    handleControlsInput(input, event);
    return;
  }

  if (state.screen === 'arena-viewer') {
    handleArenaViewerInput(input, event);
  }
}

buildApp();
document.addEventListener('keydown', handleGlobalKeyboard);
