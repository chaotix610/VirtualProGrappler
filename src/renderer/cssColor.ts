/**
 * Parses the CSS colours used by the `*Color` keys in data/arenas/*.json.
 *
 * Kept apart from the renderer so it can be tested without loading Babylon.
 * Only the forms the schema's `css_color` allows are handled; alpha is parsed
 * but discarded, since these drive material colours rather than blending.
 */

export interface Rgb {
  /** 0-1, as Babylon's colour types expect. */
  r: number;
  g: number;
  b: number;
}

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
const RGB = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*([\d.]+)\s*)?\)$/i;

/** Returns null for anything unparseable, so callers can leave the material be. */
export function cssColorToRgb(cssColor: string): Rgb | null {
  if (typeof cssColor !== "string") return null;
  const value = cssColor.trim();

  const hex = value.match(HEX);
  if (hex) {
    const digits = hex[1];
    const full =
      digits.length === 3
        ? digits
            .split("")
            .map((c) => c + c)
            .join("")
        : digits;
    const n = parseInt(full, 16);
    return {
      r: ((n >> 16) & 255) / 255,
      g: ((n >> 8) & 255) / 255,
      b: (n & 255) / 255,
    };
  }

  const rgb = value.match(RGB);
  if (!rgb) return null;

  const channel = (raw: string): number | null => {
    const n = Number(raw);
    // Out-of-range channels mean the value was authored wrongly; refusing it
    // is better than silently clamping a typo into a plausible colour.
    return n >= 0 && n <= 255 ? n / 255 : null;
  };

  const r = channel(rgb[1]);
  const g = channel(rgb[2]);
  const b = channel(rgb[3]);
  if (r === null || g === null || b === null) return null;

  return { r, g, b };
}
