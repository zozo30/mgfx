import { SVGPathData } from "svg-pathdata";
import type { Color } from "@mgfx/demo-client/protocol";
import type { Rect } from "@mgfx/demo-client/ui";
import { svgAttributes, svgPrimitivePath } from "./icon-pack.js";

export interface SvgVectorLayer {
  readonly path: string;
  readonly fill?: Color;
  readonly stroke?: Color;
  readonly strokeWidth: number;
  readonly fillRule: "nonzero" | "evenodd";
  readonly lineCap: "butt" | "round";
  readonly lineJoin: "bevel" | "round";
}

export interface SvgVectorDocument {
  readonly viewBox: Rect;
  readonly layers: readonly SvgVectorLayer[];
}

interface Matrix { a: number; b: number; c: number; d: number; e: number; f: number }
interface PaintState {
  readonly fill?: Color;
  readonly stroke?: Color;
  readonly strokeWidth: number;
  readonly opacity: number;
  readonly fillRule: "nonzero" | "evenodd";
  readonly lineCap: "butt" | "round";
  readonly lineJoin: "bevel" | "round";
  readonly currentColor: Color;
  readonly transform: Matrix;
}

const identity: Matrix = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
const white: Color = { red: 1, green: 1, blue: 1, alpha: 1 };
const primitiveTags = new Set(["path", "line", "polyline", "polygon", "rect", "circle", "ellipse"]);

export function parseSvgVectorDocument(source: string, defaultColor: Color = white): SvgVectorDocument {
  if (Buffer.byteLength(source, "utf8") > 1024 * 1024) throw new RangeError("SVG exceeds 1 MiB");
  if (/<(?:script|image|foreignObject|use)\b/i.test(source))
    throw new Error("SVG contains external or executable content");
  const svgMatch = source.match(/<svg\b([^>]*)>/i);
  if (!svgMatch) throw new Error("SVG document has no root element");
  const rootAttributes = withInlineStyle(svgAttributes(svgMatch[1]!));
  const viewBox = parseViewBox(rootAttributes);
  const initial: PaintState = { fill: { red: 0, green: 0, blue: 0, alpha: 1 },
    strokeWidth: 1, opacity: 1, fillRule: "nonzero", lineCap: "butt", lineJoin: "bevel",
    currentColor: defaultColor, transform: identity };
  const stack: PaintState[] = [initial];
  const layers: SvgVectorLayer[] = [];
  const tokens = source.match(/<\/?[A-Za-z][^>]*>/g) ?? [];
  for (const token of tokens) {
    const closing = /^<\//.test(token);
    const name = token.match(/^<\/?\s*([\w:-]+)/)?.[1]?.toLowerCase();
    if (!name) continue;
    if (closing) {
      if ((name === "svg" || name === "g") && stack.length > 1) stack.pop();
      continue;
    }
    const attributeSource = token.replace(/^<\s*[\w:-]+|\/?\s*>$/g, "");
    const attributes = withInlineStyle(svgAttributes(attributeSource));
    const parent = stack[stack.length - 1]!;
    const state = inherit(parent, attributes);
    if (name === "svg" || name === "g") {
      stack.push(state);
      if (/\/\s*>$/.test(token)) stack.pop();
      continue;
    }
    if (!primitiveTags.has(name)) continue;
    const rawPath = svgPrimitivePath(name, attributes);
    if (!rawPath) continue;
    const path = applyMatrix(rawPath, state.transform);
    const opacity = state.opacity;
    const fill = state.fill ? multiplyAlpha(state.fill, opacity) : undefined;
    const stroke = state.stroke ? multiplyAlpha(state.stroke, opacity) : undefined;
    if ((!fill || fill.alpha <= 0) && (!stroke || stroke.alpha <= 0 || state.strokeWidth <= 0)) continue;
    layers.push({ path, ...(fill ? { fill } : {}), ...(stroke ? { stroke } : {}),
      strokeWidth: state.strokeWidth * matrixScale(state.transform), fillRule: state.fillRule,
      lineCap: state.lineCap, lineJoin: state.lineJoin });
    if (layers.length > 1024) throw new RangeError("SVG exceeds 1024 vector layers");
  }
  if (layers.length === 0) throw new Error("SVG has no supported vector layers");
  return { viewBox, layers };
}

function withInlineStyle(attributes: Readonly<Record<string, string>>): Readonly<Record<string, string>> {
  const declarations = Object.fromEntries((attributes.style ?? "").split(";").flatMap((item) => {
    const separator = item.indexOf(":");
    return separator < 0 ? [] : [[item.slice(0, separator).trim(), item.slice(separator + 1).trim()]];
  }));
  return { ...attributes, ...declarations };
}

function parseViewBox(attributes: Readonly<Record<string, string>>): Rect {
  const values = attributes.viewBox?.trim().split(/[\s,]+/).map(Number);
  if (values?.length === 4 && values.every(Number.isFinite) && values[2]! > 0 && values[3]! > 0)
    return { x: values[0]!, y: values[1]!, width: values[2]!, height: values[3]! };
  const width = Number(attributes.width), height = Number(attributes.height);
  if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0)
    return { x: 0, y: 0, width, height };
  throw new Error("SVG requires a positive viewBox or numeric width and height");
}

