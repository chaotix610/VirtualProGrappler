import { afterEach, describe, expect, it } from "vitest";
import {
  AUDIO_STORAGE_KEY,
  MENU_CUES,
  MenuCue,
  loadSavedAudioSettings,
  menuAudioMuted,
  menuAudioVolume,
  playMenuCue,
  setMenuAudioMuted,
  setMenuAudioVolume,
} from "@/audio/menuAudio";

const CUE_NAMES: MenuCue[] = [
  "move",
  "select",
  "back",
  "toggle",
  "confirm",
  "deny",
];

/** A localStorage stand-in; the unit suite runs without a DOM. */
function fakeStorage(seed: Record<string, string> = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
    clear: () => map.clear(),
    key: (index: number) => [...map.keys()][index] ?? null,
    get length() {
      return map.size;
    },
  } as Storage;
}

function withStorage(store: Storage, run: () => void) {
  const globals = globalThis as { localStorage?: Storage };
  globals.localStorage = store;
  try {
    run();
  } finally {
    delete globals.localStorage;
  }
}

afterEach(() => {
  setMenuAudioMuted(false);
  setMenuAudioVolume(0.5);
});

describe("menu cue table", () => {
  it("defines every cue the screens can ask for", () => {
    expect(Object.keys(MENU_CUES).sort()).toEqual([...CUE_NAMES].sort());
  });

  it("gives every cue at least one tone", () => {
    for (const cue of CUE_NAMES) {
      expect(MENU_CUES[cue].length, cue).toBeGreaterThan(0);
    }
  });

  it("keeps every cue short enough to sit under a keypress", () => {
    for (const cue of CUE_NAMES) {
      const end = Math.max(...MENU_CUES[cue].map((t) => t.at + t.dur));
      expect(end, cue).toBeLessThanOrEqual(0.25);
    }
  });

  it("keeps every tone audible, positive and below clipping", () => {
    for (const cue of CUE_NAMES) {
      for (const tone of MENU_CUES[cue]) {
        expect(tone.at, cue).toBeGreaterThanOrEqual(0);
        expect(tone.dur, cue).toBeGreaterThan(0);
        expect(tone.freq, cue).toBeGreaterThan(20);
        expect(tone.gain, cue).toBeGreaterThan(0);
        expect(tone.gain, cue).toBeLessThanOrEqual(0.5);
      }
    }
  });

  it("never glides to a frequency of zero, which no ramp can reach", () => {
    for (const cue of CUE_NAMES) {
      for (const tone of MENU_CUES[cue]) {
        if (tone.to !== undefined) expect(tone.to, cue).toBeGreaterThan(0);
      }
    }
  });
});

describe("playback without audio support", () => {
  it("is a silent no-op rather than a throw", () => {
    // No AudioContext under the unit suite - the same path a browser that
    // blocks audio takes, and a menu must survive it.
    for (const cue of CUE_NAMES) {
      expect(() => playMenuCue(cue)).not.toThrow();
    }
  });
});

describe("audio settings", () => {
  it("round-trips mute", () => {
    setMenuAudioMuted(true);
    expect(menuAudioMuted()).toBe(true);
    setMenuAudioMuted(false);
    expect(menuAudioMuted()).toBe(false);
  });

  it("clamps the volume instead of refusing it", () => {
    setMenuAudioVolume(2);
    expect(menuAudioVolume()).toBe(1);
    setMenuAudioVolume(-1);
    expect(menuAudioVolume()).toBe(0);
  });

  it("saves and reloads what the player chose", () => {
    const store = fakeStorage();
    withStorage(store, () => {
      setMenuAudioMuted(true);
      setMenuAudioVolume(0.25);
    });

    setMenuAudioMuted(false);
    setMenuAudioVolume(0.5);

    withStorage(store, loadSavedAudioSettings);
    expect(menuAudioMuted()).toBe(true);
    expect(menuAudioVolume()).toBe(0.25);
  });

  it("ignores a save that has been hand-edited into nonsense", () => {
    const store = fakeStorage({
      [AUDIO_STORAGE_KEY]: JSON.stringify({ muted: "yes", volume: "loud" }),
    });

    withStorage(store, loadSavedAudioSettings);
    expect(menuAudioMuted()).toBe(false);
    expect(menuAudioVolume()).toBe(0.5);
  });

  it("survives a save that is not JSON at all", () => {
    const store = fakeStorage({ [AUDIO_STORAGE_KEY]: "{" });
    expect(() => withStorage(store, loadSavedAudioSettings)).not.toThrow();
  });

  it("does nothing when there is no storage to read", () => {
    expect(() => loadSavedAudioSettings()).not.toThrow();
  });
});
