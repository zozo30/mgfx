import type { Socket } from "node:net";

export const MAX_PAYLOAD_BYTES = 64 * 1024 * 1024;
const MGIP_HEADER_BYTES = 16;
const MGFX_HEADER_BYTES = 16;
const COMMAND_HEADER_BYTES = 8;

export enum MessageType {
  Frame = 1,
  Resize = 2,
  PointerDown = 3,
  Close = 4,
  PointerMove = 5,
  PointerUp = 6,
  KeyDown = 7,
  KeyUp = 8,
  Scroll = 9,
  TextInput = 10,
  WindowTitle = 11,
  WindowConfig = 12,
  WindowState = 13,
  ServerHello = 14,
  FramePresented = 15,
  RequestAnimationFrame = 16,
  AnimationFrame = 17,
  WindowCursor = 18,
  ClipboardWrite = 19,
  ClipboardRead = 20,
  ClipboardText = 21,
  WindowChrome = 22,
  WindowChromeMetrics = 23,
  TextureCreate = 24,
  TextureDestroy = 25,
  PathCreate = 26,
  PathDestroy = 27,
  TextMeasure = 28,
  TextMetrics = 29,
}

export enum GraphicsBackend { Metal = 1, Vulkan = 2, DirectX = 3 }
export enum ServerCapability {
  ClientWindowLifecycle = 1 << 0,
  PointerInput = 1 << 1,
  KeyboardInput = 1 << 2,
  TextInput = 1 << 3,
  ScrollInput = 1 << 4,
  FramePresentation = 1 << 5,
  AnimationFrameClock = 1 << 6,
  ClientCursor = 1 << 7,
  Clipboard = 1 << 8,
  ClientWindowChrome = 1 << 9,
  TextureResources = 1 << 10,
  PathResources = 1 << 11,
  NativeTextMetrics = 1 << 12,
  TransformStack = 1 << 13,
  OpacityStack = 1 << 14,
}
export interface ServerHello {
  readonly version: number;
  readonly backend: GraphicsBackend;
  readonly capabilities: number;
}

export enum Key {
  Unknown = 0, Tab = 1, Enter = 2, Space = 3, Escape = 4,
  ArrowLeft = 5, ArrowRight = 6, ArrowUp = 7, ArrowDown = 8,
  Backspace = 9,
  Copy = 10, Cut = 11, Paste = 12,
  SelectAll = 13,
}

export enum KeyModifier {
  Shift = 1 << 0, Control = 1 << 1, Alt = 1 << 2, Command = 1 << 3,
}

export interface KeyEvent {
  readonly key: Key;
  readonly modifiers: number;
  readonly repeat: boolean;
}

export interface ScrollEvent {
  readonly x: number; readonly y: number; readonly deltaX: number; readonly deltaY: number;
}

export interface WindowConfig {
  readonly width: number; readonly height: number;
  readonly minimumWidth: number; readonly minimumHeight: number;
}
export type WindowMode = "normal" | "maximized" | "fullscreen";
export interface WindowState { readonly mode: WindowMode; readonly resizable: boolean }
export type CursorShape = "arrow" | "pointer" | "text" | "crosshair" |
  "resize-horizontal" | "resize-vertical";
export type WindowChromeMode = "native" | "overlay";
export interface WindowChromeMetrics {
  readonly leadingInset: number;
  readonly titleBarHeight: number;
}

export interface Message {
  readonly type: MessageType;
  readonly sequence: number;
  readonly payload: Buffer;
}

export interface Color {
  readonly red: number;
  readonly green: number;
  readonly blue: number;
  readonly alpha: number;
}

export interface Vertex {
  readonly x: number;
  readonly y: number;
  readonly color: Color;
}

export interface ClipRect {
  readonly left: number; readonly top: number; readonly right: number; readonly bottom: number;
}
export interface AffineTransform {
  readonly m11: number; readonly m12: number; readonly m21: number; readonly m22: number;
  readonly translateX: number; readonly translateY: number;
}

export type PathSegment =
  { readonly verb: "move" | "line"; readonly x: number; readonly y: number } |
  { readonly verb: "cubic"; readonly x1: number; readonly y1: number;
    readonly x2: number; readonly y2: number; readonly x: number; readonly y: number } |
  { readonly verb: "close" };

