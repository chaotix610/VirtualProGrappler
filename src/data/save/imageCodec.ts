import type { DecodedImage, ImageCodec } from "./images";
import type { ImageMime } from "./types";

/** Re-encoding quality for photos. PNG is lossless and ignores it. */
const JPEG_QUALITY = 0.92;

interface Bitmap extends DecodedImage { bitmap: ImageBitmap }

/** Browser decoding/encoding for imports and restore checks. Kept out of the pure image module. */
export const browserCodec: ImageCodec<Bitmap> = {
  async decode(blob) {
    const bitmap = await createImageBitmap(blob, { imageOrientation: "from-image" });
    return { bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
  },

  async encode(image, width, height, mime: ImageMime) {
    const offscreen = typeof OffscreenCanvas !== "undefined";
    const canvas = offscreen ? new OffscreenCanvas(width, height) : Object.assign(document.createElement("canvas"), { width, height });
    const context = canvas.getContext("2d") as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
    if (!context) throw new Error("This browser cannot process images.");
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(image.bitmap, 0, 0, width, height);
    const quality = mime === "image/jpeg" ? JPEG_QUALITY : undefined;
    const blob = canvas instanceof HTMLCanvasElement
      ? await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, mime, quality))
      : await canvas.convertToBlob({ type: mime, quality });
    // A browser that cannot encode the type falls back to PNG; the caller checks the bytes as well.
    if (!blob || blob.type !== mime) throw new Error("This browser cannot encode the imported image.");
    return blob;
  },
};
