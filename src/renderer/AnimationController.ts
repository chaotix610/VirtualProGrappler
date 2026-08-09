import { AnimationGroup } from "@babylonjs/core";
import { Tuning } from "../game/config";

interface Track {
  group: AnimationGroup;
  /** Current blend weight, 0..1. */
  weight: number;
  /** Weight this track is easing toward. */
  target: number;
}

/**
 * Crossfades between animation clips using per-group blend weights.
 *
 * Exactly one clip is the "active" one at a time; everything else fades out.
 * Because Babylon blends weighted animations that target the same bones, this
 * gives smooth idle -> walk -> run transitions without popping.
 */
export class AnimationController {
  private tracks = new Map<string, Track>();
  private activeName: string | null = null;
  /** Resolved when the current non-looping clip finishes. */
  private endCallback: (() => void) | null = null;

  constructor(groups: AnimationGroup[]) {
    for (const group of groups) {
      // Take manual control: nothing plays until we ask for it.
      group.stop();
      group.weight = 0;
      this.tracks.set(group.name, { group, weight: 0, target: 0 });
    }
  }

  /** Clip names that were actually found on the model. */
  get available(): string[] {
    return [...this.tracks.keys()];
  }

  has(name: string): boolean {
    return this.tracks.has(name);
  }

  /** Length of a clip in seconds, or undefined if it is not loaded. */
  durationOf(name: string): number | undefined {
    const track = this.tracks.get(name);
    if (!track) return undefined;

    const group = track.group;
    const fps = group.targetedAnimations[0]?.animation.framePerSecond ?? 60;
    return (group.to - group.from) / fps;
  }

  get current(): string | null {
    return this.activeName;
  }

  /**
   * Crossfades to `name`. Re-requesting the clip that is already active is a
   * no-op unless `restart` is set, which is what makes repeated punches replay
   * from the first frame.
   */
  play(
    name: string,
    options: { loop?: boolean; restart?: boolean; onEnd?: () => void } = {}
  ): void {
    const { loop = true, restart = false, onEnd } = options;
    const track = this.tracks.get(name);
    if (!track) return;

    if (this.activeName === name && !restart) return;

    // Drop any pending completion callback from the clip we are leaving.
    this.endCallback = null;

    for (const [otherName, other] of this.tracks) {
      other.target = otherName === name ? 1 : 0;
    }

    if (restart || !track.group.isPlaying) {
      track.group.stop();
      track.group.weight = track.weight;
      track.group.play(loop);
    }

    this.activeName = name;

    if (!loop) {
      // A single observer per playback; cleared as soon as it fires.
      const observer = track.group.onAnimationGroupEndObservable.addOnce(() => {
        if (this.endCallback) {
          const cb = this.endCallback;
          this.endCallback = null;
          cb();
        }
      });
      void observer;
      this.endCallback = onEnd ?? null;
    }
  }

  /** Advances all blend weights. Call once per frame. */
  update(deltaSeconds: number): void {
    const step = deltaSeconds / Math.max(Tuning.blendDuration, 0.0001);

    for (const track of this.tracks.values()) {
      if (track.weight === track.target) {
        continue;
      }

      const delta = track.target - track.weight;
      const move = Math.sign(delta) * step;

      track.weight =
        Math.abs(move) >= Math.abs(delta) ? track.target : track.weight + move;

      track.group.weight = track.weight;

      // Fully faded out: stop it so it stops consuming update time.
      if (track.weight === 0 && track.group.isPlaying) {
        track.group.stop();
      }
    }
  }

  dispose(): void {
    for (const track of this.tracks.values()) {
      track.group.stop();
    }
    this.tracks.clear();
    this.endCallback = null;
  }
}