export interface PathPaint {
  readonly fill?: Color;
  readonly fillGradient?: {
    readonly start: { readonly x: number; readonly y: number };
    readonly end: { readonly x: number; readonly y: number };
    readonly startColor: Color;
    readonly endColor: Color;
  };
  readonly stroke?: Color;
  readonly strokeWidth?: number;
  readonly tolerance?: number;
  readonly fillRule?: "nonzero" | "evenodd";
  readonly lineCap?: "butt" | "round";
  readonly lineJoin?: "bevel" | "round";
}

export type FontFamily = "system" | "monospace";
export type FontWeight = "regular" | "bold";

export function encodeTextMeasure(family: FontFamily, text: string,
  weight: FontWeight = "regular"): Buffer {
  const utf8 = Buffer.from(text, "utf8");
  if (utf8.length === 0 || utf8.length > 65536 || utf8.includes(0))
    throw new RangeError("Text measurement requires 1 through 65536 non-NUL UTF-8 bytes");
  const payload = Buffer.alloc(4 + utf8.length);
  payload.writeUInt8(family === "monospace" ? 1 : 0, 0);
  payload.writeUInt8(weight === "bold" ? 1 : 0, 1);
  utf8.copy(payload, 4);
  return payload;
}

export function decodeTextMetrics(payload: Buffer): number {
  if (payload.length !== 4) throw new Error("TextMetrics payload must be 4 bytes");
  const advance = payload.readFloatLE(0);
  if (!Number.isFinite(advance) || advance < 0) throw new Error("Invalid text advance");
  return advance;
}

export class TextMetricsClient {
  private nextSequence = 1;
  private readonly pending = new Map<number, {
    resolve: (advance: number) => void; reject: (error: Error) => void;
  }>();

  constructor(private readonly sendRequest: (payload: Buffer, sequence: number) => void) {}

  measure(family: FontFamily, text: string, weight: FontWeight = "regular"): Promise<number> {
    const payload = encodeTextMeasure(family, text, weight);
    const sequence = this.nextSequence;
    this.nextSequence = sequence === 0xffff_ffff ? 1 : sequence + 1;
    this.sendRequest(payload, sequence);
    return new Promise<number>((resolve, reject) => {
      this.pending.set(sequence, { resolve, reject });
    });
  }

  receive(sequence: number, advance: number): void {
    const request = this.pending.get(sequence);
    if (!request) return;
    this.pending.delete(sequence);
    request.resolve(advance);
  }

  close(error = new Error("MGFX text-metrics connection closed")): void {
    for (const request of this.pending.values()) request.reject(error);
    this.pending.clear();
  }
}

export function encodeTextureCreate(id: number, width: number, height: number,
  rgba: Uint8Array): Buffer {
  if (!Number.isSafeInteger(id) || id <= 0 || id > 0xffff_ffff ||
      !Number.isSafeInteger(width) || !Number.isSafeInteger(height) ||
      width <= 0 || height <= 0 || width > 4096 || height > 4096 ||
      rgba.byteLength !== width * height * 4) {
    throw new RangeError("Texture must have a nonzero ID and valid RGBA8 dimensions");
  }
  const payload = Buffer.alloc(16 + rgba.byteLength);
  payload.writeUInt32LE(id, 0); payload.writeUInt32LE(width, 4);
  payload.writeUInt32LE(height, 8); Buffer.from(rgba).copy(payload, 16);
  return payload;
}

export function encodePathCreate(id: number, segments: readonly PathSegment[]): Buffer {
  if (!Number.isSafeInteger(id) || id <= 0 || id > 0xffff_ffff ||
      segments.length === 0 || segments.length > 65_536) {
    throw new RangeError("Path must have a nonzero ID and 1 through 65536 segments");
  }
  const payload = Buffer.alloc(16 + segments.length * 28);
  payload.writeUInt32LE(id, 0); payload.writeUInt32LE(segments.length, 4);
  segments.forEach((segment, index) => {
    const offset = 16 + index * 28;
    const values = segment.verb === "cubic"
      ? [segment.x1, segment.y1, segment.x2, segment.y2, segment.x, segment.y]
      : segment.verb === "close" ? [] : [segment.x, segment.y];
    const verbs = { move: 1, line: 2, cubic: 3, close: 4 } as const;
    payload.writeUInt8(verbs[segment.verb], offset);
    values.forEach((value, valueIndex) => {
      if (!Number.isFinite(value)) throw new RangeError("Path coordinates must be finite");
      payload.writeFloatLE(value, offset + 4 + valueIndex * 4);
    });
  });
  return payload;
}

