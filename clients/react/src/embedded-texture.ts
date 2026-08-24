import { createHash } from "node:crypto";
import { decodeImage } from "./image-codec.js";

export interface EmbeddedTexture {
  readonly resourceId: number;
  readonly width: number;
  readonly height: number;
  readonly rgba: Buffer;
}

const textures = new Map<string, EmbeddedTexture>();
let nextTextureId = 0x4000_0000;

export function embeddedTexture(dataUrl: string): EmbeddedTexture {
  if (dataUrl.length > 44 * 1024 * 1024) throw new RangeError("Embedded SVG image exceeds 32 MiB");
  const match = dataUrl.match(/^data:image\/(png|jpeg);base64,([A-Za-z0-9+/=\s]+)$/i);
  if (!match) throw new Error("SVG image requires an embedded base64 PNG or JPEG data URL");
  const bytes = Buffer.from(match[2]!.replace(/\s+/g, ""), "base64");
  if (bytes.length === 0 || bytes.length > 32 * 1024 * 1024)
    throw new RangeError("Embedded SVG image must contain 1 byte through 32 MiB");
  const key = createHash("sha256").update(bytes).digest("hex");
  const cached = textures.get(key);
  if (cached) return cached;
  const decoded = decodeImage(bytes);
  const texture = { resourceId: nextTextureId++, ...decoded };
  textures.set(key, texture);
  return texture;
}
