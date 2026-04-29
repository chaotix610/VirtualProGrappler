import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MaterialManager } from '../../src/renderer/MaterialManager.js';

// ── Mock helpers ────────────────────────────────────────────────────

/** Create a mock PBR-style material with a given name. */
function mockMaterial(name) {
  return {
    name,
    albedoTexture: null,
    albedoColor: { r: 1, g: 1, b: 1 },
  };
}

/** Create a mock mesh carrying a single material. */
function mockMesh(matName) {
  return { material: mockMaterial(matName) };
}

/** Create a mock mesh with a name and cloneable material. */
function mockNamedMesh(meshName, matName = null) {
  return {
    name: meshName,
    material: {
      name: matName,
      albedoTexture: null,
      albedoColor: { r: 1, g: 1, b: 1 },
      clone(cloneName) {
        return {
          name: cloneName,
          albedoTexture: null,
          albedoColor: { r: 1, g: 1, b: 1 },
          clone: this.clone,
        };
      },
    },
  };
}

/** Create a mock mesh with a multi-material (e.g. the rope mesh). */
function mockMultiMesh(subNames) {
  return {
    material: {
      name: 'multi',
      subMaterials: subNames.map(mockMaterial),
    },
  };
}

/** Minimal mock Babylon scene that records texture creation calls. */
function mockScene() {
  const created = [];
  return {
    _createTexture(path) {
      const tex = { url: path, name: path };
      created.push(tex);
      return tex;
    },
    _createdTextures: created,
  };
}

// ── Tests ───────────────────────────────────────────────────────────