export function encodeResourceId(id: number): Buffer {
  if (!Number.isSafeInteger(id) || id <= 0 || id > 0xffff_ffff)
    throw new RangeError("Resource ID must be a nonzero u32");
  const payload = Buffer.alloc(4); payload.writeUInt32LE(id); return payload;
}

export class MessageParser {
  private pending = Buffer.alloc(0);

  push(chunk: Uint8Array): Message[] {
    this.pending = Buffer.concat([this.pending, Buffer.from(chunk)]);
    const messages: Message[] = [];

    while (this.pending.length >= MGIP_HEADER_BYTES) {
      if (this.pending.toString("ascii", 0, 4) !== "MGIP") {
        throw new Error("Invalid MGIP magic");
      }
      const version = this.pending.readUInt16LE(4);
      if (version !== 1) {
        throw new Error(`Unsupported MGIP version ${version}`);
      }
      const payloadBytes = this.pending.readUInt32LE(8);
      if (payloadBytes > MAX_PAYLOAD_BYTES) {
        throw new Error(`MGIP payload exceeds ${MAX_PAYLOAD_BYTES} bytes`);
      }
      const messageBytes = MGIP_HEADER_BYTES + payloadBytes;
      if (this.pending.length < messageBytes) {
        return messages;
      }

      messages.push({
        type: this.pending.readUInt16LE(6) as MessageType,
        sequence: this.pending.readUInt32LE(12),
        payload: Buffer.from(this.pending.subarray(MGIP_HEADER_BYTES, messageBytes)),
      });
      this.pending = Buffer.from(this.pending.subarray(messageBytes));
    }
    return messages;
  }
}

export function encodeMessage(
  type: MessageType,
  payload: Uint8Array = Buffer.alloc(0),
  sequence = 0,
): Buffer {
  if (payload.byteLength > MAX_PAYLOAD_BYTES) {
    throw new RangeError(`MGIP payload exceeds ${MAX_PAYLOAD_BYTES} bytes`);
  }
  const message = Buffer.alloc(MGIP_HEADER_BYTES + payload.byteLength);
  message.write("MGIP", 0, "ascii");
  message.writeUInt16LE(1, 4);
  message.writeUInt16LE(type, 6);
  message.writeUInt32LE(payload.byteLength, 8);
  message.writeUInt32LE(sequence >>> 0, 12);
  Buffer.from(payload).copy(message, MGIP_HEADER_BYTES);
  return message;
}

export function sendMessage(
  socket: Socket,
  type: MessageType,
  payload: Uint8Array = Buffer.alloc(0),
  sequence = 0,
): void {
  socket.write(encodeMessage(type, payload, sequence));
}

export class FramePacer {
  private inFlightSequence: number | undefined;
  private pending: Buffer | undefined;
  private nextSequence = 1;

  constructor(private readonly send: (frame: Buffer, sequence: number) => void) {}

  submit(frame: Buffer): void {
    if (this.inFlightSequence !== undefined) {
      this.pending = frame;
      return;
    }
    this.dispatch(frame);
  }

  presented(sequence: number): void {
    if (sequence !== this.inFlightSequence) return;
    this.inFlightSequence = undefined;
    const next = this.pending;
    this.pending = undefined;
    if (next) this.dispatch(next);
  }

  private dispatch(frame: Buffer): void {
    const sequence = this.nextSequence;
    this.nextSequence = sequence === 0xffff_ffff ? 1 : sequence + 1;
    this.inFlightSequence = sequence;
    this.send(frame, sequence);
  }
}

export class AnimationClock {
  private readonly callbacks = new Map<number, (milliseconds: number) => void>();
  private nextCallbackId = 1;
  private nextSequence = 1;
  private pendingSequence: number | undefined;
  private originNanoseconds: bigint | undefined;

  constructor(private readonly requestNativeFrame: (sequence: number) => void) {}

  request(callback: (milliseconds: number) => void): () => void {
    const callbackId = this.nextCallbackId++;
    this.callbacks.set(callbackId, callback);
    if (this.pendingSequence === undefined) {
      this.pendingSequence = this.nextSequence;
      this.nextSequence = this.nextSequence === 0xffff_ffff ? 1 : this.nextSequence + 1;
      this.requestNativeFrame(this.pendingSequence);
    }
    return () => { this.callbacks.delete(callbackId); };
  }

