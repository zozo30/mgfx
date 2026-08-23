import assert from "node:assert/strict";
import test from "node:test";
import { encode as encodeJpeg } from "jpeg-js";
import { PNG } from "pngjs";
import { decodeImage } from "./image-codec.js";

test("PNG decoding produces premultiplied RGBA8 pixels", () => {
  const png = new PNG({ width: 1, height: 1 });
  png.data.set([200, 100, 50, 128]);
  const image = decodeImage(PNG.sync.write(png));
  assert.deepEqual({ width: image.width, height: image.height }, { width: 1, height: 1 });
  assert.deepEqual([...image.rgba], [100, 50, 25, 128]);
});

test("JPEG decoding produces opaque RGBA8 pixels", () => {
  const encoded = encodeJpeg({ width: 1, height: 1,
    data: Buffer.from([220, 80, 30, 255]) }, 90).data;
  const image = decodeImage(encoded);
  assert.equal(image.rgba.length, 4);
  assert.equal(image.rgba[3], 255);
});

test("unknown image containers are rejected", () => {
  assert.throws(() => decodeImage(Buffer.from("not an image")), /Unsupported image format/);
});

test("SVG gradients and vector shapes rasterize through the texture fallback", () => {
  const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="20">
    <defs><linearGradient id="g"><stop stop-color="#ff8000"/><stop offset="1" stop-color="#2040ff"/></linearGradient></defs>
    <rect width="32" height="20" rx="4" fill="url(#g)"/><circle cx="16" cy="10" r="5" fill="white"/>
  </svg>`);
  const image = decodeImage(svg);
  assert.deepEqual({ width: image.width, height: image.height }, { width: 32, height: 20 });
  assert.equal(image.rgba.length, 32 * 20 * 4);
  assert.ok(image.rgba.some((value) => value !== 0));
});
