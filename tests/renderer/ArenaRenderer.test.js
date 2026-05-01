import { describe, it, expect } from 'vitest';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
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
  });

  it('normalizes object-based arena parts with explicit positions', () => {
    const renderer = new ArenaRenderer();

    const parts = renderer._getArenaPartDefs({
      arenaParts: [
        { glb: 'assets/glb/arena/ring-steps-positioned.glb', position: [10, 0, -5] },
      ],
    });

    expect(parts).toHaveLength(1);
    expect(parts[0].glb).toBe('assets/glb/arena/ring-steps-positioned.glb');
    expect(parts[0].position.asArray()).toEqual([10, 0, -5]);
  });

  it('falls back to the legacy arenaGlb field', () => {
    const renderer = new ArenaRenderer();

    const parts = renderer._getArenaPartDefs({
      arenaGlb: 'assets/glb/arena/arena.glb',
    });

    expect(parts).toHaveLength(1);
    expect(parts[0].glb).toBe('assets/glb/arena/arena.glb');
    expect(parts[0].position.asArray()).toEqual([0, 0, 0]);
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
});
