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
    it('calls swapTexture for each override with a texture path', () => {
      const meshes = [mockMesh('mat_canvas'), mockMesh('mat_apron')];
      const scene = mockScene();

      const overrides = {
        mat_canvas: 'assets/textures/ring/canvas_raw.png',
        mat_apron: 'assets/textures/ring/apron_raw.png',
      };

      const spy = vi.spyOn(mgr, 'swapTexture');
      mgr.applyRingOverrides(meshes, overrides, scene);

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

    it('warns and skips materials not found on any mesh', () => {
      const meshes = [mockMesh('mat_canvas')];
      const scene = mockScene();
      const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      mgr.applyRingOverrides(
        meshes,
        { mat_nonexistent: 'some/path.png' },
        scene
      );

      expect(spy).toHaveBeenCalledWith(
        expect.stringContaining('mat_nonexistent')
      );

      spy.mockRestore();
    });

    it('applies ropeColor to rope materials whose override is null', () => {
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
      mgr.applyRingOverrides(meshes, overrides, scene);

      expect(colorSpy).toHaveBeenCalledTimes(3);
      expect(colorSpy).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'mat_rope_top' }),
        '#FF0000'
      );
    });

    it('skips null overrides on non-rope materials without error', () => {
      const meshes = [mockMesh('mat_post')];
      const scene = mockScene();

      const swapSpy = vi.spyOn(mgr, 'swapTexture');
      const colorSpy = vi.spyOn(mgr, 'setMaterialColor');

      mgr.applyRingOverrides(meshes, { mat_post: null }, scene);

      expect(swapSpy).not.toHaveBeenCalled();
      expect(colorSpy).not.toHaveBeenCalled();
    });

    it('handles null / undefined overrides gracefully', () => {
      const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      expect(() => mgr.applyRingOverrides([], null, {})).not.toThrow();
      expect(() => mgr.applyRingOverrides([], undefined, {})).not.toThrow();

      spy.mockRestore();
    });
  });
});
