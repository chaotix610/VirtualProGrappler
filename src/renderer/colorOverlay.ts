import {
  Color3,
  Material,
  MaterialDefines,
  MaterialPluginBase,
  PBRMaterial,
  ShaderLanguage,
  StandardMaterial,
  UniformBuffer,
} from "@babylonjs/core";
import { Rgba } from "./cssColor";

/**
 * Lays a flat colour over a material, by a strength from 0 to 1.
 *
 * The other arena colours multiply: they set the albedo colour, which Babylon
 * multiplies into the texture. That tints a light texture well and does almost
 * nothing to a dark one - ring-standard-2's pads are baked near-black navy, so
 * red multiplied in came out as black with a red cast. An overlay instead
 * blends the finished albedo toward the colour, so red at full strength is red
 * whatever the texture underneath, and half strength is half-way there.
 */

const PLUGIN_NAME = "ColorOverlay";
const DEFINE = "COLOR_OVERLAY";
const UNIFORM = "colorOverlay";

/**
 * Where the blend is injected into Babylon's PBR fragment shader.
 *
 * This hook runs straight after `surfaceAlbedo` is assembled from the albedo
 * texture and colour, and before any lighting, so the overlay changes the
 * surface rather than the lit result. Exported for the test that checks the
 * installed Babylon still has it.
 */
export const OVERLAY_SHADER_HOOK = "CUSTOM_FRAGMENT_UPDATE_ALPHA";

class ColorOverlayPlugin extends MaterialPluginBase {
  /** Linear space, which is what `surfaceAlbedo` holds. */
  private readonly color = new Color3(1, 1, 1);
  private strength = 0;
  private active = false;

  constructor(material: Material) {
    super(material, PLUGIN_NAME, 200, { [DEFINE]: false });
  }

  set(rgba: Rgba): void {
    // Arena colours are authored as CSS, which is sRGB.
    new Color3(rgba.r, rgba.g, rgba.b).toLinearSpaceToRef(this.color);
    this.strength = Math.min(1, Math.max(0, rgba.a));
    const active = this.strength > 0;
    if (active !== this.active) {
      this.active = active;
      this._enable(active);
      this.markAllDefinesAsDirty();
    }
  }

  override isCompatible(shaderLanguage: ShaderLanguage): boolean {
    return shaderLanguage === ShaderLanguage.GLSL;
  }

  override prepareDefines(defines: MaterialDefines): void {
    defines[DEFINE] = this.active;
  }

  override getUniforms() {
    return {
      ubo: [{ name: UNIFORM, size: 4, type: "vec4" }],
      fragment: `#ifdef ${DEFINE}\nuniform vec4 ${UNIFORM};\n#endif\n`,
    };
  }

  override bindForSubMesh(uniformBuffer: UniformBuffer): void {
    if (!this.active) return;
    const { r, g, b } = this.color;
    uniformBuffer.updateFloat4(UNIFORM, r, g, b, this.strength);
  }

  override getCustomCode(shaderType: string) {
    if (shaderType !== "fragment") return null;
    return {
      [OVERLAY_SHADER_HOOK]:
        `#ifdef ${DEFINE}\n` +
        `surfaceAlbedo = mix(surfaceAlbedo, ${UNIFORM}.rgb, ${UNIFORM}.a);\n` +
        `#endif\n`,
    };
  }

  override getClassName(): string {
    return "ColorOverlayPlugin";
  }
}

/**
 * Overlays `rgba` on a material, alpha being the strength.
 *
 * GLB materials import as PBR and get the shader plugin, reused if an earlier
 * load already attached one. A StandardMaterial built in code has no texture
 * pass to hook, so its diffuse colour is blended directly instead.
 */
export function applyColorOverlay(material: Material, rgba: Rgba): void {
  if (material instanceof PBRMaterial) {
    const existing = material.pluginManager?.getPlugin<ColorOverlayPlugin>(PLUGIN_NAME);
    (existing ?? new ColorOverlayPlugin(material)).set(rgba);
  } else if (material instanceof StandardMaterial) {
    const target = new Color3(rgba.r, rgba.g, rgba.b);
    material.diffuseColor = Color3.Lerp(material.diffuseColor, target, rgba.a);
  }
}
