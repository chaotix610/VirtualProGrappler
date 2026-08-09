import {
  AbstractMesh,
  Material,
  Mesh,
  MeshBuilder,
  Scene,
  Vector3,
} from "@babylonjs/core";
import { Tuning } from "../game/config";

/**
 * Which rope wall was struck, keyed by the outward axis rather than by mesh
 * name, so a ring model that labels its sides differently still works.
 */
export type RopeSide = "+x" | "-x" | "+z" | "-z";

/** Path points per rope. Enough to read as a smooth curve when loaded. */
const SEGMENTS = 18;

interface RopeStrand {
  tube: Mesh;
  start: Vector3;
  end: Vector3;
  radius: number;
  /** Unit vector pointing away from the middle of the ring. */
  outward: Vector3;
  /** Ropes at chest height take more of the hit than the top and bottom. */
  weight: number;
  /** Scratch path, rewritten in place each update. */
  path: Vector3[];
  /** Bow the tube was last built with, to skip redundant rebuilds. */
  lastBow: number;
}

interface RopeWall {
  strands: RopeStrand[];
  /** Current outward bow in world units. */
  displacement: number;
  velocity: number;
}

/**
 * Gives the ring ropes springiness: they stretch outward when a wrestler runs
 * into them and oscillate back, which is what sells the rebound.
 *
 * The source ropes are bare cylinders with vertices only at their two ends,
 * so there is no midspan geometry to deform. Each is therefore replaced with
 * an updatable tube whose path bows by sin(pi * s) along its length - pinned
 * at the posts, bulging in the middle, the way a loaded rope behaves.
 */
export class RingRopes {
  private walls = new Map<RopeSide, RopeWall>();

  constructor(ropeMeshes: AbstractMesh[], ringCentre: Vector3, scene: Scene) {
    for (const source of ropeMeshes) {
      if (!(source instanceof Mesh)) continue;
      const built = this.replaceWithTube(source, ringCentre, scene);
      if (!built) continue;

      const { strand, side } = built;
      const wall =
        this.walls.get(side) ??
        this.walls.set(side, { strands: [], displacement: 0, velocity: 0 }).get(side)!;
      wall.strands.push(strand);
    }

    // Within each wall, the middle rope is the one a running body meets.
    for (const wall of this.walls.values()) {
      const sorted = [...wall.strands].sort((a, b) => a.start.y - b.start.y);
      sorted.forEach((s, i) => {
        const isMiddle = i === Math.floor((sorted.length - 1) / 2);
        s.weight = isMiddle ? 1 : 0.7;
      });
    }
  }

  get wallCount(): number {
    return this.walls.size;
  }

  /**
   * Swaps one rigid rope cylinder for a segmented tube that can bend, keeping
   * its position, thickness and material.
   */
  private replaceWithTube(
    source: Mesh,
    ringCentre: Vector3,
    scene: Scene
  ): { strand: RopeStrand; side: RopeSide } | null {
    source.computeWorldMatrix(true);
    source.refreshBoundingInfo();
    const box = source.getBoundingInfo().boundingBox;
    const min = box.minimumWorld;
    const max = box.maximumWorld;

    const extents = [max.x - min.x, max.y - min.y, max.z - min.z];
    // The rope runs along its longest world axis.
    const lengthAxis = extents.indexOf(Math.max(...extents));
    if (lengthAxis === 1) return null; // a vertical "rope" is a post, not a rope

    const centre = box.centerWorld;
    const start = centre.clone();
    const end = centre.clone();
    if (lengthAxis === 0) {
      start.x = min.x;
      end.x = max.x;
    } else {
      start.z = min.z;
      end.z = max.z;
    }

    // Thickness comes from the two cross-section axes.
    const radius =
      Math.min(...extents.filter((_, i) => i !== lengthAxis)) / 2 || 0.02;

    const outward = centre.subtract(ringCentre);
    outward.y = 0;
    if (outward.lengthSquared() < 1e-6) return null;
    // A rope running along X can only face +/-Z, and vice versa.
    if (lengthAxis === 0) outward.x = 0;
    else outward.z = 0;
    outward.normalize();

    const path: Vector3[] = [];
    for (let i = 0; i <= SEGMENTS; i++) {
      path.push(Vector3.Lerp(start, end, i / SEGMENTS));
    }

    const tube = MeshBuilder.CreateTube(
      `${source.name}-elastic`,
      { path, radius, tessellation: 8, updatable: true, cap: Mesh.CAP_ALL },
      scene
    );
    tube.material = source.material as Material;
    tube.receiveShadows = true;
    tube.isPickable = false;

    // Keep the original around but hidden, so the ring still owns it.
    source.setEnabled(false);

    const side: RopeSide =
      lengthAxis === 0
        ? outward.z >= 0
          ? "+z"
          : "-z"
        : outward.x >= 0
          ? "+x"
          : "-x";

    return {
      strand: { tube, start, end, radius, outward, weight: 1, path, lastBow: 0 },
      side,
    };
  }

