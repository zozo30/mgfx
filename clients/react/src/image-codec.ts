import { readFile } from "node:fs/promises";
import { Resvg } from "@resvg/resvg-js";
import { decode as decodeJpeg } from "jpeg-js";
import { PNG } from "pngjs";

export interface DecodedImage {
  readonly width: number;
  readonly height: number;
  readonly rgba: Buffer;
}

const maximumFileBytes = 32 * 1024 * 1024;
const maximumDimension = 4096;

export async function decodeImageFile(path: string): Promise<DecodedImage> {
  const bytes = await readFile(path);
  if (bytes.length > maximumFileBytes) throw new RangeError("Image file exceeds 32 MiB");
  return decodeImage(bytes);
}

export function decodeImage(bytes: Uint8Array): DecodedImage {
  const source = Buffer.from(bytes);
  let decoded: { width: number; height: number; data: Uint8Array };
  if (source.length >= 24 && source.toString("hex", 0, 8) === "89504e470d0a1a0a") {
    const width = source.readUInt32BE(16), height = source.readUInt32BE(20);
    validateDimensions(width, height);
    decoded = PNG.sync.read(source);
  } else if (source.length >= 2 && source[0] === 0xff && source[1] === 0xd8) {
    decoded = decodeJpeg(source, { useTArray: true, formatAsRGBA: true,
      maxResolutionInMP: 17, maxMemoryUsageInMB: 96 });
  } else if (/^\s*(?:<\?xml[^>]*>\s*)?<svg[\s>]/i.test(source.toString("utf8", 0, 512))) {
    decoded = renderSvg(source);
  } else {
    throw new Error("Unsupported image format; expected PNG, JPEG, or SVG");
  }
  validateDimensions(decoded.width, decoded.height);
  if (decoded.data.length !== decoded.width * decoded.height * 4)
    throw new Error("Decoder did not produce tightly packed RGBA8 pixels");
  const rgba = premultiply(Buffer.from(decoded.data));
  return { width: decoded.width, height: decoded.height, rgba };
}

function renderSvg(source: Buffer): { width: number; height: number; data: Buffer } {
  const usesText = /<(?:text|tspan)\b/i.test(source.toString("utf8"));
  const probe = new Resvg(source, { fitTo: { mode: "original" },
    font: { loadSystemFonts: false }, logLevel: "off" });
  if (!Number.isFinite(probe.width) || !Number.isFinite(probe.height) ||
      probe.width <= 0 || probe.height <= 0) throw new Error("SVG has no drawable dimensions");
  const maximumRenderedDimension = 2048;
  const fitTo = probe.width >= probe.height
    ? { mode: "width" as const, value: Math.min(probe.width, maximumRenderedDimension) }
    : { mode: "height" as const, value: Math.min(probe.height, maximumRenderedDimension) };
  const renderer = new Resvg(source, { fitTo, shapeRendering: 2, textRendering: 1,
    imageRendering: 0, font: { loadSystemFonts: usesText }, logLevel: "off" });
  const externalImages = renderer.imagesToResolve().filter((href) => !href.startsWith("data:"));
  if (externalImages.length > 0) throw new Error("SVG external image references are not allowed");
  const rendered = renderer.render();
  validateDimensions(rendered.width, rendered.height);
  return { width: rendered.width, height: rendered.height, data: rendered.pixels };
}

function premultiply(rgba: Buffer): Buffer {
  for (let offset = 0; offset < rgba.length; offset += 4) {
    const alpha = rgba[offset + 3]!;
    rgba[offset] = Math.round(rgba[offset]! * alpha / 255);
    rgba[offset + 1] = Math.round(rgba[offset + 1]! * alpha / 255);
    rgba[offset + 2] = Math.round(rgba[offset + 2]! * alpha / 255);
  }
  return rgba;
}

function validateDimensions(width: number, height: number): void {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) ||
      width <= 0 || height <= 0 || width > maximumDimension || height > maximumDimension)
    throw new RangeError("Image dimensions must be from 1×1 through 4096×4096");
}
