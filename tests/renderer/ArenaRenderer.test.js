import { describe, it, expect } from 'vitest';
import { Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { ArenaRenderer } from '../../src/renderer/ArenaRenderer.js';

describe('ArenaRenderer', () => {
  it('normalizes string-based arena parts', () => {
    const renderer = new ArenaRenderer();

    const parts = renderer._getArenaPartDefs({
      arenaParts: [
        'assets/glb/arena/arena-floor.glb',
        'assets/glb/arena/barricade.glb',
      ],
    });

    expect(parts).toHaveLength(2);
    expect(parts[0].glb).toBe('assets/glb/arena/arena-floor.glb');
    expect(parts[0].position.asArray()).toEqual([0, 0, 0]);
    expect(parts[0].rotation.asArray()).toEqual([0, 0, 0]);
  });

  it('normalizes object-based arena parts with explicit positions', () => {
    const renderer = new ArenaRenderer();

    const parts = renderer._getArenaPartDefs({
      arenaParts: [
        { glb: 'assets/glb/arena/barricade.glb', position: [10, 0, -5] },
      ],
    });

    expect(parts).toHaveLength(1);
    expect(parts[0].glb).toBe('assets/glb/arena/barricade.glb');
    expect(parts[0].position.asArray()).toEqual([10, 0, -5]);
    expect(parts[0].rotation.asArray()).toEqual([0, 0, 0]);
  });

  it('normalizes object-based arena parts with explicit rotations', () => {
    const renderer = new ArenaRenderer();

    const parts = renderer._getArenaPartDefs({
      arenaParts: [
        {
          glb: 'assets/glb/arena/arena-floor.glb',
          position: [3.48, 0, -3.88],
          rotation: [0, 3.141593, 0],
        },
      ],
    });

    expect(parts).toHaveLength(1);
    expect(parts[0].glb).toBe('assets/glb/arena/arena-floor.glb');
    expect(parts[0].position.asArray()).toEqual([3.48, 0, -3.88]);
    expect(parts[0].rotation.asArray()).toEqual([0, 3.141593, 0]);
  });

  it('falls back to the legacy arenaGlb field', () => {
    const renderer = new ArenaRenderer();

    const parts = renderer._getArenaPartDefs({
      arenaGlb: 'assets/glb/arena/arena.glb',
    });

    expect(parts).toHaveLength(1);
    expect(parts[0].glb).toBe('assets/glb/arena/arena.glb');
    expect(parts[0].position.asArray()).toEqual([0, 0, 0]);
    expect(parts[0].rotation.asArray()).toEqual([0, 0, 0]);
  });

  it('applies offsets only to root meshes', () => {
    const renderer = new ArenaRenderer();
    const offset = new Vector3(5, 0, -2);

    const rootMesh = {
      parent: null,
      position: new Vector3(1, 2, 3),
    };

    const childMesh = {
      parent: {},
      position: new Vector3(10, 20, 30),
    };

    renderer._applyPartOffset([rootMesh, childMesh], offset);

    expect(rootMesh.position.asArray()).toEqual([6, 2, 1]);
    expect(childMesh.position.asArray()).toEqual([10, 20, 30]);
  });

  it('applies rotations only to root meshes', () => {
    const renderer = new ArenaRenderer();
    const rotation = new Vector3(0, Math.PI, 0);

    const rootMesh = {
      parent: null,
      position: new Vector3(0, 0, 0),
      rotation: new Vector3(1, 2, 3),
    };

    const childMesh = {
      parent: {},
      position: new Vector3(0, 0, 0),
      rotation: new Vector3(10, 20, 30),
    };

    renderer._applyPartTransform([rootMesh, childMesh], {
      position: Vector3.Zero(),
      rotation,
    });

    expect(rootMesh.rotation.asArray()).toEqual([1, 2 + Math.PI, 3]);
    expect(childMesh.rotation.asArray()).toEqual([10, 20, 30]);
  });

  it('returns ring-steps placements for the NE and SW corners', () => {
    const renderer = new ArenaRenderer();

    const placements = renderer._ringStepsPlacements();

    expect(placements).toHaveLength(2);
    expect(placements.map((p) => p.corner)).toEqual(['ne', 'sw']);

    const ne = placements[0];
    expect(ne.position).toBeInstanceOf(Vector3);
    expect(ne.rotation).toBeInstanceOf(Quaternion);
    // NE corner sits in the +X half of the ring at glTF -Z.
    expect(ne.position.x).toBeGreaterThan(0);
    expect(ne.position.z).toBeLessThan(0);

    const sw = placements[1];
    // SW corner mirrors across both axes.
    expect(sw.position.x).toBeLessThan(0);
    expect(sw.position.z).toBeGreaterThan(0);

    // Both placements rest the steps on the arena floor at the same height.
    expect(sw.position.y).toBeCloseTo(ne.position.y, 6);
  });

  it('overrides the ring-steps mesh local TRS with the placement values', () => {
    const renderer = new ArenaRenderer();

    const stepsMesh = {
      name: 'ring-steps',
      parent: { name: '__root__' },
      position: new Vector3(-0.096, 0.675, -0.111),
      rotationQuaternion: new Quaternion(0.7071, 0, 0, 0.7071),
    };
    const unrelatedMesh = {
      name: '__root__',
      parent: null,
      position: new Vector3(99, 99, 99),
      rotationQuaternion: new Quaternion(1, 2, 3, 4),
    };

    const placement = {
      corner: 'ne',
      position: new Vector3(3.79, 0.675, -3.81),
      rotation: new Quaternion(0.27, 0.65, -0.65, 0.27),
    };

    renderer._applyRingStepsTransform([unrelatedMesh, stepsMesh], placement);

    expect(stepsMesh.position.asArray()).toEqual([3.79, 0.675, -3.81]);
    expect(stepsMesh.rotationQuaternion.x).toBeCloseTo(0.27);
    expect(stepsMesh.rotationQuaternion.y).toBeCloseTo(0.65);
    expect(stepsMesh.rotationQuaternion.z).toBeCloseTo(-0.65);
    expect(stepsMesh.rotationQuaternion.w).toBeCloseTo(0.27);

    // The __root__ axis-conversion node must be left alone.
    expect(unrelatedMesh.position.asArray()).toEqual([99, 99, 99]);
    expect(unrelatedMesh.rotationQuaternion.x).toBe(1);
  });

  it('ignores ring-steps transform when no ring-steps mesh is present', () => {
    const renderer = new ArenaRenderer();

    const onlyRoot = {
      name: '__root__',
      parent: null,
      position: new Vector3(0, 0, 0),
      rotationQuaternion: new Quaternion(0, 0, 0, 1),
    };

    expect(() =>
      renderer._applyRingStepsTransform([onlyRoot], {
        corner: 'ne',
        position: new Vector3(1, 2, 3),
        rotation: new Quaternion(0, 0, 0, 1),
      })
    ).not.toThrow();

    expect(onlyRoot.position.asArray()).toEqual([0, 0, 0]);
  });
});