  receive(sequence: number, nanoseconds: bigint): void {
    if (sequence !== this.pendingSequence) return;
    this.pendingSequence = undefined;
    this.originNanoseconds ??= nanoseconds;
    const milliseconds = Number(nanoseconds - this.originNanoseconds) / 1_000_000;
    const callbacks = [...this.callbacks.values()];
    this.callbacks.clear();
    for (const callback of callbacks) callback(milliseconds);
  }
}

export class ClipboardClient {
  private readonly pending = new Map<number, {
    resolve: (text: string) => void;
    reject: (error: Error) => void;
  }>();
  private nextSequence = 1;

  constructor(private readonly sendWrite: (text: Buffer) => void,
              private readonly sendRead: (sequence: number) => void) {}

  write(text: string): void {
    const encoded = encodeText(text);
    if (encoded.length > 1024 * 1024) throw new RangeError("Clipboard text exceeds 1 MiB");
    this.sendWrite(encoded);
  }

  read(): Promise<string> {
    const sequence = this.nextSequence;
    this.nextSequence = sequence === 0xffff_ffff ? 1 : sequence + 1;
    this.sendRead(sequence);
    return new Promise<string>((resolve, reject) => {
      this.pending.set(sequence, { resolve, reject });
    });
  }

  receive(sequence: number, text: string): void {
    const request = this.pending.get(sequence);
    if (!request) return;
    this.pending.delete(sequence);
    request.resolve(text);
  }

  close(error = new Error("MGFX clipboard connection closed")): void {
    for (const request of this.pending.values()) request.reject(error);
    this.pending.clear();
  }
}

export function decodeSize(payload: Buffer): { width: number; height: number } {
  if (payload.length !== 8) throw new Error("Resize payload must be 8 bytes");
  return { width: payload.readUInt32LE(0), height: payload.readUInt32LE(4) };
}

export function decodeWindowChromeMetrics(payload: Buffer): WindowChromeMetrics {
  const point = decodePoint(payload);
  return { leadingInset: point.x, titleBarHeight: point.y };
}

export function decodeServerHello(payload: Buffer): ServerHello {
  if (payload.length !== 8) throw new Error("ServerHello payload must be 8 bytes");
  const backend = payload.readUInt16LE(2);
  if (backend < GraphicsBackend.Metal || backend > GraphicsBackend.DirectX) {
    throw new Error(`Unknown graphics backend ${backend}`);
  }
  return {
    version: payload.readUInt16LE(0),
    backend: backend as GraphicsBackend,
    capabilities: payload.readUInt32LE(4),
  };
}

export function decodeAnimationTime(payload: Buffer): bigint {
  if (payload.length !== 8) throw new Error("AnimationFrame payload must be 8 bytes");
  return payload.readBigUInt64LE(0);
}

export function decodePoint(payload: Buffer): { x: number; y: number } {
  if (payload.length !== 8) throw new Error("Pointer payload must be 8 bytes");
  return { x: payload.readFloatLE(0), y: payload.readFloatLE(4) };
}

export function decodeKey(payload: Buffer): KeyEvent {
  if (payload.length !== 8) throw new Error("Key payload must be 8 bytes");
  return { key: payload.readUInt16LE(0) as Key, modifiers: payload.readUInt16LE(2),
    repeat: payload.readUInt32LE(4) !== 0 };
}

export function decodeScroll(payload: Buffer): ScrollEvent {
  if (payload.length !== 16) throw new Error("Scroll payload must be 16 bytes");
  return { x: payload.readFloatLE(0), y: payload.readFloatLE(4),
    deltaX: payload.readFloatLE(8), deltaY: payload.readFloatLE(12) };
}

export function decodeText(payload: Buffer): string {
  return new TextDecoder("utf-8", { fatal: true }).decode(payload);
}

export function encodeText(value: string): Buffer {
  return Buffer.from(value, "utf8");
}

export function encodeWindowConfig(config: WindowConfig): Buffer {
  for (const value of [config.width, config.height, config.minimumWidth, config.minimumHeight]) {
    if (!Number.isSafeInteger(value) || value < 0 || value > 0xffff_ffff) {
      throw new RangeError("Window dimensions must be unsigned 32-bit integers");
    }
  }
  const payload = Buffer.alloc(16);
  payload.writeUInt32LE(config.width, 0); payload.writeUInt32LE(config.height, 4);
  payload.writeUInt32LE(config.minimumWidth, 8); payload.writeUInt32LE(config.minimumHeight, 12);
  return payload;
}

