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
  MeshCreate = 30,
  MeshDestroy = 31,
  FontCreate = 32,
  FontDestroy = 33,
  ServerCapabilities = 34,
  ResourceStatus = 35,
  ResourceTrace = 36,
  ServerCapabilityWord = 37,
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
  SoftShadows = 1 << 15,
  RadialGradients = 1 << 16,
  RoundedRectangles = 1 << 17,
  Circles = 1 << 18,
  DiagonalPatterns = 1 << 19,
  LinearGradients = 1 << 20,
  ImageSurfaces = 1 << 21,
  DotGrids = 1 << 22,
  WaveDots = 1 << 23,
  MeshResources = 1 << 24,
  ConicGradients = 1 << 25,
  TypographyStyles = 1 << 26,
  TextLetterSpacing = 1 << 27,
  TextDecorations = 1 << 28,
  PortableFontFamilies = 1 << 29,
  FontResources = 1 << 30,
  RichTextRuns = 1 << 31,
}
export const ExtendedServerCapability = {
  CapabilityWords64: 1n << 32n,
  ResourceStatusEvents: 1n << 33n,
  LinearGradientCircles: 1n << 34n,
  GridPatterns: 1n << 35n,
  DashedPathStrokes: 1n << 36n,
  GradientPathStrokes: 1n << 37n,
  ExtendedPathStrokeStyles: 1n << 38n,
  CustomPathMiterLimits: 1n << 39n,
  ArbitraryPathDashArrays: 1n << 40n,
  MultiStopPathGradients: 1n << 41n,
  PathGradientSpreadModes: 1n << 42n,
  RadialPathGradients: 1n << 43n,
  MultiStopRadialPathGradients: 1n << 44n,
  RadialPathGradientSpreadModes: 1n << 45n,
  FocalRadialPathGradients: 1n << 46n,
  TwoCircleRadialPathGradients: 1n << 47n,
  RadialPathGradientStrokes: 1n << 48n,
  StyledRadialPathPaint: 1n << 49n,
  ConicPathGradients: 1n << 50n,
  TexturePathPaint: 1n << 51n,
  NativeTextPlacement: 1n << 52n,
  NativeRichTextPlacement: 1n << 53n,
  RichTextRunMetrics: 1n << 54n,
  RichTextBaselineShift: 1n << 55n,
  TiledImageSurfaces: 1n << 56n,
  NineSliceImages: 1n << 57n,
  StyledNativeText: 1n << 58n,
  StyledRichTextRuns: 1n << 59n,
  GradientNativeText: 1n << 60n,
  ShapedTextGradientBounds: 1n << 61n,
  RadialGradientNativeText: 1n << 62n,
  ResourceTracing: 1n << 63n,
} as const;
export const ServerCapabilityWord1 = {
  ImageColorEffects: 1n << 0n,
  ImageBlurEffects: 1n << 1n,
  NativeArcs: 1n << 2n,
  NativeGradientArcs: 1n << 3n,
} as const;
export interface CapabilityWord { readonly index: number; readonly capabilities: bigint }
export enum ResourceKind { Texture = 1, Path = 2, Mesh = 3, Font = 4 }
export enum ResourceState { Ready = 1, Rejected = 2 }
export enum ResourceAction { Created = 1, Destroyed = 2, Rejected = 3 }
export interface ResourceStatus {
  readonly kind: ResourceKind;
  readonly state: ResourceState;
  readonly id: number;
}
export interface ResourceTrace {
  readonly kind: ResourceKind;
  readonly action: ResourceAction;
  readonly id: number;
  readonly resources: number;
  readonly maximumResources: number;
  readonly cost: bigint;
  readonly maximumCost: bigint;
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
export interface ImageEffects {
  readonly saturation?: number;
  readonly contrast?: number;
  readonly brightness?: number;
  readonly hueRotation?: number;
  readonly blur?: number;
}

export interface Vertex {
  readonly x: number;
  readonly y: number;
  readonly color: Color;
}
export interface MeshUploadVertex {
  readonly position: { readonly x: number; readonly y: number };
  readonly color: Color;
}

export interface ClipRect {
  readonly left: number; readonly top: number; readonly right: number; readonly bottom: number;
}
export interface AffineTransform {
  readonly m11: number; readonly m12: number; readonly m21: number; readonly m22: number;
  readonly translateX: number; readonly translateY: number;
}
export interface ShadowPaint {
  readonly destination: ClipRect; readonly cornerRadius: number;
  readonly blur: number; readonly spread: number; readonly color: Color;
}
export interface RadialGradientPaint {
  readonly destination: ClipRect; readonly centerX: number; readonly centerY: number;
  readonly radius: number; readonly cornerRadius: number;
  readonly innerColor: Color; readonly outerColor: Color;
}
export interface RoundedRectPaint {
  readonly destination: ClipRect; readonly cornerRadius: number; readonly borderWidth: number;
  readonly fillColor: Color; readonly borderColor: Color;
}
export interface CirclePaint {
  readonly destination: ClipRect; readonly borderWidth: number;
  readonly fillColor: Color; readonly borderColor: Color;
}
export interface ArcPaint {
  readonly destination: ClipRect; readonly startAngle: number; readonly sweepAngle: number;
  readonly thickness: number; readonly roundCaps: boolean; readonly color: Color;
}
export interface GradientArcPaint {
  readonly destination: ClipRect; readonly startAngle: number; readonly sweepAngle: number;
  readonly thickness: number; readonly roundCaps: boolean;
  readonly startColor: Color; readonly endColor: Color;
}
export interface DiagonalPatternPaint {
  readonly destination: ClipRect; readonly stripeWidth: number; readonly gap: number;
  readonly offset: number; readonly backward: boolean; readonly color: Color;
}
export interface LinearGradientPaint {
  readonly destination: ClipRect; readonly cornerRadius: number;
  readonly direction: "horizontal" | "vertical" | "diagonal";
  readonly startColor: Color; readonly endColor: Color;
}
export interface LinearGradientCirclePaint {
  readonly destination: ClipRect;
  readonly direction: "horizontal" | "vertical" | "diagonal";
  readonly startColor: Color; readonly endColor: Color;
}
export interface GridPatternPaint {
  readonly destination: ClipRect;
  readonly spacing: number; readonly minorWidth: number; readonly majorWidth: number;
  readonly offsetX: number; readonly offsetY: number; readonly majorEvery: number;
  readonly cornerRadius: number;
  readonly minorColor: Color; readonly majorColor: Color;
}
export interface ConicGradientPaint {
  readonly destination: ClipRect; readonly centerX: number; readonly centerY: number;
  readonly rotation: number; readonly cornerRadius: number;
  readonly startColor: Color; readonly middleColor: Color; readonly endColor: Color;
}
export interface DotGridPaint {
  readonly destination: ClipRect; readonly rows: number; readonly columns: number;
  readonly filledMask: number; readonly activeIndex: number;
  readonly inset: number; readonly radius: number; readonly borderWidth: number;
  readonly fillColor: Color; readonly ringColor: Color; readonly highlightColor: Color;
}
export interface WaveDotsPaint {
  readonly destination: ClipRect; readonly count: number; readonly inset: number;
  readonly minimumRadius: number; readonly maximumRadius: number;
  readonly phase: number; readonly frequency: number; readonly borderWidth: number;
  readonly troughStartColor: Color; readonly troughEndColor: Color;
  readonly crestStartColor: Color; readonly crestEndColor: Color; readonly borderColor: Color;
}

export type PathSegment =
  { readonly verb: "move" | "line"; readonly x: number; readonly y: number } |
  { readonly verb: "cubic"; readonly x1: number; readonly y1: number;
    readonly x2: number; readonly y2: number; readonly x: number; readonly y: number } |
  { readonly verb: "close" };

export interface PathGradientPaint {
  readonly start: { readonly x: number; readonly y: number };
  readonly end: { readonly x: number; readonly y: number };
  readonly startColor: Color;
  readonly endColor: Color;
  readonly stops?: readonly { readonly offset: number; readonly color: Color }[];
  readonly spread?: "pad" | "repeat" | "reflect";
  readonly coordinateSpace?: "objectBoundingBox";
}

export interface PathRadialGradientPaint {
  readonly center: { readonly x: number; readonly y: number };
  readonly axisX: { readonly x: number; readonly y: number };
  readonly axisY: { readonly x: number; readonly y: number };
  readonly innerColor: Color; readonly outerColor: Color;
  readonly stops?: readonly { readonly offset: number; readonly color: Color }[];
  readonly spread?: "pad" | "repeat" | "reflect";
  readonly focal?: { readonly x: number; readonly y: number };
  readonly focalRadius?: number;
  readonly coordinateSpace?: "objectBoundingBox";
}

export interface PathConicGradientPaint {
  readonly center: { readonly x: number; readonly y: number };
  readonly rotation?: number;
  readonly stops: readonly { readonly offset: number; readonly color: Color }[];
}

export interface PathTexturePaint {
  readonly textureId: number;
  readonly sourceRect: { readonly x: number; readonly y: number;
    readonly width: number; readonly height: number };
  readonly uv?: ClipRect;
  readonly tint?: Color;
  readonly sampling?: "linear" | "nearest";
  readonly repeatX?: boolean;
  readonly repeatY?: boolean;
}

export interface PathPaint {
  readonly fill?: Color;
  readonly fillGradient?: PathGradientPaint;
  readonly fillRadialGradient?: PathRadialGradientPaint;
  readonly fillConicGradient?: PathConicGradientPaint;
  readonly fillTexture?: PathTexturePaint;
  readonly stroke?: Color;
  readonly strokeGradient?: PathGradientPaint;
  readonly strokeRadialGradient?: PathRadialGradientPaint;
  readonly strokeConicGradient?: PathConicGradientPaint;
  readonly strokeTexture?: PathTexturePaint;
  readonly strokeWidth?: number;
  readonly tolerance?: number;
  readonly fillRule?: "nonzero" | "evenodd";
  readonly lineCap?: "butt" | "round" | "square";
  readonly lineJoin?: "bevel" | "round" | "miter";
  readonly miterLimit?: number;
  readonly dash?: { readonly length: number; readonly gap: number; readonly offset?: number } |
    { readonly values: readonly number[]; readonly offset?: number };
}

export type FontFamily = "system" | "monospace" | "serif" | "rounded";
export type FontWeight = "regular" | "medium" | "semibold" | "bold";
export type FontStyle = "regular" | "italic";
export enum TextDecoration { None = 0, Underline = 1, LineThrough = 2 }
export interface RichTextRun {
  readonly text: string;
  readonly color: Color;
  readonly family?: FontFamily;
  readonly weight?: FontWeight;
  readonly style?: FontStyle;
  readonly letterSpacing?: number;
  readonly decoration?: TextDecoration;
  readonly fontResourceId?: number;
  readonly fontScale?: number;
  readonly baselineShift?: number;
  readonly strokeColor?: Color;
  readonly strokeWidth?: number;
}
const fontWeightCode = (weight: FontWeight): number =>
  weight === "bold" ? 1 : weight === "medium" ? 2 : weight === "semibold" ? 3 : 0;
const fontFamilyCode = (family: FontFamily): number =>
  family === "monospace" ? 1 : family === "serif" ? 2 : family === "rounded" ? 3 : 0;

export function encodeTextMeasure(family: FontFamily, text: string,
  weight: FontWeight = "regular", style: FontStyle = "regular",
  letterSpacing = 0, fontResourceId = 0): Buffer {
  const utf8 = Buffer.from(text, "utf8");
  if (utf8.length === 0 || utf8.length > 65536 || utf8.includes(0))
    throw new RangeError("Text measurement requires 1 through 65536 non-NUL UTF-8 bytes");
  if (!Number.isFinite(letterSpacing) || Math.abs(letterSpacing) > 10)
    throw new RangeError("Text letter spacing must be finite and within -10 through 10 em");
  if (!Number.isInteger(fontResourceId) || fontResourceId < 0 || fontResourceId > 0xffff_ffff)
    throw new RangeError("Font resource ID must be an unsigned 32-bit integer");
  const extension = fontResourceId !== 0 ? 2 : letterSpacing !== 0 ? 1 : 0;
  const headerSize = extension === 2 ? 12 : extension === 1 ? 8 : 4;
  const payload = Buffer.alloc(headerSize + utf8.length);
  payload.writeUInt8(fontFamilyCode(family), 0);
  payload.writeUInt8(fontWeightCode(weight), 1);
  payload.writeUInt8(style === "italic" ? 1 : 0, 2);
  payload.writeUInt8(extension, 3);
  if (extension >= 1) payload.writeFloatLE(letterSpacing, 4);
  if (extension === 2) payload.writeUInt32LE(fontResourceId, 8);
  utf8.copy(payload, headerSize);
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

  measure(family: FontFamily, text: string, weight: FontWeight = "regular",
    style: FontStyle = "regular", letterSpacing = 0, fontResourceId = 0): Promise<number> {
    const payload = encodeTextMeasure(
      family, text, weight, style, letterSpacing, fontResourceId);
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

export function encodeMeshCreate(id: number, vertices: readonly MeshUploadVertex[],
  indices: readonly number[]): Buffer {
  if (!Number.isSafeInteger(id) || id <= 0 || id > 0xffff_ffff || vertices.length === 0 ||
      vertices.length > 262_144 || indices.length === 0 || indices.length > 1_048_576 ||
      indices.length % 3 !== 0)
    throw new RangeError("Mesh must have a nonzero ID and indexed triangle geometry");
  const payload = Buffer.alloc(16 + vertices.length * 24 + indices.length * 4);
  payload.writeUInt32LE(id, 0); payload.writeUInt32LE(vertices.length, 4);
  payload.writeUInt32LE(indices.length, 8);
  vertices.forEach((vertex, index) => {
    const values = [vertex.position.x, vertex.position.y, vertex.color.red,
      vertex.color.green, vertex.color.blue, vertex.color.alpha];
    if (values.some((value) => !Number.isFinite(value)))
      throw new RangeError("Mesh vertex values must be finite");
    values.forEach((value, component) => payload.writeFloatLE(value, 16 + index * 24 + component * 4));
  });
  const indexOffset = 16 + vertices.length * 24;
  indices.forEach((value, index) => {
    if (!Number.isSafeInteger(value) || value < 0 || value >= vertices.length)
      throw new RangeError("Mesh indices must reference uploaded vertices");
    payload.writeUInt32LE(value, indexOffset + index * 4);
  });
  return payload;
}

export function encodeResourceId(id: number): Buffer {
  if (!Number.isSafeInteger(id) || id <= 0 || id > 0xffff_ffff)
    throw new RangeError("Resource ID must be a nonzero u32");
  const payload = Buffer.alloc(4); payload.writeUInt32LE(id); return payload;
}

export function encodeFontCreate(id: number, bytes: Buffer): Buffer {
  if (!Number.isInteger(id) || id <= 0 || id > 0xffff_ffff)
    throw new RangeError("Font resource ID must be a nonzero unsigned 32-bit integer");
  if (bytes.length === 0 || bytes.length > 16 * 1024 * 1024)
    throw new RangeError("Font resource must contain 1 through 16777216 bytes");
  const payload = Buffer.allocUnsafe(4 + bytes.length);
  payload.writeUInt32LE(id, 0);
  bytes.copy(payload, 4);
  return payload;
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

export function decodeServerCapabilities(payload: Buffer): bigint {
  if (payload.length !== 8) throw new Error("ServerCapabilities payload must be 8 bytes");
  return payload.readBigUInt64LE(0);
}

export function decodeCapabilityWord(payload: Buffer): CapabilityWord {
  if (payload.length !== 16 || payload.readUInt32LE(0) === 0 || payload.readUInt32LE(4) !== 0)
    throw new Error("ServerCapabilityWord payload has invalid fields");
  return { index: payload.readUInt32LE(0), capabilities: payload.readBigUInt64LE(8) };
}

export function decodeResourceStatus(payload: Buffer): ResourceStatus {
  if (payload.length !== 8 || payload.readUInt16LE(2) !== 0)
    throw new Error("ResourceStatus payload must be 8 bytes with zero reserved fields");
  const kind = payload.readUInt8(0), state = payload.readUInt8(1), id = payload.readUInt32LE(4);
  if (kind < ResourceKind.Texture || kind > ResourceKind.Font ||
      state < ResourceState.Ready || state > ResourceState.Rejected || id === 0)
    throw new Error("ResourceStatus payload has invalid fields");
  return { kind: kind as ResourceKind, state: state as ResourceState, id };
}

export function decodeResourceTrace(payload: Buffer): ResourceTrace {
  if (payload.length !== 32 || payload.readUInt16LE(2) !== 0)
    throw new Error("ResourceTrace payload must be 32 bytes with zero reserved fields");
  const kind = payload.readUInt8(0), action = payload.readUInt8(1);
  const id = payload.readUInt32LE(4), resources = payload.readUInt32LE(8);
  const maximumResources = payload.readUInt32LE(12);
  const cost = payload.readBigUInt64LE(16), maximumCost = payload.readBigUInt64LE(24);
  if (kind < ResourceKind.Texture || kind > ResourceKind.Font ||
      action < ResourceAction.Created || action > ResourceAction.Rejected || id === 0 ||
      resources > maximumResources || cost > maximumCost)
    throw new Error("ResourceTrace payload has invalid fields");
  return { kind: kind as ResourceKind, action: action as ResourceAction, id,
    resources, maximumResources, cost, maximumCost };
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

  imageSurface(textureId: number, destination: ClipRect, uv: ClipRect = {
    left: 0, top: 0, right: 1, bottom: 1,
  }, tint: Color = { red: 1, green: 1, blue: 1, alpha: 1 }, cornerRadius = 0,
  sampling: "linear" | "nearest" = "linear"): void {
    const values = [destination.left, destination.top, destination.right, destination.bottom,
      uv.left, uv.top, uv.right, uv.bottom, tint.red, tint.green, tint.blue, tint.alpha,
      cornerRadius, 0];
    if (!Number.isSafeInteger(textureId) || textureId <= 0 || textureId > 0xffff_ffff ||
        values.some((value) => !Number.isFinite(value)) || cornerRadius < 0 || cornerRadius > 8192)
      throw new RangeError("Image surface values are outside supported bounds");
    const payload = Buffer.alloc(64);
    payload.writeUInt32LE(textureId, 0);
    payload.writeUInt32LE(sampling === "nearest" ? 1 : 0, 4);
    values.forEach((value, index) => payload.writeFloatLE(value, 8 + index * 4));
    this.command(19, payload);
  }

  tiledImageSurface(textureId: number, destination: ClipRect, uv: ClipRect,
    tint: Color = { red: 1, green: 1, blue: 1, alpha: 1 }, cornerRadius = 0,
    sampling: "linear" | "nearest" = "linear", repeatX = true, repeatY = true): void {
    const values = [destination.left, destination.top, destination.right, destination.bottom,
      uv.left, uv.top, uv.right, uv.bottom, tint.red, tint.green, tint.blue, tint.alpha,
      cornerRadius, 0];
    if (!Number.isSafeInteger(textureId) || textureId <= 0 || textureId > 0xffff_ffff ||
        values.some((value) => !Number.isFinite(value)) || cornerRadius < 0 || cornerRadius > 8192 ||
        (!repeatX && !repeatY))
      throw new RangeError("Tiled image surface values are outside supported bounds");
    const payload = Buffer.alloc(64);
    payload.writeUInt32LE(textureId, 0);
    payload.writeUInt32LE((sampling === "nearest" ? 1 : 0) |
      (repeatX ? 2 : 0) | (repeatY ? 4 : 0), 4);
    values.forEach((value, index) => payload.writeFloatLE(value, 8 + index * 4));
    this.command(39, payload);
  }

  filteredImageSurface(textureId: number, destination: ClipRect, uv: ClipRect,
    effects: ImageEffects, tint: Color = { red: 1, green: 1, blue: 1, alpha: 1 },
    cornerRadius = 0, sampling: "linear" | "nearest" = "linear",
    repeatX = false, repeatY = false): void {
    const saturation = effects.saturation ?? 1, contrast = effects.contrast ?? 1;
    const brightness = effects.brightness ?? 0, hueRotation = effects.hueRotation ?? 0;
    const blur = effects.blur ?? 0;
    const values = [destination.left, destination.top, destination.right, destination.bottom,
      uv.left, uv.top, uv.right, uv.bottom, tint.red, tint.green, tint.blue, tint.alpha,
      cornerRadius, saturation, contrast, brightness, hueRotation, blur];
    if (!Number.isSafeInteger(textureId) || textureId <= 0 || textureId > 0xffff_ffff ||
        values.some((value) => !Number.isFinite(value)) || cornerRadius < 0 ||
        cornerRadius > 8192 || saturation < 0 || saturation > 2 || contrast < 0 ||
        contrast > 2 || brightness < -1 || brightness > 1 ||
        hueRotation < -Math.PI * 2 || hueRotation > Math.PI * 2 || blur < 0 || blur > 32)
      throw new RangeError("Filtered image values are outside supported bounds");
    const payload = Buffer.alloc(80);
    payload.writeUInt32LE(textureId, 0);
    payload.writeUInt32LE((sampling === "nearest" ? 1 : 0) |
      (repeatX ? 2 : 0) | (repeatY ? 4 : 0), 4);
    values.forEach((value, index) => payload.writeFloatLE(value, 8 + index * 4));
    this.command(45, payload);
  }

  nineSliceImage(textureId: number, destination: ClipRect, uv: ClipRect,
    sourceInsets: { readonly left: number; readonly top: number; readonly right: number; readonly bottom: number },
    destinationInsets: { readonly left: number; readonly top: number; readonly right: number; readonly bottom: number },
    tint: Color = { red: 1, green: 1, blue: 1, alpha: 1 }, cornerRadius = 0,
    sampling: "linear" | "nearest" = "linear"): void {
    const values = [destination.left, destination.top, destination.right, destination.bottom,
      uv.left, uv.top, uv.right, uv.bottom, tint.red, tint.green, tint.blue, tint.alpha,
      sourceInsets.left, sourceInsets.top, sourceInsets.right, sourceInsets.bottom,
      destinationInsets.left, destinationInsets.top, destinationInsets.right, destinationInsets.bottom,
      cornerRadius, 0];
    if (!Number.isSafeInteger(textureId) || textureId <= 0 || textureId > 0xffff_ffff ||
        values.some((value) => !Number.isFinite(value)) ||
        Object.values(sourceInsets).some((value) => value < 0) ||
        Object.values(destinationInsets).some((value) => value < 0) ||
        sourceInsets.left + sourceInsets.right > uv.right - uv.left ||
        sourceInsets.top + sourceInsets.bottom > uv.bottom - uv.top ||
        cornerRadius < 0 || cornerRadius > 8192)
      throw new RangeError("Nine-slice image values are outside supported bounds");
    const payload = Buffer.alloc(96);
    payload.writeUInt32LE(textureId, 0);
    payload.writeUInt32LE(sampling === "nearest" ? 1 : 0, 4);
    values.forEach((value, index) => payload.writeFloatLE(value, 8 + index * 4));
    this.command(40, payload);
  }

  path(pathId: number, destination: ClipRect,
    viewBox: { readonly x: number; readonly y: number; readonly width: number; readonly height: number },
    paint: PathPaint): void {
    if (!Number.isSafeInteger(pathId) || pathId <= 0 || pathId > 0xffff_ffff ||
        (!paint.fill && !paint.fillGradient && !paint.fillRadialGradient && !paint.fillConicGradient &&
          !paint.fillTexture &&
          !paint.stroke && !paint.strokeGradient && !paint.strokeRadialGradient &&
          !paint.strokeConicGradient && !paint.strokeTexture))
      throw new RangeError("Path draw requires an ID and paint");
    const dashArray = paint.dash !== undefined && "values" in paint.dash;
    const dashed = paint.dash !== undefined && !dashArray;
    const extended = paint.strokeGradient !== undefined;
    const styled = paint.miterLimit !== undefined;
    if (paint.fillRadialGradient && paint.strokeRadialGradient)
      throw new RangeError("One path command can carry only one radial paint");
    if (paint.fillConicGradient && paint.strokeConicGradient)
      throw new RangeError("One path command can carry only one conic paint");
    const conicPaint = paint.fillConicGradient ?? paint.strokeConicGradient;
    const conicGradient = conicPaint !== undefined;
    if (paint.fillTexture && paint.strokeTexture)
      throw new RangeError("One path command can carry only one texture paint");
    const texturePaint = paint.fillTexture ?? paint.strokeTexture;
    const radialPaint = paint.fillRadialGradient ?? paint.strokeRadialGradient;
    const radialGradient = radialPaint !== undefined;
    const radialStops = radialPaint?.stops ?? [];
    const focalRadius = radialPaint?.focalRadius ?? 0;
    if (!Number.isFinite(focalRadius) || focalRadius < 0 || focalRadius >= 1)
      throw new RangeError("Radial focal radius must be normalized below one");
    const twoCircleRadialGradient = focalRadius > 0;
    const focalRadialGradient = !twoCircleRadialGradient &&
      radialPaint?.focal !== undefined;
    const multiRadialGradient = !twoCircleRadialGradient && !focalRadialGradient &&
      (radialStops.length > 0 ||
      (radialPaint?.spread !== undefined && radialPaint.spread !== "pad"));
    const styledRadialGradient = radialGradient && (paint.dash !== undefined || styled);
    const extendedRadialGradient = styledRadialGradient || twoCircleRadialGradient ||
      focalRadialGradient || multiRadialGradient;
    const encodedRadialStops = radialStops.length > 0 ? radialStops : radialPaint ? [
      { offset: 0, color: radialPaint.innerColor },
      { offset: 1, color: radialPaint.outerColor },
    ] : [];
    const fillStops = paint.fillGradient?.stops ?? [];
    const strokeStops = paint.strokeGradient?.stops ?? [];
    const validateStops = (stops: readonly { readonly offset: number; readonly color: Color }[]) =>
      stops.length === 0 || (stops.length >= 2 && stops.length <= 8 && stops.every((stop, index) =>
        Number.isFinite(stop.offset) && stop.offset >= 0 && stop.offset <= 1 &&
        (index === 0 || stop.offset >= stops[index - 1]!.offset) &&
        [stop.color.red, stop.color.green, stop.color.blue, stop.color.alpha].every(Number.isFinite)));
    if (!validateStops(fillStops) || !validateStops(strokeStops) ||
        (extendedRadialGradient && !validateStops(encodedRadialStops)) ||
        (conicGradient && (!validateStops(conicPaint.stops) || conicPaint.stops.length < 2)))
      throw new RangeError("Path gradients require 2 through 8 ordered finite stops");
    const multiGradient = fillStops.length > 2 || strokeStops.length > 2 ||
      (paint.fillGradient?.spread !== undefined && paint.fillGradient.spread !== "pad") ||
      (paint.strokeGradient?.spread !== undefined && paint.strokeGradient.spread !== "pad");
    if ((paint.fillRadialGradient && paint.fillGradient) ||
        (radialGradient && paint.strokeGradient) ||
        (paint.fillConicGradient && (paint.fillGradient || paint.fillRadialGradient ||
          paint.strokeGradient)) ||
        (paint.strokeConicGradient && (paint.strokeGradient || paint.strokeRadialGradient)) ||
        (conicGradient && radialGradient) ||
        (paint.fillTexture && (paint.fillGradient || paint.strokeGradient)) ||
        (paint.strokeTexture && paint.strokeGradient) ||
        (texturePaint && (radialGradient || conicGradient)))
      throw new RangeError("Path command cannot combine multiple gradient models");
    if (conicGradient && (!Number.isFinite(conicPaint.center.x) ||
        !Number.isFinite(conicPaint.center.y) || !Number.isFinite(conicPaint.rotation ?? 0)))
      throw new RangeError("Conic path center and rotation must be finite");
    const textureUv = texturePaint?.uv ?? { left: 0, top: 0, right: 1, bottom: 1 };
    const textureTint = texturePaint?.tint ?? { red: 1, green: 1, blue: 1, alpha: 1 };
    if (texturePaint && (!Number.isSafeInteger(texturePaint.textureId) ||
        texturePaint.textureId <= 0 || texturePaint.textureId > 0xffff_ffff ||
        texturePaint.sourceRect.width <= 0 || texturePaint.sourceRect.height <= 0 ||
        [texturePaint.sourceRect.x, texturePaint.sourceRect.y, texturePaint.sourceRect.width,
          texturePaint.sourceRect.height, textureUv.left, textureUv.top, textureUv.right,
          textureUv.bottom, textureTint.red, textureTint.green, textureTint.blue, textureTint.alpha]
          .some((value) => !Number.isFinite(value))))
      throw new RangeError("Path texture values are outside supported bounds");
    if (styled && (!Number.isFinite(paint.miterLimit) || paint.miterLimit < 1 || paint.miterLimit > 1000))
      throw new RangeError("Path miter limit must be between 1 and 1000");
    if (dashArray && (paint.dash.values.length < 2 || paint.dash.values.length > 32 ||
        paint.dash.values.length % 2 !== 0 ||
        paint.dash.values.some((value) => !Number.isFinite(value) || value <= 0)))
      throw new RangeError("Path dash arrays require 2 through 32 positive values in pairs");
    if (paint.dash && !("values" in paint.dash) &&
        (!Number.isFinite(paint.dash.length) || !Number.isFinite(paint.dash.gap) ||
         paint.dash.length <= 0 || paint.dash.gap <= 0) ||
        paint.dash?.offset !== undefined && !Number.isFinite(paint.dash.offset))
      throw new RangeError("Path dash values must be positive and finite");
    const multiDash = paint.dash === undefined ? [] : "values" in paint.dash
      ? paint.dash.values : [paint.dash.length, paint.dash.gap];
    if (paint.dash && !paint.stroke && !paint.strokeGradient && !paint.strokeRadialGradient &&
        !paint.strokeConicGradient && !paint.strokeTexture)
      throw new RangeError("Dashed path requires stroke paint");
    const payload = Buffer.alloc(texturePaint
      ? 200 + multiDash.length * 4 : conicGradient
      ? 152 + multiDash.length * 4 + conicPaint.stops.length * 20 : styledRadialGradient
      ? 184 + multiDash.length * 4 + encodedRadialStops.length * 20 :
      twoCircleRadialGradient ? 176 + encodedRadialStops.length * 20 :
      focalRadialGradient ? 168 + encodedRadialStops.length * 20 :
      multiRadialGradient ? 160 + encodedRadialStops.length * 20 :
      radialGradient ? 184 : multiGradient ? 192 + multiDash.length * 4 +
      (fillStops.length + strokeStops.length) * 20 : dashArray ? 192 + paint.dash.values.length * 4 :
      styled ? 208 : extended ? (dashed ? 192 : 176) : dashed ? 144 : 128);
    payload.writeUInt32LE(pathId, 0);
    payload.writeUInt8((paint.fill || paint.fillGradient || paint.fillRadialGradient ||
        paint.fillConicGradient || paint.fillTexture ? 1 : 0) |
      (paint.stroke || paint.strokeGradient || paint.strokeRadialGradient ||
        paint.strokeConicGradient || paint.strokeTexture ? 2 : 0) |
      (paint.fillGradient ? 4 : 0) | (paint.strokeGradient ? 8 : 0) |
      (paint.fillRadialGradient ? 16 : 0) | (paint.strokeRadialGradient ? 32 : 0) |
      (paint.fillConicGradient ? 64 : 0) | (paint.strokeConicGradient ? 128 : 0), 4);
    payload.writeUInt8(paint.fillRule === "evenodd" ? 1 : 0, 5);
    payload.writeUInt8(paint.lineCap === "square" ? 2 : paint.lineCap === "round" ? 1 : 0, 6);
    payload.writeUInt8(paint.lineJoin === "miter" ? 2 : paint.lineJoin === "round" ? 1 : 0, 7);
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
    if (texturePaint) {
      payload.writeUInt32LE(texturePaint.textureId, 128);
      payload.writeUInt8(texturePaint.sampling === "nearest" ? 1 : 0, 132);
      payload.writeUInt8(texturePaint.repeatX ? 1 : 0, 133);
      payload.writeUInt8(texturePaint.repeatY ? 1 : 0, 134);
      payload.writeUInt8(paint.strokeTexture ? 1 : 0, 135);
      [texturePaint.sourceRect.x, texturePaint.sourceRect.y,
        texturePaint.sourceRect.width, texturePaint.sourceRect.height,
        textureUv.left, textureUv.top, textureUv.right, textureUv.bottom,
        textureTint.red, textureTint.green, textureTint.blue, textureTint.alpha,
        paint.miterLimit ?? 4, paint.dash?.offset ?? 0]
        .forEach((value, index) => payload.writeFloatLE(value, 136 + index * 4));
      payload.writeUInt16LE(multiDash.length, 192);
      multiDash.forEach((value, index) => payload.writeFloatLE(value, 200 + index * 4));
      this.command(38, payload);
      return;
    }
    if (conicPaint) {
      [conicPaint.center.x, conicPaint.center.y, conicPaint.rotation ?? 0,
        paint.miterLimit ?? 4, paint.dash?.offset ?? 0]
        .forEach((value, index) => payload.writeFloatLE(value, 128 + index * 4));
      payload.writeUInt16LE(multiDash.length, 148);
      payload.writeUInt8(conicPaint.stops.length, 150);
      multiDash.forEach((value, index) => payload.writeFloatLE(value, 152 + index * 4));
      const stopsOffset = 152 + multiDash.length * 4;
      conicPaint.stops.forEach((stop, index) => {
        const offset = stopsOffset + index * 20;
        payload.writeFloatLE(stop.offset, offset);
        [stop.color.red, stop.color.green, stop.color.blue, stop.color.alpha]
          .forEach((value, channel) => payload.writeFloatLE(value, offset + 4 + channel * 4));
      });
      this.command(37, payload);
      return;
    }
    if (radialPaint) {
      const radial = radialPaint;
      const focal = radial.focal ?? radial.center;
      const radialHeader = [radial.center.x, radial.center.y, radial.axisX.x, radial.axisX.y,
        radial.axisY.x, radial.axisY.y];
      const radialValues = styledRadialGradient ? [...radialHeader, focal.x, focal.y,
        focalRadius, paint.miterLimit ?? 4, paint.dash?.offset ?? 0] :
        twoCircleRadialGradient ? [...radialHeader, focal.x, focal.y,
        focalRadius, 0] : focalRadialGradient ? [...radialHeader, focal.x, focal.y] :
        multiRadialGradient ? radialHeader : [...radialHeader,
        radial.innerColor.red, radial.innerColor.green, radial.innerColor.blue, radial.innerColor.alpha,
        radial.outerColor.red, radial.outerColor.green, radial.outerColor.blue, radial.outerColor.alpha];
      radialValues
        .forEach((value, index) => {
          if (!Number.isFinite(value)) throw new RangeError("Radial path values must be finite");
          payload.writeFloatLE(value, 128 + index * 4);
        });
      const determinant = radial.axisX.x * radial.axisY.y - radial.axisX.y * radial.axisY.x;
      if (Math.abs(determinant) < 0.000001) throw new RangeError("Radial path axes must be invertible");
      if (focalRadialGradient || twoCircleRadialGradient ||
          (styledRadialGradient && (radial.focal !== undefined || focalRadius > 0))) {
        const dx = focal.x - radial.center.x, dy = focal.y - radial.center.y;
        const focalX = (dx * radial.axisY.y - dy * radial.axisY.x) / determinant;
        const focalY = (radial.axisX.x * dy - radial.axisX.y * dx) / determinant;
        if (!Number.isFinite(focalX) || !Number.isFinite(focalY) ||
            Math.hypot(focalX, focalY) + focalRadius >= 1)
          throw new RangeError("Radial focal circle must lie inside its field");
      }
      if (styledRadialGradient) {
        payload.writeUInt16LE(multiDash.length, 172);
        payload.writeUInt8(encodedRadialStops.length, 174);
        payload.writeUInt8(radial.spread === "repeat" ? 1 : radial.spread === "reflect" ? 2 : 0,
          175);
        payload.writeUInt8(focalRadius > 0 ? 2 : radial.focal !== undefined ? 1 : 0, 176);
        multiDash.forEach((value, index) => payload.writeFloatLE(value, 184 + index * 4));
        const stopsOffset = 184 + multiDash.length * 4;
        encodedRadialStops.forEach((stop, index) => {
          const offset = stopsOffset + index * 20;
          payload.writeFloatLE(stop.offset, offset);
          [stop.color.red, stop.color.green, stop.color.blue, stop.color.alpha]
            .forEach((value, channel) => payload.writeFloatLE(value, offset + 4 + channel * 4));
        });
        this.command(36, payload);
        return;
      }
      if (extendedRadialGradient) {
        const headerOffset = twoCircleRadialGradient ? 168 : focalRadialGradient ? 160 : 152;
        const stopsOffset = twoCircleRadialGradient ? 176 : focalRadialGradient ? 168 : 160;
        payload.writeUInt8(encodedRadialStops.length, headerOffset);
        payload.writeUInt8(radial.spread === "repeat" ? 1 : radial.spread === "reflect" ? 2 : 0,
          headerOffset + 1);
        encodedRadialStops.forEach((stop, index) => {
          const offset = stopsOffset + index * 20;
          payload.writeFloatLE(stop.offset, offset);
          [stop.color.red, stop.color.green, stop.color.blue, stop.color.alpha]
            .forEach((value, channel) => payload.writeFloatLE(value, offset + 4 + channel * 4));
        });
      }
      this.command(twoCircleRadialGradient ? 35 : focalRadialGradient ? 34 :
        multiRadialGradient ? 33 : 32, payload);
      return;
    }
    if (paint.strokeGradient) {
      [paint.strokeGradient.start.x, paint.strokeGradient.start.y,
        paint.strokeGradient.end.x, paint.strokeGradient.end.y,
        paint.strokeGradient.startColor.red, paint.strokeGradient.startColor.green,
        paint.strokeGradient.startColor.blue, paint.strokeGradient.startColor.alpha,
        paint.strokeGradient.endColor.red, paint.strokeGradient.endColor.green,
        paint.strokeGradient.endColor.blue, paint.strokeGradient.endColor.alpha]
        .forEach((value, index) => {
          if (!Number.isFinite(value)) throw new RangeError("Path stroke gradient values must be finite");
          payload.writeFloatLE(value, 128 + index * 4);
        });
    }
    // Styled paths reserve the gradient block even when stroke paint is solid.
    if (multiGradient) {
      payload.writeFloatLE(paint.miterLimit ?? 4, 176);
      payload.writeFloatLE(paint.dash?.offset ?? 0, 180);
      payload.writeUInt16LE(multiDash.length, 184);
      payload.writeUInt8(fillStops.length, 186);
      payload.writeUInt8(strokeStops.length, 187);
      const spreadCode = (spread: "pad" | "repeat" | "reflect" | undefined) =>
        spread === "repeat" ? 1 : spread === "reflect" ? 2 : 0;
      payload.writeUInt8(spreadCode(paint.fillGradient?.spread), 188);
      payload.writeUInt8(spreadCode(paint.strokeGradient?.spread), 189);
      multiDash.forEach((value, index) => payload.writeFloatLE(value, 192 + index * 4));
      let stopOffset = 192 + multiDash.length * 4;
      [...fillStops, ...strokeStops].forEach((stop) => {
        payload.writeFloatLE(stop.offset, stopOffset);
        [stop.color.red, stop.color.green, stop.color.blue, stop.color.alpha]
          .forEach((value, index) => payload.writeFloatLE(value, stopOffset + 4 + index * 4));
        stopOffset += 20;
      });
    } else if (dashArray) {
      payload.writeFloatLE(paint.miterLimit ?? 4, 176);
      payload.writeFloatLE(paint.dash.offset ?? 0, 180);
      payload.writeUInt32LE(paint.dash.values.length, 184);
      paint.dash.values.forEach((value, index) => payload.writeFloatLE(value, 192 + index * 4));
    } else if (paint.dash) {
      const values = [paint.dash.length, paint.dash.gap, paint.dash.offset ?? 0];
      if ((!paint.stroke && !paint.strokeGradient) || values.some((value) => !Number.isFinite(value)) ||
          paint.dash.length <= 0 || paint.dash.gap <= 0)
        throw new RangeError("Dashed path requires a stroke and positive finite dash lengths");
      const dashOffset = (extended || styled) ? 176 : 128;
      values.forEach((value, index) => payload.writeFloatLE(value, dashOffset + index * 4));
    }
    if (styled && !dashArray && !multiGradient) payload.writeFloatLE(paint.miterLimit!, 192);
    this.command(multiGradient ? 31 : dashArray ? 30 : styled ? 29 : extended ? 28 : dashed ? 27 : 7, payload);
  }

  richText(runs: readonly RichTextRun[], left: number, top: number, fontSize: number,
    anchor: "start" | "middle" | "end" = "start",
    baseline: "top" | "alphabetic" = "top"): void {
    if (runs.length === 0 || runs.length > 256)
      throw new RangeError("Rich text requires 1 through 256 runs");
    const encoded = runs.map((run) => Buffer.from(run.text, "utf8"));
    const placed = anchor !== "start" || baseline !== "top";
    const scaledRuns = runs.some((run) => (run.fontScale ?? 1) !== 1);
    const shiftedRuns = runs.some((run) => (run.baselineShift ?? 0) !== 0);
    const styledRuns = runs.some((run) => (run.strokeWidth ?? 0) > 0);
    const headerSize = placed ? 20 : 16;
    const runHeaderSize = 32 + (scaledRuns ? 4 : 0) + (shiftedRuns ? 4 : 0) +
      (styledRuns ? 20 : 0);
    const payload = Buffer.alloc(headerSize + encoded.reduce(
      (size, text) => size + runHeaderSize + text.length, 0));
    [left, top, fontSize].forEach((value, index) => {
      if (!Number.isFinite(value) || (index === 2 && value <= 0))
        throw new RangeError("Rich text position and size must be finite and size positive");
      payload.writeFloatLE(value, index * 4);
    });
    payload.writeUInt32LE(runs.length + (placed ? 0x8000_0000 : 0) +
      (scaledRuns ? 0x4000_0000 : 0) + (shiftedRuns ? 0x2000_0000 : 0), 12);
    if (placed) {
      payload.writeUInt8(anchor === "middle" ? 1 : anchor === "end" ? 2 : 0, 16);
      payload.writeUInt8(baseline === "alphabetic" ? 1 : 0, 17);
    }
    let offset = headerSize;
    runs.forEach((run, index) => {
      const text = encoded[index]!;
      if (text.length === 0 || text.length > 65536 || text.includes(0))
        throw new RangeError("Rich text runs require 1 through 65536 non-NUL UTF-8 bytes");
      const spacing = run.letterSpacing ?? 0;
      const decoration = run.decoration ?? TextDecoration.None;
      const fontId = run.fontResourceId ?? 0;
      const fontScale = run.fontScale ?? 1;
      const baselineShift = run.baselineShift ?? 0;
      const strokeWidth = run.strokeWidth ?? 0;
      const stroke = run.strokeColor ?? { red: 0, green: 0, blue: 0, alpha: 0 };
      const colors = [run.color.red, run.color.green, run.color.blue, run.color.alpha];
      if (!Number.isFinite(spacing) || Math.abs(spacing) > 10 || decoration < 0 || decoration > 3 ||
          !Number.isInteger(fontId) || fontId < 0 || fontId > 0xffff_ffff ||
          !Number.isFinite(fontScale) || fontScale <= 0 || fontScale > 16 ||
          !Number.isFinite(baselineShift) || Math.abs(baselineShift) > 16 ||
          !Number.isFinite(strokeWidth) || strokeWidth < 0 || strokeWidth > 4 ||
          colors.some((value) => !Number.isFinite(value)) ||
          [stroke.red, stroke.green, stroke.blue, stroke.alpha]
            .some((value) => !Number.isFinite(value)))
        throw new RangeError("Invalid rich text run style");
      payload.writeUInt8(fontFamilyCode(run.family ?? "system"), offset);
      payload.writeUInt8(fontWeightCode(run.weight ?? "regular"), offset + 1);
      payload.writeUInt8(run.style === "italic" ? 1 : 0, offset + 2);
      payload.writeUInt8(decoration, offset + 3);
      payload.writeFloatLE(spacing, offset + 4);
      payload.writeUInt32LE(fontId, offset + 8);
      colors
        .forEach((value, colorIndex) => payload.writeFloatLE(value, offset + 12 + colorIndex * 4));
      payload.writeUInt32LE(text.length, offset + 28);
      if (scaledRuns) payload.writeFloatLE(fontScale, offset + 32);
      if (shiftedRuns) payload.writeFloatLE(baselineShift, offset + 32 + (scaledRuns ? 4 : 0));
      if (styledRuns) {
        const strokeOffset = offset + 32 + (scaledRuns ? 4 : 0) + (shiftedRuns ? 4 : 0);
        [stroke.red, stroke.green, stroke.blue, stroke.alpha, strokeWidth]
          .forEach((value, strokeIndex) => payload.writeFloatLE(value,
            strokeOffset + strokeIndex * 4));
      }
      text.copy(payload, offset + runHeaderSize);
      offset += runHeaderSize + text.length;
    });
    this.command(styledRuns ? 42 : 24, payload);
  }

  systemText(text: string, left: number, top: number, fontSize: number,
    color: Color, family: FontFamily = "system", weight: FontWeight = "regular",
    style: FontStyle = "regular", letterSpacing = 0,
    decoration: TextDecoration = TextDecoration.None, fontResourceId = 0,
    anchor: "start" | "middle" | "end" = "start",
    baseline: "top" | "alphabetic" = "top"): void {
    const utf8 = Buffer.from(text, "utf8");
    if (utf8.length === 0 || utf8.length > 65536 || utf8.includes(0))
      throw new RangeError("System text must contain 1 through 65536 non-NUL UTF-8 bytes");
    if (!Number.isFinite(letterSpacing) || Math.abs(letterSpacing) > 10)
      throw new RangeError("Text letter spacing must be finite and within -10 through 10 em");
    if (!Number.isInteger(decoration) || decoration < 0 || decoration > 3)
      throw new RangeError("Text decoration must contain only underline and line-through flags");
    if (!Number.isInteger(fontResourceId) || fontResourceId < 0 || fontResourceId > 0xffff_ffff)
      throw new RangeError("Font resource ID must be an unsigned 32-bit integer");
    const extension = anchor !== "start" || baseline !== "top" ? 4 : fontResourceId !== 0 ? 3
      : decoration !== TextDecoration.None ? 2 : letterSpacing !== 0 ? 1 : 0;
    const headerSize = extension === 4 ? 48 : extension === 3 ? 44
      : extension === 2 ? 40 : extension === 1 ? 36 : 32;
    const payload = Buffer.alloc(headerSize + utf8.length);
    payload.writeUInt8(fontFamilyCode(family), 0);
    payload.writeUInt8(fontWeightCode(weight), 1);
    payload.writeUInt8(style === "italic" ? 1 : 0, 2);
    payload.writeUInt8(extension, 3);
    [left, top, fontSize, color.red, color.green, color.blue, color.alpha]
      .forEach((value, index) => {
        if (!Number.isFinite(value)) throw new RangeError("System text values must be finite");
        payload.writeFloatLE(value, 4 + index * 4);
      });
    if (extension >= 1) payload.writeFloatLE(letterSpacing, 32);
    if (extension >= 2) payload.writeUInt8(decoration, 36);
    if (extension >= 3) payload.writeUInt32LE(fontResourceId, 40);
    if (extension === 4) {
      payload.writeUInt8(anchor === "middle" ? 1 : anchor === "end" ? 2 : 0, 44);
      payload.writeUInt8(baseline === "alphabetic" ? 1 : 0, 45);
    }
    utf8.copy(payload, headerSize);
    this.command(8, payload);
  }

  styledSystemText(text: string, left: number, top: number, fontSize: number,
    color: Color, strokeColor: Color, strokeWidth: number,
    family: FontFamily = "system", weight: FontWeight = "regular",
    style: FontStyle = "regular", letterSpacing = 0,
    decoration: TextDecoration = TextDecoration.None, fontResourceId = 0,
    anchor: "start" | "middle" | "end" = "start",
    baseline: "top" | "alphabetic" = "top"): void {
    const utf8 = Buffer.from(text, "utf8");
    const values = [left, top, fontSize, color.red, color.green, color.blue, color.alpha,
      letterSpacing, strokeColor.red, strokeColor.green, strokeColor.blue, strokeColor.alpha,
      strokeWidth];
    if (utf8.length === 0 || utf8.length > 65536 || utf8.includes(0) ||
        values.some((value) => !Number.isFinite(value)) || fontSize <= 0 ||
        Math.abs(letterSpacing) > 10 || strokeWidth <= 0 || strokeWidth > 4 ||
        !Number.isInteger(decoration) || decoration < 0 || decoration > 3 ||
        !Number.isInteger(fontResourceId) || fontResourceId < 0 || fontResourceId > 0xffff_ffff)
      throw new RangeError("Styled system text values are outside supported bounds");
    const payload = Buffer.alloc(64 + utf8.length);
    payload.writeUInt8(fontFamilyCode(family), 0); payload.writeUInt8(fontWeightCode(weight), 1);
    payload.writeUInt8(style === "italic" ? 1 : 0, 2); payload.writeUInt8(decoration, 3);
    [left, top, fontSize, color.red, color.green, color.blue, color.alpha, letterSpacing]
      .forEach((value, index) => payload.writeFloatLE(value, 4 + index * 4));
    payload.writeUInt32LE(fontResourceId, 36);
    payload.writeUInt8(anchor === "middle" ? 1 : anchor === "end" ? 2 : 0, 40);
    payload.writeUInt8(baseline === "alphabetic" ? 1 : 0, 41);
    [strokeColor.red, strokeColor.green, strokeColor.blue, strokeColor.alpha, strokeWidth]
      .forEach((value, index) => payload.writeFloatLE(value, 44 + index * 4));
    utf8.copy(payload, 64); this.command(41, payload);
  }

  gradientSystemText(text: string, left: number, top: number, fontSize: number,
    gradient: PathGradientPaint, family: FontFamily = "system",
    weight: FontWeight = "regular", style: FontStyle = "regular", letterSpacing = 0,
    decoration: TextDecoration = TextDecoration.None, fontResourceId = 0,
    anchor: "start" | "middle" | "end" = "start",
    baseline: "top" | "alphabetic" = "top"): void {
    const utf8 = Buffer.from(text, "utf8");
    const stops = gradient.stops ?? [
      { offset: 0, color: gradient.startColor }, { offset: 1, color: gradient.endColor }];
    const finite = [left, top, fontSize, letterSpacing, gradient.start.x, gradient.start.y,
      gradient.end.x, gradient.end.y,
      ...stops.flatMap((stop) => [stop.offset, stop.color.red, stop.color.green,
        stop.color.blue, stop.color.alpha])].every(Number.isFinite);
    if (utf8.length === 0 || utf8.length > 65536 || utf8.includes(0) || !finite ||
        fontSize <= 0 || Math.abs(letterSpacing) > 10 || stops.length < 2 || stops.length > 8 ||
        stops.some((stop, index) => stop.offset < 0 || stop.offset > 1 ||
          index > 0 && stop.offset < stops[index - 1]!.offset) ||
        !Number.isInteger(decoration) || decoration < 0 || decoration > 3 ||
        !Number.isInteger(fontResourceId) || fontResourceId < 0 || fontResourceId > 0xffff_ffff)
      throw new RangeError("Gradient system text values are outside supported bounds");
    const payload = Buffer.alloc(48 + stops.length * 20 + utf8.length);
    payload.writeUInt8(fontFamilyCode(family), 0); payload.writeUInt8(fontWeightCode(weight), 1);
    payload.writeUInt8(style === "italic" ? 1 : 0, 2); payload.writeUInt8(decoration, 3);
    [left, top, fontSize, letterSpacing]
      .forEach((value, index) => payload.writeFloatLE(value, 4 + index * 4));
    payload.writeUInt32LE(fontResourceId, 20);
    payload.writeUInt8(anchor === "middle" ? 1 : anchor === "end" ? 2 : 0, 24);
    payload.writeUInt8(baseline === "alphabetic" ? 1 : 0, 25);
    [gradient.start.x, gradient.start.y, gradient.end.x, gradient.end.y]
      .forEach((value, index) => payload.writeFloatLE(value, 28 + index * 4));
    payload.writeUInt8(stops.length, 44);
    payload.writeUInt8(gradient.spread === "repeat" ? 1 : gradient.spread === "reflect" ? 2 : 0, 45);
    payload.writeUInt8(gradient.coordinateSpace === "objectBoundingBox" ? 1 : 0, 46);
    stops.forEach((stop, index) => [stop.offset, stop.color.red, stop.color.green,
      stop.color.blue, stop.color.alpha].forEach((value, component) =>
        payload.writeFloatLE(value, 48 + index * 20 + component * 4)));
    utf8.copy(payload, 48 + stops.length * 20); this.command(43, payload);
  }

  radialGradientSystemText(text: string, left: number, top: number, fontSize: number,
    gradient: PathRadialGradientPaint, family: FontFamily = "system",
    weight: FontWeight = "regular", style: FontStyle = "regular", letterSpacing = 0,
    decoration: TextDecoration = TextDecoration.None, fontResourceId = 0,
    anchor: "start" | "middle" | "end" = "start",
    baseline: "top" | "alphabetic" = "top"): void {
    const utf8 = Buffer.from(text, "utf8");
    const stops = gradient.stops ?? [{ offset: 0, color: gradient.innerColor },
      { offset: 1, color: gradient.outerColor }];
    const focal = gradient.focal ?? gradient.center;
    const values = [left, top, fontSize, letterSpacing, gradient.center.x, gradient.center.y,
      gradient.axisX.x, gradient.axisX.y, gradient.axisY.x, gradient.axisY.y, focal.x, focal.y,
      gradient.focalRadius ?? 0, ...stops.flatMap((stop) => [stop.offset, stop.color.red,
        stop.color.green, stop.color.blue, stop.color.alpha])];
    const determinant = gradient.axisX.x * gradient.axisY.y - gradient.axisX.y * gradient.axisY.x;
    if (utf8.length === 0 || utf8.length > 65536 || utf8.includes(0) ||
        values.some((value) => !Number.isFinite(value)) || fontSize <= 0 || Math.abs(letterSpacing) > 10 ||
        Math.abs(determinant) <= 0.000001 || stops.length < 2 || stops.length > 8 ||
        stops.some((stop, index) => stop.offset < 0 || stop.offset > 1 ||
          index > 0 && stop.offset < stops[index - 1]!.offset) ||
        (gradient.focalRadius ?? 0) < 0 || (gradient.focalRadius ?? 0) >= 1)
      throw new RangeError("Radial-gradient system text values are outside supported bounds");
    const payload = Buffer.alloc(68 + stops.length * 20 + utf8.length);
    payload.writeUInt8(fontFamilyCode(family), 0); payload.writeUInt8(fontWeightCode(weight), 1);
    payload.writeUInt8(style === "italic" ? 1 : 0, 2); payload.writeUInt8(decoration, 3);
    [left, top, fontSize, letterSpacing].forEach((value, index) => payload.writeFloatLE(value, 4 + index * 4));
    payload.writeUInt32LE(fontResourceId, 20);
    payload.writeUInt8(anchor === "middle" ? 1 : anchor === "end" ? 2 : 0, 24);
    payload.writeUInt8(baseline === "alphabetic" ? 1 : 0, 25);
    [gradient.center.x, gradient.center.y, gradient.axisX.x, gradient.axisX.y,
      gradient.axisY.x, gradient.axisY.y, focal.x, focal.y, gradient.focalRadius ?? 0]
      .forEach((value, index) => payload.writeFloatLE(value, 28 + index * 4));
    payload.writeUInt8(stops.length, 64);
    payload.writeUInt8(gradient.spread === "repeat" ? 1 : gradient.spread === "reflect" ? 2 : 0, 65);
    payload.writeUInt8(gradient.coordinateSpace === "objectBoundingBox" ? 1 : 0, 66);
    stops.forEach((stop, index) => [stop.offset, stop.color.red, stop.color.green,
      stop.color.blue, stop.color.alpha].forEach((value, component) =>
        payload.writeFloatLE(value, 68 + index * 20 + component * 4)));
    utf8.copy(payload, 68 + stops.length * 20); this.command(44, payload);
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

  shadow(value: ShadowPaint): void {
    const values = [value.destination.left, value.destination.top, value.destination.right,
      value.destination.bottom, value.cornerRadius, value.blur, value.spread,
      value.color.red, value.color.green, value.color.blue, value.color.alpha];
    if (values.some((item) => !Number.isFinite(item)) || value.cornerRadius < 0 ||
        value.blur < 0 || value.blur > 256 || value.spread < -256 || value.spread > 256)
      throw new RangeError("Shadow values must be finite and within supported bounds");
    const payload = Buffer.alloc(44);
    values.forEach((item, index) => payload.writeFloatLE(item, index * 4));
    this.command(13, payload);
  }

  radialGradient(value: RadialGradientPaint): void {
    const values = [value.destination.left, value.destination.top, value.destination.right,
      value.destination.bottom, value.centerX, value.centerY, value.radius, value.cornerRadius,
      value.innerColor.red, value.innerColor.green, value.innerColor.blue, value.innerColor.alpha,
      value.outerColor.red, value.outerColor.green, value.outerColor.blue, value.outerColor.alpha];
    if (values.some((item) => !Number.isFinite(item)) || value.centerX < 0 || value.centerX > 1 ||
        value.centerY < 0 || value.centerY > 1 || value.radius <= 0 || value.radius > 8192 ||
        value.cornerRadius < 0)
      throw new RangeError("Radial gradient values are outside supported bounds");
    const payload = Buffer.alloc(64);
    values.forEach((item, index) => payload.writeFloatLE(item, index * 4));
    this.command(14, payload);
  }

  roundedRect(value: RoundedRectPaint): void {
    const values = [value.destination.left, value.destination.top, value.destination.right,
      value.destination.bottom, value.cornerRadius, value.borderWidth,
      value.fillColor.red, value.fillColor.green, value.fillColor.blue, value.fillColor.alpha,
      value.borderColor.red, value.borderColor.green, value.borderColor.blue, value.borderColor.alpha];
    if (values.some((item) => !Number.isFinite(item)) || value.cornerRadius < 0 ||
        value.borderWidth < 0 || value.cornerRadius > 8192 || value.borderWidth > 8192)
      throw new RangeError("Rounded rectangle values are outside supported bounds");
    const payload = Buffer.alloc(56);
    values.forEach((item, index) => payload.writeFloatLE(item, index * 4));
    this.command(15, payload);
  }

  circle(value: CirclePaint): void {
    const values = [value.destination.left, value.destination.top, value.destination.right,
      value.destination.bottom, value.borderWidth,
      value.fillColor.red, value.fillColor.green, value.fillColor.blue, value.fillColor.alpha,
      value.borderColor.red, value.borderColor.green, value.borderColor.blue, value.borderColor.alpha];
    if (values.some((item) => !Number.isFinite(item)) ||
        value.borderWidth < 0 || value.borderWidth > 8192)
      throw new RangeError("Circle values are outside supported bounds");
    const payload = Buffer.alloc(52);
    values.forEach((item, index) => payload.writeFloatLE(item, index * 4));
    this.command(16, payload);
  }

  arc(value: ArcPaint): void {
    const twoPi = Math.PI * 2;
    const startAngle = ((value.startAngle + Math.PI) % twoPi + twoPi) % twoPi - Math.PI;
    const values = [value.destination.left, value.destination.top, value.destination.right,
      value.destination.bottom, startAngle, value.sweepAngle, value.thickness,
      value.roundCaps ? 1 : 0, value.color.red, value.color.green, value.color.blue,
      value.color.alpha];
    if (!Number.isFinite(value.startAngle) || values.some((item) => !Number.isFinite(item)) ||
        value.sweepAngle <= 0 || value.sweepAngle > twoPi ||
        value.thickness <= 0 || value.thickness > 8192)
      throw new RangeError("Arc values are outside supported bounds");
    const payload = Buffer.alloc(48);
    values.forEach((item, index) => payload.writeFloatLE(item, index * 4));
    this.command(46, payload);
  }

  gradientArc(value: GradientArcPaint): void {
    const twoPi = Math.PI * 2;
    const startAngle = ((value.startAngle + Math.PI) % twoPi + twoPi) % twoPi - Math.PI;
    const values = [value.destination.left, value.destination.top, value.destination.right,
      value.destination.bottom, startAngle, value.sweepAngle, value.thickness,
      value.roundCaps ? 1 : 0,
      value.startColor.red, value.startColor.green, value.startColor.blue, value.startColor.alpha,
      value.endColor.red, value.endColor.green, value.endColor.blue, value.endColor.alpha];
    if (!Number.isFinite(value.startAngle) || values.some((item) => !Number.isFinite(item)) ||
        value.sweepAngle <= 0 || value.sweepAngle > twoPi ||
        value.thickness <= 0 || value.thickness > 8192)
      throw new RangeError("Gradient arc values are outside supported bounds");
    const payload = Buffer.alloc(64);
    values.forEach((item, index) => payload.writeFloatLE(item, index * 4));
    this.command(47, payload);
  }

  diagonalPattern(value: DiagonalPatternPaint): void {
    const values = [value.destination.left, value.destination.top, value.destination.right,
      value.destination.bottom, value.stripeWidth, value.gap, value.offset,
      value.backward ? 1 : 0, value.color.red, value.color.green, value.color.blue, value.color.alpha];
    if (values.some((item) => !Number.isFinite(item)) || value.stripeWidth <= 0 ||
        value.gap < 0 || value.stripeWidth > 1024 || value.gap > 1024)
      throw new RangeError("Diagonal pattern values are outside supported bounds");
    const payload = Buffer.alloc(48);
    values.forEach((item, index) => payload.writeFloatLE(item, index * 4));
    this.command(17, payload);
  }

  linearGradient(value: LinearGradientPaint): void {
    const directions = { horizontal: 0, vertical: 1, diagonal: 2 } as const;
    const values = [value.destination.left, value.destination.top, value.destination.right,
      value.destination.bottom, value.cornerRadius, directions[value.direction],
      value.startColor.red, value.startColor.green, value.startColor.blue, value.startColor.alpha,
      value.endColor.red, value.endColor.green, value.endColor.blue, value.endColor.alpha];
    if (values.some((item) => !Number.isFinite(item)) || value.cornerRadius < 0 ||
        value.cornerRadius > 8192)
      throw new RangeError("Linear gradient values are outside supported bounds");
    const payload = Buffer.alloc(56);
    values.forEach((item, index) => payload.writeFloatLE(item, index * 4));
    this.command(18, payload);
  }

  linearGradientCircle(value: LinearGradientCirclePaint): void {
    const directions = { horizontal: 0, vertical: 1, diagonal: 2 } as const;
    const values = [value.destination.left, value.destination.top, value.destination.right,
      value.destination.bottom, directions[value.direction],
      value.startColor.red, value.startColor.green, value.startColor.blue, value.startColor.alpha,
      value.endColor.red, value.endColor.green, value.endColor.blue, value.endColor.alpha];
    if (values.some((item) => !Number.isFinite(item)))
      throw new RangeError("Linear gradient circle values must be finite");
    const payload = Buffer.alloc(52);
    values.forEach((item, index) => payload.writeFloatLE(item, index * 4));
    this.command(25, payload);
  }

  gridPattern(value: GridPatternPaint): void {
    const values = [value.destination.left, value.destination.top, value.destination.right,
      value.destination.bottom, value.spacing, value.minorWidth, value.majorWidth,
      value.offsetX, value.offsetY, value.majorEvery, value.cornerRadius,
      value.minorColor.red, value.minorColor.green, value.minorColor.blue, value.minorColor.alpha,
      value.majorColor.red, value.majorColor.green, value.majorColor.blue, value.majorColor.alpha];
    if (values.some((item) => !Number.isFinite(item)) || value.spacing < 2 ||
        value.spacing > 1024 || value.minorWidth < 0 || value.majorWidth < 0 ||
        value.minorWidth > value.spacing || value.majorWidth > value.spacing ||
        value.cornerRadius < 0 || value.cornerRadius > 8192 ||
        !Number.isInteger(value.majorEvery) || value.majorEvery < 1 || value.majorEvery > 256)
      throw new RangeError("Grid pattern values are outside supported bounds");
    const payload = Buffer.alloc(76);
    values.forEach((item, index) => payload.writeFloatLE(item, index * 4));
    this.command(26, payload);
  }

  conicGradient(value: ConicGradientPaint): void {
    const values = [value.destination.left, value.destination.top, value.destination.right,
      value.destination.bottom, value.centerX, value.centerY, value.rotation, value.cornerRadius,
      value.startColor.red, value.startColor.green, value.startColor.blue, value.startColor.alpha,
      value.middleColor.red, value.middleColor.green,
      value.middleColor.blue, value.middleColor.alpha,
      value.endColor.red, value.endColor.green, value.endColor.blue, value.endColor.alpha];
    if (values.some((item) => !Number.isFinite(item)) || value.centerX < 0 || value.centerX > 1 ||
        value.centerY < 0 || value.centerY > 1 || value.cornerRadius < 0 ||
        value.cornerRadius > 8192)
      throw new RangeError("Conic gradient values are outside supported bounds");
    const payload = Buffer.alloc(80);
    values.forEach((item, index) => payload.writeFloatLE(item, index * 4));
    this.command(23, payload);
  }

  dotGrid(value: DotGridPaint): void {
    const cellCount = value.rows * value.columns;
    const floats = [value.destination.left, value.destination.top, value.destination.right,
      value.destination.bottom, value.inset, value.radius, value.borderWidth,
      value.fillColor.red, value.fillColor.green, value.fillColor.blue, value.fillColor.alpha,
      value.ringColor.red, value.ringColor.green, value.ringColor.blue, value.ringColor.alpha,
      value.highlightColor.red, value.highlightColor.green,
      value.highlightColor.blue, value.highlightColor.alpha];
    if (!Number.isInteger(value.rows) || !Number.isInteger(value.columns) || value.rows <= 0 ||
        value.columns <= 0 || cellCount > 32 || !Number.isInteger(value.filledMask) ||
        value.filledMask < 0 || value.filledMask > 0xffff_ffff ||
        !Number.isInteger(value.activeIndex) || value.activeIndex < -1 ||
        value.activeIndex >= cellCount || floats.some((item) => !Number.isFinite(item)) ||
        value.inset < 0 || value.radius <= 0 || value.radius > 1024 ||
        value.borderWidth < 0 || value.borderWidth > 1024)
      throw new RangeError("Dot-grid values are outside supported bounds");
    const payload = Buffer.alloc(96);
    [value.destination.left, value.destination.top, value.destination.right,
      value.destination.bottom].forEach((item, index) => payload.writeFloatLE(item, index * 4));
    payload.writeUInt32LE(value.rows, 16); payload.writeUInt32LE(value.columns, 20);
    payload.writeUInt32LE(value.filledMask, 24); payload.writeInt32LE(value.activeIndex, 28);
    [value.inset, value.radius, value.borderWidth, 0,
      value.fillColor.red, value.fillColor.green, value.fillColor.blue, value.fillColor.alpha,
      value.ringColor.red, value.ringColor.green, value.ringColor.blue, value.ringColor.alpha,
      value.highlightColor.red, value.highlightColor.green,
      value.highlightColor.blue, value.highlightColor.alpha]
      .forEach((item, index) => payload.writeFloatLE(item, 32 + index * 4));
    this.command(20, payload);
  }

  waveDots(value: WaveDotsPaint): void {
    const colors = [value.troughStartColor, value.troughEndColor,
      value.crestStartColor, value.crestEndColor, value.borderColor];
    const floats = [value.destination.left, value.destination.top, value.destination.right,
      value.destination.bottom, value.inset, value.minimumRadius, value.maximumRadius,
      value.phase, value.frequency, value.borderWidth,
      ...colors.flatMap((color) => [color.red, color.green, color.blue, color.alpha])];
    if (!Number.isInteger(value.count) || value.count <= 0 || value.count > 256 ||
        floats.some((item) => !Number.isFinite(item)) || value.inset < 0 ||
        value.minimumRadius <= 0 || value.maximumRadius < value.minimumRadius ||
        value.maximumRadius > 4096 || value.borderWidth < 0 || value.borderWidth > 1024)
      throw new RangeError("Wave-dot values are outside supported bounds");
    const payload = Buffer.alloc(128);
    [value.destination.left, value.destination.top, value.destination.right,
      value.destination.bottom].forEach((item, index) => payload.writeFloatLE(item, index * 4));
    payload.writeUInt32LE(value.count, 16);
    [value.inset, value.minimumRadius, value.maximumRadius, value.phase,
      value.frequency, value.borderWidth,
      ...colors.flatMap((color) => [color.red, color.green, color.blue, color.alpha])]
      .forEach((item, index) => payload.writeFloatLE(item, 24 + index * 4));
    this.command(21, payload);
  }

  meshResource(meshId: number, destination: ClipRect,
    viewBox: { readonly x: number; readonly y: number; readonly width: number;
      readonly height: number }): void {
    const values = [destination.left, destination.top, destination.right, destination.bottom,
      viewBox.x, viewBox.y, viewBox.width, viewBox.height];
    if (!Number.isSafeInteger(meshId) || meshId <= 0 || meshId > 0xffff_ffff ||
        values.some((value) => !Number.isFinite(value)) || viewBox.width <= 0 || viewBox.height <= 0)
      throw new RangeError("Mesh draw requires an ID and positive finite view box");
    const payload = Buffer.alloc(40);
    payload.writeUInt32LE(meshId, 0);
    values.forEach((value, index) => payload.writeFloatLE(value, 8 + index * 4));
    this.command(22, payload);
  }

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
