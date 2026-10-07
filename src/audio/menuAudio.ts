/**
 * Menu sound effects.
 *
 * Sound effects and synchronized, layered menu music share one audio context
 * and the saved master volume.
 *
 * Every entry point is safe to call anywhere: with no AudioContext - the unit
 * suite, or a browser that blocks audio - the whole module quietly does
 * nothing. A menu must never break because a sound could not play.
 */

/** The cues the screens ask for, by what the player just did. */
export type MenuCue =
  /** Cursor moved to another row. */
  | "move"
  /** A row was taken: a page opened, an arena loaded, a rebind started. */
  | "select"
  /** Backing out of a screen, a page, or a modal. */
  | "back"
  /** A panel or overlay toggled without leaving the screen. */
  | "toggle"
  /** Something finished: a save landed, a binding was written. */
  | "confirm"
  /** The input was refused: an unbuilt route, a failed save or load. */
  | "deny";

/** One oscillator within a cue. */
export interface Tone {
  /** Offset from the start of the cue, in seconds. */
  at: number;
  /** Starting frequency, in hertz. */
  freq: number;
  /** Frequency glided to over the tone's life, when it is not steady. */
  to?: number;
  /** Length in seconds. */
  dur: number;
  type: OscillatorType;
  /** Peak of this tone's envelope, before the master volume. */
  gain: number;
}

/**
 * The cue table.
 *
 * Kept declarative so the sound of a screen is a data change here rather than
 * an edit inside the playback code, and so the set stays small enough to hear
 * as a family: square waves, short, no cue longer than a fifth of a second.
 */
export const MENU_CUES: Record<MenuCue, Tone[]> = {
  // Dry and quiet: this one fires on every row, including key repeat.
  move: [{ at: 0, freq: 520, to: 560, dur: 0.05, type: "square", gain: 0.16 }],

  // Rising pair, the classic "accepted" shape.
  select: [
    { at: 0, freq: 660, to: 880, dur: 0.06, type: "square", gain: 0.18 },
    { at: 0.055, freq: 1100, dur: 0.09, type: "square", gain: 0.15 },
  ],

  // The inverse of select, so backing out is audibly the opposite of entering.
  back: [{ at: 0, freq: 440, to: 260, dur: 0.11, type: "square", gain: 0.16 }],

  // A click rather than a note: overlays open and close often.
  toggle: [{ at: 0, freq: 880, dur: 0.035, type: "triangle", gain: 0.14 }],

  // Three notes up. Reserved for work that completed, not for navigation.
  confirm: [
    { at: 0, freq: 660, dur: 0.07, type: "square", gain: 0.15 },
    { at: 0.06, freq: 880, dur: 0.07, type: "square", gain: 0.15 },
    { at: 0.12, freq: 1320, dur: 0.12, type: "square", gain: 0.14 },
  ],

  // Low and buzzing, so a refusal is unmistakable next to the blips above.
  deny: [{ at: 0, freq: 200, to: 120, dur: 0.18, type: "sawtooth", gain: 0.16 }],
};

/** Where the mute and volume settings persist. */
export const AUDIO_STORAGE_KEY = "vpg-audio";

/** Held back-to-back cues apart, in seconds. */
const RETRIGGER_FLOOR = 0.035;

/** Ramp to peak. Long enough to avoid a click, short enough to stay punchy. */
const ATTACK = 0.008;

/**
 * Exponential ramps cannot reach zero, so the envelopes decay to this instead.
 * Inaudible, and the oscillator stops immediately afterwards.
 */
const SILENCE = 0.0001;

interface AudioSettings {
  muted: boolean;
  /** Master level, 0 to 1. */
  volume: number;
}

const settings: AudioSettings = { muted: false, volume: 0.5 };

let context: AudioContext | null = null;
let master: GainNode | null = null;
/** When each cue last started, so repeats do not stack into a buzz. */
const lastPlayed = new Map<MenuCue, number>();

export function menuAudioMuted(): boolean {
  return settings.muted;
}

export function menuAudioVolume(): number {
  return settings.volume;
}

export function setMenuAudioMuted(muted: boolean): void {
  settings.muted = muted;
  applyVolume();
  save();
}

/** Sets the master level. Values outside 0..1 are clamped rather than refused. */
export function setMenuAudioVolume(volume: number): void {
  settings.volume = Math.min(1, Math.max(0, volume));
  applyVolume();
  save();
}

/**
 * Plays a cue.
 *
 * Fire and forget: no promise, no error. Called from key handlers and click
 * handlers, which have their own work to get on with.
 */
export function playMenuCue(cue: MenuCue): void {
  if (settings.muted) return;

  const ctx = audio();
  if (!ctx || !master) return;

  const now = ctx.currentTime;
  const last = lastPlayed.get(cue) ?? -Infinity;
  if (now - last < RETRIGGER_FLOOR) return;
  lastPlayed.set(cue, now);

  try {
    for (const tone of MENU_CUES[cue]) schedule(ctx, master, tone, now + tone.at);
  } catch {
    // A context that died mid-cue is not worth taking the menu down for.
  }
}

/**
 * Loads the saved mute and volume.
 *
 * Called once at startup, like `loadSavedBindings`. Unknown or malformed
 * values are ignored rather than trusted: this is user-editable storage.
 */