export function encodeWindowState(state: WindowState): Buffer {
  const modes: Record<WindowMode, number> = { normal: 0, maximized: 1, fullscreen: 2 };
  return Buffer.from([modes[state.mode], state.resizable ? 1 : 0, 0, 0]);
}

export function encodeCursor(cursor: CursorShape): Buffer {
  const cursors: Record<CursorShape, number> = {
    arrow: 0, pointer: 1, text: 2, crosshair: 3,
    "resize-horizontal": 4, "resize-vertical": 5,
  };
  return Buffer.from([cursors[cursor], 0, 0, 0]);
}

export function encodeWindowChrome(mode: WindowChromeMode, draggableHeight: number): Buffer {
  if (!Number.isSafeInteger(draggableHeight) || draggableHeight < 0 || draggableHeight > 512) {
    throw new RangeError("Draggable title height must be an integer from 0 through 512");
  }
  const payload = Buffer.alloc(8);
  payload.writeUInt8(mode === "overlay" ? 1 : 0, 0);
  payload.writeUInt32LE(draggableHeight, 4);
  return payload;
}

export class FrameEncoder {
  private readonly commands: Buffer[] = [];

  clear(color: Color): void {
    const payload = Buffer.alloc(16);
    payload.writeFloatLE(color.red, 0);
    payload.writeFloatLE(color.green, 4);
    payload.writeFloatLE(color.blue, 8);
    payload.writeFloatLE(color.alpha, 12);
    this.command(1, payload);
  }

  triangles(vertices: readonly Vertex[]): void {
    if (vertices.length % 3 !== 0) {
      throw new RangeError("Triangle-list vertex count must be divisible by three");
    }
    const payload = Buffer.alloc(8 + vertices.length * 24);
    payload.writeUInt8(1, 0); // triangleList
    payload.writeUInt32LE(vertices.length, 4);
    vertices.forEach((vertex, index) => {
      const offset = 8 + index * 24;
      payload.writeFloatLE(vertex.x, offset);
      payload.writeFloatLE(vertex.y, offset + 4);
      payload.writeFloatLE(vertex.color.red, offset + 8);
      payload.writeFloatLE(vertex.color.green, offset + 12);
      payload.writeFloatLE(vertex.color.blue, offset + 16);
      payload.writeFloatLE(vertex.color.alpha, offset + 20);
    });
    this.command(2, payload);
  }

  image(textureId: number, destination: ClipRect, uv: ClipRect = {
    left: 0, top: 0, right: 1, bottom: 1,
  }, tint: Color = { red: 1, green: 1, blue: 1, alpha: 1 }): void {
    if (!Number.isSafeInteger(textureId) || textureId <= 0 || textureId > 0xffff_ffff)
      throw new RangeError("Image texture ID must be a nonzero u32");
    const payload = Buffer.alloc(56);
    payload.writeUInt32LE(textureId, 0);
    [destination.left, destination.top, destination.right, destination.bottom,
      uv.left, uv.top, uv.right, uv.bottom,
      tint.red, tint.green, tint.blue, tint.alpha]
      .forEach((value, index) => payload.writeFloatLE(value, 8 + index * 4));
    this.command(6, payload);
  }

