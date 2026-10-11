import {
  Animation,
  AnimationGroup,
  Matrix,
  Quaternion,
  TransformNode,
  Vector3,
} from "@babylonjs/core";
import { Tuning } from "../game/config";

/**
 * Node the asset pipeline keys each clip's travel onto. See
 * tools/prepare-character-glb.mjs: its keys are metres in glTF model space,
 * starting every clip at zero.
 */
const ROOT_MOTION_NODE = "root_motion";

interface Track {
  group: AnimationGroup;
  /** Current blend weight, 0..1. */
  weight: number;
  /** Weight this track is easing toward. */
  target: number;
  /** This clip's root-motion curve, when it has one. */
  motion?: { animation: Animation; node: TransformNode };
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

  /** Where the active clip's root motion was last read, and on which clip. */
  private readonly motionLast = new Vector3();
  private motionClip: string | null = null;
  private motionFrame = 0;
  private readonly motionScratch = new Vector3();
  private readonly motionMatrix = new Matrix();

  constructor(groups: AnimationGroup[]) {
    for (const group of groups) {
      // Take manual control: nothing plays until we ask for it.
      group.stop();
      group.weight = 0;

      const curve = group.targetedAnimations.find(
        (t) =>
          (t.target as TransformNode)?.name === ROOT_MOTION_NODE &&
          t.animation.targetProperty === "position"
      );
      this.tracks.set(group.name, {
        group,
        weight: 0,
        target: 0,
        motion: curve
          ? { animation: curve.animation, node: curve.target as TransformNode }
          : undefined,
      });
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
   *
   * `snap` cuts to the clip instead of fading. For a clip whose first frame
   * is not where the last one left the body - the dive stands him on the top
   * rope over a root on the mat - a fade would show the drop in between.
   */
  play(
    name: string,
    options: { loop?: boolean; restart?: boolean; snap?: boolean; onEnd?: () => void } = {}
  ): void {
    const { loop = true, restart = false, snap = false, onEnd } = options;
    const track = this.tracks.get(name);
    if (!track) return;

    if (this.activeName === name && !restart) return;

    // Drop any pending completion callback from the clip we are leaving.
    this.endCallback = null;

    for (const [otherName, other] of this.tracks) {
      other.target = otherName === name ? 1 : 0;
      if (snap) {
        other.weight = other.target;
        other.group.weight = other.weight;
        if (other.weight === 0 && other.group.isPlaying) other.group.stop();
      }
    }

    // The first clip has nothing to fade from but the bind pose, which on the
    // AKI rig stands the feet 0.8m under the floor. Start it fully weighted.
    if (this.activeName === null) track.weight = 1;

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

  /**
   * How far the active clip's root motion moved since the last call, written
   * into `out` in the wrestler's own space: metres, +Z forward, before his
   * facing is applied. False when the active clip has no root motion.
   *
   * Read from the active clip's curve rather than the animated node. During
   * a crossfade the node blends toward the next clip's zero, which would drag
   * the wrestler back to where the move began.
   */
  rootMotionDelta(out: Vector3): boolean {
    const name = this.activeName;
    const track = name ? this.tracks.get(name) : undefined;
    const animatable = track?.group.animatables[0];
    if (!track?.motion || !animatable) {
      this.motionClip = null;
      return false;
    }

    const frame = animatable.masterFrame;
    const value = track.motion.animation.evaluate(frame) as Vector3;

    // A different clip, or the same one restarted or looped: measure from
    // its start, which is zero by construction.
    if (this.motionClip !== name || frame < this.motionFrame) {
      this.motionLast.setAll(0);
    }
    value.subtractToRef(this.motionLast, this.motionScratch);
    this.motionLast.copyFrom(value);
    this.motionClip = name;
    this.motionFrame = frame;

    // The keys are in glTF space; the loader's __root__ node converts to
    // Babylon's handedness. Apply its rotation and scale, not its position.
    const root = track.motion.node.parent as TransformNode | null;
    if (root) {
      Matrix.ComposeToRef(
        root.scaling,
        root.rotationQuaternion ?? Quaternion.FromEulerVector(root.rotation),
        Vector3.ZeroReadOnly,
        this.motionMatrix
      );
      Vector3.TransformNormalToRef(this.motionScratch, this.motionMatrix, out);
    } else {
      out.copyFrom(this.motionScratch);
    }
    return true;
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

      // Fully faded out: stop it so it stops consuming update time. A track
      // still at zero because it has only just been asked to fade in - a
      // zero-length frame does that - is left playing.
      if (track.weight === 0 && track.target === 0 && track.group.isPlaying) {
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
