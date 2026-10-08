import {
  AbstractMesh,
  ArcRotateCamera,
  Engine,
  Mesh,
  TransformNode,
  Vector3,
} from "@babylonjs/core";
import { RING, RING_VIEW, RingBounds, Tuning } from "../game/config";

/**
 * Measuring a loaded ring: where its mat is, where the ropes stand, and how
 * far back a camera has to sit to hold all of it.
 *
 * Everything is derived from the geometry rather than hard-coded, so a
 * different ring model drops in without touching the combat code. Shared by
 * both combat tests, which load the ring differently - bare, or inside a full
 * arena - but must agree on where a wrestler may stand.
 */

/** Extents of the whole ring, used to frame the camera. */
export interface RingFrame {
  centre: Vector3;
  halfWidth: number;
  halfHeight: number;
  halfDepth: number;
}

export interface RingLayout {
  /** Play area inside the ropes, already inset by the body radius. */
  bounds: RingBounds;
  frame: RingFrame;
  /** The rope meshes, for RingRopes to replace with springy tubes. */
  ropes: Mesh[];
  /** Middle of the ropes, so each rope knows which way is outward. */
  ropeCentre: Vector3;
  /** Lowest point of the ring, where the arena floor should meet it. */
  apronBottom: number;
}

function geometryOf(meshes: AbstractMesh[]): Mesh[] {
  return meshes.filter(
    (m) => m instanceof Mesh && m.getTotalVertices() > 0
  ) as Mesh[];
}

/**
 * Moves `root` so the ring's mat sits at y=0 centred on the origin, which is
 * what lets the character controller treat the standing surface as y=0.
 *
 * Returns false, leaving `root` untouched, when the ring lacks the mat or the
 * ropes - without those there is nothing to align to.
 */
export function alignRingToOrigin(
  root: TransformNode,
  ringMeshes: AbstractMesh[]
): boolean {
  const meshes = geometryOf(ringMeshes);
  const canvas = meshes.find((m) => m.name.includes(RING.canvasMesh));
  const hasRopes = meshes.some((m) => m.name.startsWith(RING.ropePrefix));
  if (!canvas || !hasRopes) return false;

  canvas.computeWorldMatrix(true);
  canvas.refreshBoundingInfo();
  const cb = canvas.getBoundingInfo().boundingBox;
  root.position.addInPlace(
    new Vector3(
      -(cb.minimumWorld.x + cb.maximumWorld.x) / 2,
      -cb.maximumWorld.y,
      -(cb.minimumWorld.z + cb.maximumWorld.z) / 2
    )
  );
  root.computeWorldMatrix(true);
  return true;
}

/**
 * Measures a ring that is already where it will stay. Null when the ring has
 * no ropes to measure.
 */
export function measureRing(ringMeshes: AbstractMesh[]): RingLayout | null {
  const meshes = geometryOf(ringMeshes);
  const ropes = meshes.filter((m) => m.name.startsWith(RING.ropePrefix));
  if (!ropes.length) return null;

  let ringMinX = Infinity, ringMaxX = -Infinity;
  let ringMinY = Infinity, ringMaxY = -Infinity;
  let ringMinZ = Infinity, ringMaxZ = -Infinity;
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  let topRopeY = 0;
  let apronBottom = Infinity;

  for (const rope of ropes) {
    rope.computeWorldMatrix(true);
    rope.refreshBoundingInfo();
    const b = rope.getBoundingInfo().boundingBox;
    minX = Math.min(minX, b.minimumWorld.x);
    maxX = Math.max(maxX, b.maximumWorld.x);
    minZ = Math.min(minZ, b.minimumWorld.z);
    maxZ = Math.max(maxZ, b.maximumWorld.z);
    // The highest rope is the one wrestlers stand on.
    topRopeY = Math.max(topRopeY, b.centerWorld.y);
  }

  // Whole-ring extents, including posts, so the camera can frame it.
  for (const m of meshes) {
    m.computeWorldMatrix(true);
    m.refreshBoundingInfo();
    const b = m.getBoundingInfo().boundingBox;
    apronBottom = Math.min(apronBottom, b.minimumWorld.y);
    ringMinX = Math.min(ringMinX, b.minimumWorld.x);
    ringMaxX = Math.max(ringMaxX, b.maximumWorld.x);
    ringMinY = Math.min(ringMinY, b.minimumWorld.y);
    ringMaxY = Math.max(ringMaxY, b.maximumWorld.y);
    ringMinZ = Math.min(ringMinZ, b.minimumWorld.z);
    ringMaxZ = Math.max(ringMaxZ, b.maximumWorld.z);
  }

  const r = Tuning.bodyRadius;
  return {
    bounds: {
      minX: minX + r,
      maxX: maxX - r,
      minZ: minZ + r,
      maxZ: maxZ - r,
      topRopeY,
    },
    frame: {
      centre: new Vector3(
        (ringMinX + ringMaxX) / 2,
        (ringMinY + ringMaxY) / 2,
        (ringMinZ + ringMaxZ) / 2
      ),
      halfWidth: (ringMaxX - ringMinX) / 2,
      halfHeight: (ringMaxY - ringMinY) / 2,
      halfDepth: (ringMaxZ - ringMinZ) / 2,
    },
    ropes,
    ropeCentre: new Vector3((minX + maxX) / 2, 0, (minZ + maxZ) / 2),
    apronBottom,
  };
}

/**
 * Pulls a fixed ringside camera back far enough to hold the whole ring.
 *
 * The distance is solved from the viewport rather than hard-coded, so the
 * ring stays fully visible on any aspect ratio. Call again on resize.
 */
export function frameRingCamera(
  camera: ArcRotateCamera,
  engine: Engine,
  frame: RingFrame
): void {
  const { centre, halfWidth, halfHeight, halfDepth } = frame;
  const vFov = camera.fov;
  const aspect = engine.getAspectRatio(camera) || 1;
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);

  const margin = RING_VIEW.margin;
  const forHeight = (halfHeight * margin) / Math.tan(vFov / 2);
  const forWidth = (halfWidth * margin) / Math.tan(hFov / 2);

  // Target first: setTarget re-derives alpha/beta/radius from the camera's
  // current position, so setting them beforehand would be thrown away.
  camera.setTarget(
    new Vector3(centre.x, centre.y + RING_VIEW.lookHeight, centre.z)
  );

  camera.alpha = -Math.PI / 2;
  camera.beta = RING_VIEW.beta;
  // Add the ring's own depth: the far side has to fit too.
  camera.radius = Math.max(forHeight, forWidth) + halfDepth;
}

/**
 * Whether an attack from `from` can reach `to`: close enough, and roughly
 * facing the target. A wrestler swinging with his back turned should miss.
 */
export function inStrikeRange(from: TransformNode, to: TransformNode): boolean {
  const dx = to.position.x - from.position.x;
  const dz = to.position.z - from.position.z;
  const distance = Math.hypot(dx, dz);
  if (distance > Tuning.strikeRange) return false;

  // Angle between where the attacker faces and where the target is.
  const toTarget = Math.atan2(dx, dz);
  let delta = (toTarget - from.rotation.y) % (Math.PI * 2);
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return Math.abs(delta) <= Tuning.strikeArc;
}