  path(pathId: number, destination: ClipRect,
    viewBox: { readonly x: number; readonly y: number; readonly width: number; readonly height: number },
    paint: PathPaint): void {
    if (!Number.isSafeInteger(pathId) || pathId <= 0 || pathId > 0xffff_ffff ||
        (!paint.fill && !paint.fillGradient && !paint.stroke))
      throw new RangeError("Path draw requires an ID and paint");
    const payload = Buffer.alloc(128);
    payload.writeUInt32LE(pathId, 0);
    payload.writeUInt8((paint.fill || paint.fillGradient ? 1 : 0) |
      (paint.stroke ? 2 : 0) | (paint.fillGradient ? 4 : 0), 4);
    payload.writeUInt8(paint.fillRule === "evenodd" ? 1 : 0, 5);
    payload.writeUInt8(paint.lineCap === "round" ? 1 : 0, 6);
    payload.writeUInt8(paint.lineJoin === "round" ? 1 : 0, 7);
    payload.writeFloatLE(paint.strokeWidth ?? 0, 8);
    payload.writeFloatLE(paint.tolerance ?? 0.75, 12);
    [destination.left, destination.top, destination.right, destination.bottom,
      viewBox.x, viewBox.y, viewBox.width, viewBox.height,
      ...(paint.fill ? [paint.fill.red, paint.fill.green, paint.fill.blue, paint.fill.alpha]
        : [0, 0, 0, 0]),
      ...(paint.stroke ? [paint.stroke.red, paint.stroke.green, paint.stroke.blue, paint.stroke.alpha]
        : [0, 0, 0, 0]),
      ...(paint.fillGradient ? [paint.fillGradient.start.x, paint.fillGradient.start.y,
        paint.fillGradient.end.x, paint.fillGradient.end.y,
        paint.fillGradient.startColor.red, paint.fillGradient.startColor.green,
        paint.fillGradient.startColor.blue, paint.fillGradient.startColor.alpha,
        paint.fillGradient.endColor.red, paint.fillGradient.endColor.green,
        paint.fillGradient.endColor.blue, paint.fillGradient.endColor.alpha]
        : Array.from({ length: 12 }, () => 0))]
      .forEach((value, index) => {
        if (!Number.isFinite(value)) throw new RangeError("Path draw values must be finite");
        payload.writeFloatLE(value, 16 + index * 4);
      });
    this.command(7, payload);
  }

  systemText(text: string, left: number, top: number, fontSize: number,
    color: Color, family: FontFamily = "system", weight: FontWeight = "regular"): void {
    const utf8 = Buffer.from(text, "utf8");
    if (utf8.length === 0 || utf8.length > 65536 || utf8.includes(0))
      throw new RangeError("System text must contain 1 through 65536 non-NUL UTF-8 bytes");
    const payload = Buffer.alloc(32 + utf8.length);
    payload.writeUInt8(family === "monospace" ? 1 : 0, 0);
    payload.writeUInt8(weight === "bold" ? 1 : 0, 1);
    [left, top, fontSize, color.red, color.green, color.blue, color.alpha]
      .forEach((value, index) => {
        if (!Number.isFinite(value)) throw new RangeError("System text values must be finite");
        payload.writeFloatLE(value, 4 + index * 4);
      });
    utf8.copy(payload, 32);
    this.command(8, payload);
  }

  endFrame(): void {
    this.command(3, Buffer.alloc(0));
  }

  pushClip(clip: ClipRect): void {
    const payload = Buffer.alloc(16);
    payload.writeFloatLE(clip.left, 0); payload.writeFloatLE(clip.top, 4);
    payload.writeFloatLE(clip.right, 8); payload.writeFloatLE(clip.bottom, 12);
    this.command(4, payload);
  }

  popClip(): void { this.command(5, Buffer.alloc(0)); }

  pushTransform(transform: AffineTransform): void {
    const values = [transform.m11, transform.m12, transform.m21, transform.m22,
      transform.translateX, transform.translateY];
    if (values.some((value) => !Number.isFinite(value)))
      throw new RangeError("Affine transform values must be finite");
    const payload = Buffer.alloc(24);
    values.forEach((value, index) => payload.writeFloatLE(value, index * 4));
    this.command(9, payload);
  }

  popTransform(): void { this.command(10, Buffer.alloc(0)); }

  pushOpacity(opacity: number): void {
    if (!Number.isFinite(opacity) || opacity < 0 || opacity > 1)
      throw new RangeError("Opacity must be finite and between zero and one");
    const payload = Buffer.alloc(4); payload.writeFloatLE(opacity);
    this.command(11, payload);
  }

  popOpacity(): void { this.command(12, Buffer.alloc(0)); }

  finish(): Buffer {
    const byteCount = MGFX_HEADER_BYTES + this.commands.reduce((sum, item) => sum + item.length, 0);
    const header = Buffer.alloc(MGFX_HEADER_BYTES);
    header.write("MGFX", 0, "ascii");
    header.writeUInt16LE(1, 4);
    header.writeUInt32LE(byteCount, 8);
    header.writeUInt32LE(this.commands.length, 12);
    return Buffer.concat([header, ...this.commands], byteCount);
  }

  private command(opcode: number, payload: Buffer): void {
    const header = Buffer.alloc(COMMAND_HEADER_BYTES);
    header.writeUInt16LE(opcode, 0);
    header.writeUInt32LE(payload.length, 4);
    this.commands.push(Buffer.concat([header, payload]));
  }
}