  /**
   * Loads a rope wall. `speed` is how fast the wrestler hit it; the resulting
   * stretch scales with that, so a walk nudges and a run heaves.
   */
  impact(side: RopeSide, speed: number): void {
    const wall = this.walls.get(side);
    if (!wall) return;
    wall.velocity += speed * Tuning.ropeImpulseScale;
  }

  /** Advances the springs and reshapes any rope that moved. */
  update(deltaSeconds: number): void {
    // Fixed sub-steps keep the spring stable if a frame runs long.
    const step = 1 / 120;
    const frame = Math.min(deltaSeconds, 0.1);

    for (const wall of this.walls.values()) {
      const settled =
        Math.abs(wall.displacement) < 1e-4 && Math.abs(wall.velocity) < 1e-4;
      if (settled) {
        if (wall.displacement !== 0) {
          wall.displacement = 0;
          wall.velocity = 0;
          this.reshape(wall);
        }
        continue;
      }

      let time = frame;
      while (time > 0) {
        const dt = Math.min(step, time);
        const accel =
          -Tuning.ropeStiffness * wall.displacement -
          Tuning.ropeDamping * wall.velocity;
        wall.velocity += accel * dt;
        wall.displacement += wall.velocity * dt;
        time -= dt;
      }

      // Ropes stretch, they do not travel; cap the bow.
      if (wall.displacement > Tuning.ropeMaxBow) {
        wall.displacement = Tuning.ropeMaxBow;
        wall.velocity = Math.min(wall.velocity, 0);
      } else if (wall.displacement < -Tuning.ropeMaxBow) {
        wall.displacement = -Tuning.ropeMaxBow;
        wall.velocity = Math.max(wall.velocity, 0);
      }

      this.reshape(wall);
    }
  }

  private reshape(wall: RopeWall): void {
    for (const strand of wall.strands) {
      const bow = wall.displacement * strand.weight;
      // Rebuilding a tube is not free; skip imperceptible changes.
      if (Math.abs(bow - strand.lastBow) < 1e-4) continue;
      strand.lastBow = bow;

      for (let i = 0; i <= SEGMENTS; i++) {
        const s = i / SEGMENTS;
        const point = strand.path[i];
        Vector3.LerpToRef(strand.start, strand.end, s, point);
        // Zero at the posts, greatest in the middle.
        const amount = Math.sin(Math.PI * s) * bow;
        point.addInPlace(strand.outward.scale(amount));
      }

      MeshBuilder.CreateTube(strand.tube.name, {
        path: strand.path,
        radius: strand.radius,
        instance: strand.tube,
      });
    }
  }

  /** Current bow of a wall, in world units. Used by tests. */
  displacementOf(side: RopeSide): number {
    return this.walls.get(side)?.displacement ?? 0;
  }
}