describe('MaterialManager', () => {
  /** @type {MaterialManager} */
  let mgr;

  beforeEach(() => {
    mgr = new MaterialManager();
  });

  // ─ _hexToRgb ───────────────────────────────────────────────────

  describe('_hexToRgb', () => {
    it('parses a 6-digit hex colour', () => {
      expect(mgr._hexToRgb('#FF0000')).toEqual({ r: 1, g: 0, b: 0 });
    });

    it('parses without the # prefix', () => {
      expect(mgr._hexToRgb('00FF00')).toEqual({ r: 0, g: 1, b: 0 });
    });

    it('parses a 3-digit shorthand', () => {
      expect(mgr._hexToRgb('#F00')).toEqual({ r: 1, g: 0, b: 0 });
    });

    it('parses mid-range values', () => {
      const { r, g, b } = mgr._hexToRgb('#808080');
      expect(r).toBeCloseTo(128 / 255);
      expect(g).toBeCloseTo(128 / 255);
      expect(b).toBeCloseTo(128 / 255);
    });
  });

  // ─ _buildMaterialMap ───────────────────────────────────────────

  describe('_buildMaterialMap', () => {
    it('maps single-material meshes by material name', () => {
      const meshes = [mockMesh('mat_canvas'), mockMesh('mat_post')];
      const map = mgr._buildMaterialMap(meshes);

      expect(map.size).toBe(2);
      expect(map.has('mat_canvas')).toBe(true);
      expect(map.has('mat_post')).toBe(true);
    });

    it('maps sub-materials from multi-material meshes', () => {
      const meshes = [
        mockMultiMesh(['mat_rope_top', 'mat_rope_middle', 'mat_rope_bottom']),
      ];
      const map = mgr._buildMaterialMap(meshes);

      expect(map.size).toBe(3);
      expect(map.has('mat_rope_top')).toBe(true);
      expect(map.has('mat_rope_middle')).toBe(true);
      expect(map.has('mat_rope_bottom')).toBe(true);
    });

    it('skips meshes with no material', () => {
      const meshes = [{ material: null }];
      const map = mgr._buildMaterialMap(meshes);
      expect(map.size).toBe(0);
    });
  });

  // ─ swapTexture ─────────────────────────────────────────────────

  describe('swapTexture', () => {
    it('sets albedoTexture on a PBR material', () => {
      const mat = mockMaterial('mat_canvas');
      const scene = mockScene();

      mgr.swapTexture(mat, 'assets/textures/ring/canvas_raw.png', scene);

      expect(mat.albedoTexture).not.toBeNull();
      expect(mat.albedoTexture.url).toBe('assets/textures/ring/canvas_raw.png');
    });

    it('sets diffuseTexture on a Standard material', () => {
      const mat = { name: 'std_mat', diffuseTexture: null };
      const scene = mockScene();

      mgr.swapTexture(mat, 'some/path.png', scene);

      expect(mat.diffuseTexture).not.toBeNull();
      expect(mat.diffuseTexture.url).toBe('some/path.png');
    });
  });

  // ─ setMaterialColor ────────────────────────────────────────────

  describe('setMaterialColor', () => {
    it('sets albedoColor on a PBR material', () => {
      const mat = mockMaterial('mat_rope_top');
      mgr.setMaterialColor(mat, '#FF0000');

      expect(mat.albedoColor.r).toBe(1);
      expect(mat.albedoColor.g).toBe(0);
      expect(mat.albedoColor.b).toBe(0);
    });

    it('sets diffuseColor on a Standard material', () => {
      const mat = { name: 'std', diffuseColor: { r: 1, g: 1, b: 1 } };
      mgr.setMaterialColor(mat, '#0000FF');

      expect(mat.diffuseColor.r).toBe(0);
      expect(mat.diffuseColor.g).toBe(0);
      expect(mat.diffuseColor.b).toBe(1);
    });
  });

  // ─ applyRingOverrides ──────────────────────────────────────────

  describe('applyRingOverrides', () => {
    it('calls swapTexture for non-rope overrides with a texture path', async () => {
      const meshes = [mockMesh('mat_canvas'), mockMesh('mat_apron')];
      const scene = mockScene();

      const overrides = {
        mat_canvas: 'assets/textures/ring/canvas_raw.png',
        mat_apron: 'assets/textures/ring/apron_raw.png',
      };

      const spy = vi.spyOn(mgr, 'swapTexture');
      await mgr.applyRingOverrides(meshes, overrides, scene);

      expect(spy).toHaveBeenCalledTimes(2);
      expect(spy).toHaveBeenCalledWith(
        meshes[0].material,
        'assets/textures/ring/canvas_raw.png',
        scene,
        undefined
      );
      expect(spy).toHaveBeenCalledWith(
        meshes[1].material,
        'assets/textures/ring/apron_raw.png',
        scene,
        undefined
      );
    });

    it('warns and falls back when material names are not found on any mesh', async () => {
      const meshes = [mockMesh('mat_canvas')];
      const scene = mockScene();
      const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      await mgr.applyRingOverrides(
        meshes,
        { mat_nonexistent: 'some/path.png' },
        scene
      );

      expect(spy).toHaveBeenCalledWith(
        expect.stringContaining('mat_nonexistent')
      );

      spy.mockRestore();
    });

    it('applies ropeColor to rope materials whose override is null', async () => {
      const meshes = [
        mockMultiMesh(['mat_rope_top', 'mat_rope_middle', 'mat_rope_bottom']),
      ];
      const scene = mockScene();

      const overrides = {
        mat_rope_top: null,
        mat_rope_middle: null,
        mat_rope_bottom: null,
        ropeColor: '#FF0000',
      };

      const colorSpy = vi.spyOn(mgr, 'setMaterialColor');
      await mgr.applyRingOverrides(meshes, overrides, scene);

      expect(colorSpy).toHaveBeenCalledTimes(3);
      expect(colorSpy).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'mat_rope_top' }),
        '#FF0000'
      );
    });

    it('swaps rope textures without overriding the GLB UV mapping', async () => {
      const meshes = [
        mockMultiMesh(['mat_rope_top', 'mat_rope_middle', 'mat_rope_bottom']),
      ];
      const scene = mockScene();
      const swapSpy = vi.spyOn(mgr, 'swapTexture');

      await mgr.applyRingOverrides(
        meshes,
        {
          mat_rope_top: 'assets/textures/ring/shared/rope.png',
          mat_rope_middle: 'assets/textures/ring/shared/rope.png',
          mat_rope_bottom: 'assets/textures/ring/shared/rope.png',
          ropeColor: '#FF0000',
          ropeColorOpacity: 0.4,
        },
        scene
      );

      expect(swapSpy).toHaveBeenCalledTimes(3);
      expect(swapSpy).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'mat_rope_top' }),
        'assets/textures/ring/shared/rope.png',
        scene,
        undefined
      );
    });

    it('skips null overrides on non-rope materials without error', async () => {
      const meshes = [mockMesh('mat_post')];
      const scene = mockScene();

      const swapSpy = vi.spyOn(mgr, 'swapTexture');
      const colorSpy = vi.spyOn(mgr, 'setMaterialColor');

      await mgr.applyRingOverrides(meshes, { mat_post: null }, scene);

      expect(swapSpy).not.toHaveBeenCalled();
      expect(colorSpy).not.toHaveBeenCalled();
    });

    it('handles null / undefined overrides gracefully', async () => {
      const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      await expect(mgr.applyRingOverrides([], null, {})).resolves.toBeUndefined();
      await expect(mgr.applyRingOverrides([], undefined, {})).resolves.toBeUndefined();

      spy.mockRestore();
    });

    it('falls back to mesh-name-based preview mapping when materials are unnamed', async () => {
      const meshes = [
        mockNamedMesh('canvas'),
        mockNamedMesh('apron-west'),
        mockNamedMesh('rope-east-top'),
        mockNamedMesh('ring-post-ne'),
        mockNamedMesh('turnbuckle-bolt-cover-ne-top'),
      ];
      const scene = mockScene();

      await mgr.applyRingOverrides(
        meshes,
        {
          mat_canvas: 'assets/textures/ring/canvas_raw.png',
          mat_apron: 'assets/textures/ring/apron_raw.png',
          mat_rope_top: null,
          mat_turnbuckle_bolt_cover: 'assets/textures/ring/shared/turnbuckle-bolt-cover.png',
          ropeColor: '#FF0000',
        },
        scene
      );

      expect(meshes[0].material.albedoTexture.url).toBe('assets/textures/ring/canvas_raw.png');
      expect(meshes[1].material.albedoTexture.url).toBe('assets/textures/ring/apron_raw.png');
      // rope-east-top gets the shared rope texture with wrapU=1 via fallback
      expect(meshes[2].material.albedoTexture.url).toBe('assets/textures/ring/shared/rope.png');
      expect(meshes[3].material.albedoTexture.url).toBe('assets/textures/ring/shared/post.png');
      expect(meshes[4].material.albedoTexture.url).toBe(
        'assets/textures/ring/shared/turnbuckle-bolt-cover.png'
      );
    });

    it('clones shared materials during mesh fallback so per-mesh preview overrides stay isolated', async () => {
      const sharedMaterial = {
        name: null,
        albedoTexture: null,
        albedoColor: { r: 1, g: 1, b: 1 },
        clone(cloneName) {
          return {
            name: cloneName,
            albedoTexture: null,
            albedoColor: { r: 1, g: 1, b: 1 },
            clone: this.clone,
          };
        },
      };
      const meshes = [
        { name: 'ring-platform', material: sharedMaterial },
        { name: 'rope-east-top', material: sharedMaterial },
      ];
      const scene = mockScene();

      await mgr.applyRingOverrides(
        meshes,
        {
          mat_canvas: 'assets/textures/ring/canvas_raw.png',
          mat_rope_top: null,
          ropeColor: '#FF0000',
        },
        scene
      );

      // Both meshes must have been given their own cloned material
      expect(meshes[0].material).not.toBe(sharedMaterial);
      expect(meshes[1].material).not.toBe(sharedMaterial);
      expect(meshes[0].material).not.toBe(meshes[1].material);

      // ring-platform gets the canvas texture directly via swapTexture
      expect(meshes[0].material.albedoTexture.url).toBe('assets/textures/ring/canvas_raw.png');
    });

    it('supports the canonical bolt cover material name directly', async () => {
      const meshes = [mockMesh('mat_turnbuckle_bolt_cover')];
      const scene = mockScene();

      await mgr.applyRingOverrides(
        meshes,
        { mat_turnbuckle_bolt_cover: 'assets/textures/ring/shared/turnbuckle-bolt-cover.png' },
        scene
      );

      expect(meshes[0].material.albedoTexture.url).toBe(
        'assets/textures/ring/shared/turnbuckle-bolt-cover.png'
      );
    });
  });
});