function inherit(parent: PaintState, attributes: Readonly<Record<string, string>>): PaintState {
  const currentColor = parseColor(attributes.color, parent.currentColor) ?? parent.currentColor;
  const fill = attributes.fill === undefined ? parent.fill : parseColor(attributes.fill, currentColor);
  const stroke = attributes.stroke === undefined ? parent.stroke : parseColor(attributes.stroke, currentColor);
  const strokeWidth = numberAttribute(attributes["stroke-width"], parent.strokeWidth);
  const opacity = clamp01(parent.opacity * numberAttribute(attributes.opacity, 1));
  const fillOpacity = clamp01(numberAttribute(attributes["fill-opacity"], 1));
  const strokeOpacity = clamp01(numberAttribute(attributes["stroke-opacity"], 1));
  const fillRule = attributes["fill-rule"] === "evenodd" ? "evenodd" :
    attributes["fill-rule"] === "nonzero" ? "nonzero" : parent.fillRule;
  const lineCap = attributes["stroke-linecap"] === "round" ? "round" :
    attributes["stroke-linecap"] === "butt" ? "butt" : parent.lineCap;
  const lineJoin = attributes["stroke-linejoin"] === "round" ? "round" :
    attributes["stroke-linejoin"] ? "bevel" : parent.lineJoin;
  return { ...(fill ? { fill: multiplyAlpha(fill, fillOpacity) } : {}),
    ...(stroke ? { stroke: multiplyAlpha(stroke, strokeOpacity) } : {}),
    strokeWidth, opacity, fillRule, lineCap, lineJoin, currentColor,
    transform: multiply(parent.transform, parseTransform(attributes.transform)) };
}

function parseColor(value: string | undefined, currentColor: Color): Color | undefined {
  if (value === undefined) return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized === "none") return undefined;
  if (normalized === "currentcolor") return currentColor;
  const named: Readonly<Record<string, string>> = {
    black: "#000000", white: "#ffffff", red: "#ff0000", green: "#008000",
    blue: "#0000ff", cyan: "#00ffff", magenta: "#ff00ff", yellow: "#ffff00",
  };
  const hex = named[normalized] ?? normalized;
  const match = hex.match(/^#([0-9a-f]{3,8})$/i);
  if (match) {
    let digits = match[1]!;
    if (digits.length === 3 || digits.length === 4) digits = [...digits].map((item) => item + item).join("");
    if (digits.length === 6 || digits.length === 8) return {
      red: Number.parseInt(digits.slice(0, 2), 16) / 255,
      green: Number.parseInt(digits.slice(2, 4), 16) / 255,
      blue: Number.parseInt(digits.slice(4, 6), 16) / 255,
      alpha: digits.length === 8 ? Number.parseInt(digits.slice(6, 8), 16) / 255 : 1,
    };
  }
  const rgb = normalized.match(/^rgba?\(([^)]+)\)$/);
  if (rgb) {
    const parts = rgb[1]!.split(/[\s,\/]+/).filter(Boolean).map(Number);
    if ((parts.length === 3 || parts.length === 4) && parts.every(Number.isFinite)) return {
      red: clamp01(parts[0]! / 255), green: clamp01(parts[1]! / 255),
      blue: clamp01(parts[2]! / 255), alpha: clamp01(parts[3] ?? 1),
    };
  }
  throw new Error(`Unsupported SVG color ${value}`);
}

function parseTransform(value: string | undefined): Matrix {
  let result = identity;
  for (const match of value?.matchAll(/([a-zA-Z]+)\s*\(([^)]*)\)/g) ?? []) {
    const name = match[1]!.toLowerCase();
    const values = match[2]!.trim().split(/[\s,]+/).filter(Boolean).map(Number);
    if (values.some((item) => !Number.isFinite(item))) throw new Error("Invalid SVG transform");
    let next = identity;
    if (name === "matrix" && values.length === 6)
      next = { a: values[0]!, b: values[1]!, c: values[2]!, d: values[3]!, e: values[4]!, f: values[5]! };
    else if (name === "translate" && (values.length === 1 || values.length === 2))
      next = { ...identity, e: values[0]!, f: values[1] ?? 0 };
    else if (name === "scale" && (values.length === 1 || values.length === 2))
      next = { ...identity, a: values[0]!, d: values[1] ?? values[0]! };
    else if (name === "rotate" && (values.length === 1 || values.length === 3)) {
      const radians = values[0]! * Math.PI / 180, cosine = Math.cos(radians), sine = Math.sin(radians);
      const rotation = { a: cosine, b: sine, c: -sine, d: cosine, e: 0, f: 0 };
      next = values.length === 3
        ? multiply(multiply({ ...identity, e: values[1]!, f: values[2]! }, rotation),
          { ...identity, e: -values[1]!, f: -values[2]! }) : rotation;
    } else throw new Error(`Unsupported SVG transform ${name}`);
    result = multiply(result, next);
  }
  return result;
}

function multiply(left: Matrix, right: Matrix): Matrix {
  return { a: left.a * right.a + left.c * right.b,
    b: left.b * right.a + left.d * right.b,
    c: left.a * right.c + left.c * right.d,
    d: left.b * right.c + left.d * right.d,
    e: left.a * right.e + left.c * right.f + left.e,
    f: left.b * right.e + left.d * right.f + left.f };
}

function matrixScale(matrix: Matrix): number {
  return Math.sqrt(Math.abs(matrix.a * matrix.d - matrix.b * matrix.c));
}

function applyMatrix(path: string, matrix: Matrix): string {
  if (matrix.a === 1 && matrix.b === 0 && matrix.c === 0 && matrix.d === 1 &&
      matrix.e === 0 && matrix.f === 0) return path;
  return new SVGPathData(path).toAbs().matrix(
    matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f).encode();
}

function multiplyAlpha(color: Color, opacity: number): Color {
  return { ...color, alpha: clamp01(color.alpha * opacity) };
}
function numberAttribute(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const result = Number(value);
  if (!Number.isFinite(result) || result < 0) throw new Error(`Invalid SVG number ${value}`);
  return result;
}
const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