export function loadSavedAudioSettings(): void {
  const store = storage();
  if (!store) return;

  let saved: unknown;
  try {
    const raw = store.getItem(AUDIO_STORAGE_KEY);
    if (!raw) return;
    saved = JSON.parse(raw);
  } catch {
    return;
  }

  const record = saved as Partial<AudioSettings> | null;
  if (typeof record?.muted === "boolean") settings.muted = record.muted;
  if (typeof record?.volume === "number" && Number.isFinite(record.volume)) {
    settings.volume = Math.min(1, Math.max(0, record.volume));
  }
  applyVolume();
}

/** Schedules one tone's oscillator and envelope, then forgets about it. */
function schedule(
  ctx: AudioContext,
  destination: GainNode,
  tone: Tone,
  start: number
): void {
  const osc = ctx.createOscillator();
  const envelope = ctx.createGain();

  osc.type = tone.type;
  osc.frequency.setValueAtTime(tone.freq, start);
  if (tone.to !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(tone.to, start + tone.dur);
  }

  envelope.gain.setValueAtTime(SILENCE, start);
  envelope.gain.linearRampToValueAtTime(tone.gain, start + ATTACK);
  envelope.gain.exponentialRampToValueAtTime(SILENCE, start + tone.dur);

  osc.connect(envelope);
  envelope.connect(destination);
  osc.start(start);
  osc.stop(start + tone.dur + 0.02);
  // Frees the envelope with it; nothing else holds a reference to either.
  osc.onended = () => envelope.disconnect();
}

/**
 * The shared context, built on the first cue.
 *
 * Built lazily because a context created before the player has touched the
 * page starts suspended under autoplay policy. The first cue always follows a
 * key press or a click, so by then it is allowed to run - and a context that
 * was suspended anyway (the tab was hidden) is resumed here.
 */
function audio(): AudioContext | null {
  if (context) {
    if (context.state === "suspended") void context.resume().catch(() => {});
    return context;
  }

  const Ctor = contextConstructor();
  if (!Ctor) return null;

  try {
    context = new Ctor();
    master = context.createGain();
    master.connect(context.destination);
    applyVolume();
  } catch {
    // Audio is unavailable for this page. Stop asking.
    context = null;
    master = null;
  }

  return context;
}

function contextConstructor(): typeof AudioContext | null {
  if (typeof window === "undefined") return null;
  const scope = window as typeof window & { webkitAudioContext?: typeof AudioContext };
  return scope.AudioContext ?? scope.webkitAudioContext ?? null;
}

function applyVolume(): void {
  if (!master || !context) return;
  const level = settings.muted ? 0 : settings.volume;
  // Ramped rather than set, so muting mid-cue does not click.
  master.gain.setTargetAtTime(level, context.currentTime, 0.01);
}

function storage(): Storage | null {
  // Absent under the unit suite, and can throw when cookies are blocked.
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

function save(): void {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(AUDIO_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // A full or blocked quota should not break the menus.
  }
}

/** All stems run together; navigation changes gains, never playback position. */
const MUSIC_URLS = [
  new URL("../../assets/sound/music/menu/menu-music-basetrack.mp3", import.meta.url).href,
  new URL("../../assets/sound/music/menu/menu-music-overlay-1.mp3", import.meta.url).href,
  new URL("../../assets/sound/music/menu/menu-music-overlay-2.mp3", import.meta.url).href,
];

let musicDepth = 0;
let musicBuffers: Promise<AudioBuffer[]> | null = null;
let musicLoading = false;
let musicSources: AudioBufferSourceNode[] = [];
let musicGains: GainNode[] = [];

/** Root = 1, first submenu = 2, second submenu and deeper = 3. */
export function setMenuMusicDepth(depth: number): void {
  musicDepth = Math.max(0, Math.floor(depth));
  updateMusicLayers();
  if (musicDepth > 0) void startMenuMusic();
}

/** Called on user gestures too, to unlock browsers that suspend autoplay. */
export async function startMenuMusic(): Promise<void> {
  if (musicDepth === 0) return;
  const ctx = audio();
  if (!ctx || !master || musicSources.length || musicLoading) return;
  musicLoading = true;
  try {
    musicBuffers ??= Promise.all(MUSIC_URLS.map(async (url) => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Music load failed: ${response.status}`);
      return ctx.decodeAudioData(await response.arrayBuffer());
    }));
    const buffers = await musicBuffers;
    if (musicDepth === 0) return;
    // One shared loop boundary prevents even slightly different encoded
    // durations from accumulating drift between stems.
    const loopEnd = Math.min(...buffers.map((buffer) => buffer.duration));
    const start = ctx.currentTime + 0.05;
    buffers.forEach((buffer, index) => {
      const source = ctx.createBufferSource();
      const gain = ctx.createGain();
      source.buffer = buffer;
      source.loop = true;
      source.loopEnd = loopEnd;
      gain.gain.setValueAtTime(index < musicDepth ? 1 : 0, start);
      source.connect(gain);
      gain.connect(master!);
      musicSources.push(source);
      musicGains.push(gain);
      source.start(start);
    });
  } catch {
    // Allow a later gesture to retry a failed load, without breaking navigation.
    musicBuffers = null;
    stopMusicSources();
  } finally {
    musicLoading = false;
  }
}

export function stopMenuMusic(): void {
  musicDepth = 0;
  stopMusicSources();
}

function stopMusicSources(): void {
  for (const source of musicSources) {
    source.stop();
    source.disconnect();
  }
  for (const gain of musicGains) gain.disconnect();
  musicSources = [];
  musicGains = [];
}

function updateMusicLayers(): void {
  if (!context) return;
  musicGains.forEach((gain, index) => {
    gain.gain.setTargetAtTime(index < musicDepth ? 1 : 0, context!.currentTime, 0.025);
  });
}
