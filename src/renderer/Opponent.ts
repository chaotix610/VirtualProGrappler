import { TransformNode, Vector3 } from "@babylonjs/core";
import { AnimationController } from "./AnimationController";
import { Anim, Tuning } from "../game/config";

/**
 * The other wrestler in the ring.
 *
 * Deliberately inert for now: no AI, no movement. It exists so the player has
 * something to orient against, and so the facing and default-run rules have a
 * real target. When the HFSM lands this is what the InteractionRegion will
 * track distance and facing angle against.
 */
export class Opponent {
  constructor(
    readonly root: TransformNode,
    private animations: AnimationController
  ) {
    this.animations.play(Anim.IDLE, { loop: true });
  }

  get position(): Vector3 {
    return this.root.position;
  }

  /** Turns to face a point and advances animation blending. */
  update(deltaSeconds: number, facePoint: Vector3 | null): void {
    if (facePoint) {
      const dx = facePoint.x - this.root.position.x;
      const dz = facePoint.z - this.root.position.z;
      if (dx * dx + dz * dz > 1e-6) {
        const target = Math.atan2(dx, dz);
        this.root.rotation.y = approachAngle(
          this.root.rotation.y,
          target,
          Tuning.turnSpeed * deltaSeconds
        );
      }
    }
    this.animations.update(deltaSeconds);
  }

  dispose(): void {
    this.animations.dispose();
    this.root.dispose();
  }
}

/** Moves `from` toward `to` by at most `maxDelta`, wrapping at +/-PI. */
function approachAngle(from: number, to: number, maxDelta: number): number {
  let diff = (to - from) % (Math.PI * 2);
  if (diff > Math.PI) diff -= Math.PI * 2;
  if (diff < -Math.PI) diff += Math.PI * 2;
  if (Math.abs(diff) <= maxDelta) return to;
  return from + Math.sign(diff) * maxDelta;
}
