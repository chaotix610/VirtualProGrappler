import { afterEach, describe, expect, it, vi } from "vitest";

function audioHarness() {
  const sources: Array<{
    buffer: unknown; loop: boolean; loopEnd: number;
    connect: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn>;
    start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn>;
  }> = [];
  const gains: Array<{ gain: { setValueAtTime: ReturnType<typeof vi.fn>; setTargetAtTime: ReturnType<typeof vi.fn> }; connect: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }> = [];
  let decoded = 0;
  class Context {
    currentTime = 10;
    state = "suspended";
    destination = {};
    resume = vi.fn(async () => { this.state = "running"; });
    decodeAudioData = vi.fn(async () => ({ duration: [60, 60.01, 60.02][decoded++] }));
    createGain() {
      const node = { gain: { setValueAtTime: vi.fn(), setTargetAtTime: vi.fn() }, connect: vi.fn(), disconnect: vi.fn() };
      gains.push(node);
      return node;
    }
    createBufferSource() {
      const node = { buffer: null as unknown, loop: false, loopEnd: 0, connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn() };
      sources.push(node);
      return node;
    }
  }
  vi.stubGlobal("window", { AudioContext: Context });
  const fetchMock = vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(0) }));
  vi.stubGlobal("fetch", fetchMock);
  return { sources, gains, fetchMock };
}

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

describe("layered menu music", () => {
  it("starts all stems together and changes depth without restarting them", async () => {
    const { sources, gains, fetchMock } = audioHarness();
    const music = await import("@/audio/menuAudio");
    music.setMenuMusicDepth(1);
    await vi.waitFor(() => expect(sources).toHaveLength(3));
    expect(fetchMock).toHaveBeenCalledTimes(3);
    for (const source of sources) {
      expect(source.loop).toBe(true);
      expect(source.loopEnd).toBe(60);
      expect(source.start).toHaveBeenCalledExactlyOnceWith(10.05);
    }
    expect(gains.slice(1).map((gain) => gain.gain.setValueAtTime.mock.calls[0][0])).toEqual([1, 0, 0]);
    music.setMenuMusicDepth(2);
    expect(gains.slice(1).map((gain) => gain.gain.setTargetAtTime.mock.lastCall?.[0])).toEqual([1, 1, 0]);
    music.setMenuMusicDepth(3);
    expect(gains.slice(1).map((gain) => gain.gain.setTargetAtTime.mock.lastCall?.[0])).toEqual([1, 1, 1]);
    music.setMenuMusicDepth(1);
    expect(gains.slice(1).map((gain) => gain.gain.setTargetAtTime.mock.lastCall?.[0])).toEqual([1, 0, 0]);
    expect(sources).toHaveLength(3);
    music.stopMenuMusic();
    for (const source of sources) expect(source.stop).toHaveBeenCalledOnce();
  });

  it("does not start late loads after leaving the menu", async () => {
    const { sources } = audioHarness();
    const music = await import("@/audio/menuAudio");
    music.setMenuMusicDepth(1);
    music.stopMenuMusic();
    await music.startMenuMusic();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(sources).toHaveLength(0);
  });
});
