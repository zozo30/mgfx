import { SVGPathData } from "svg-pathdata";
import type { Color } from "@mgfx/demo-client/protocol";
import type { Rect } from "@mgfx/demo-client/ui";
import { svgAttributes, svgPrimitivePath } from "./icon-pack.js";

type DashStyle = { readonly length: number; readonly gap: number; readonly offset?: number } |
  { readonly values: readonly number[]; readonly offset?: number };

export interface SvgVectorLayer {
  readonly path: string;
  readonly fill?: Color;
  readonly fillGradient?: LinearGradientPaint;
  readonly fillRadialGradient?: RadialGradientPaint;
  readonly stroke?: Color;
  readonly strokeGradient?: LinearGradientPaint;
  readonly strokeRadialGradient?: RadialGradientPaint;
  readonly strokeWidth: number;
  readonly fillRule: "nonzero" | "evenodd";
  readonly lineCap: "butt" | "round" | "square";
  readonly lineJoin: "bevel" | "round" | "miter";
  readonly miterLimit?: number;
  readonly dash?: DashStyle;
}

export interface LinearGradientPaint {
  readonly start: { readonly x: number; readonly y: number };
  readonly end: { readonly x: number; readonly y: number };
  readonly startColor: Color;
  readonly endColor: Color;
  readonly stops?: readonly { readonly offset: number; readonly color: Color }[];
  readonly spread?: "pad" | "repeat" | "reflect";
}

export interface RadialGradientPaint {
  readonly center: { readonly x: number; readonly y: number };
  readonly axisX: { readonly x: number; readonly y: number };
  readonly axisY: { readonly x: number; readonly y: number };
  readonly innerColor: Color;
  readonly outerColor: Color;
  readonly stops?: readonly { readonly offset: number; readonly color: Color }[];
  readonly spread?: "pad" | "repeat" | "reflect";
  readonly focal?: { readonly x: number; readonly y: number };
  readonly focalRadius?: number;
}

export interface SvgVectorDocument {
  readonly viewBox: Rect;
  readonly layers: readonly SvgVectorLayer[];
}

interface Matrix { a: number; b: number; c: number; d: number; e: number; f: number }
interface PaintState {
  readonly fill?: Color;
  readonly fillGradientId?: string;
  readonly stroke?: Color;
  readonly strokeGradientId?: string;
  readonly strokeWidth: number;
  readonly opacity: number;
  readonly fillOpacity: number;
  readonly strokeOpacity: number;
  readonly fillRule: "nonzero" | "evenodd";
  readonly lineCap: "butt" | "round" | "square";
  readonly lineJoin: "bevel" | "round" | "miter";
  readonly miterLimit?: number;
  readonly currentColor: Color;
  readonly transform: Matrix;
  readonly dash?: DashStyle;
}

interface GradientDefinition {
  readonly units: "objectBoundingBox" | "userSpaceOnUse";
  readonly x1: string;
  readonly y1: string;
  readonly x2: string;
  readonly y2: string;
  readonly transform: Matrix;
  readonly stops: readonly { readonly offset: number; readonly color: Color }[];
  readonly spread: "pad" | "repeat" | "reflect";
}

interface RawGradientDefinition {
  readonly attributes: Readonly<Record<string, string>>;
  readonly stops: readonly { readonly offset: number; readonly color: Color }[];
}

interface RawRadialGradientDefinition {
  readonly attributes: Readonly<Record<string, string>>;
  readonly stops: readonly { readonly offset: number; readonly color: Color }[];
}

interface RadialGradientDefinition {
  readonly units: "objectBoundingBox" | "userSpaceOnUse";
  readonly cx: string; readonly cy: string; readonly radius: string;
  readonly fx: string; readonly fy: string;
  readonly focalRadius: string;
  readonly transform: Matrix;
  readonly stops: readonly { readonly offset: number; readonly color: Color }[];
  readonly spread: "pad" | "repeat" | "reflect";
}

const identity: Matrix = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
const white: Color = { red: 1, green: 1, blue: 1, alpha: 1 };
const primitiveTags = new Set(["path", "line", "polyline", "polygon", "rect", "circle", "ellipse"]);

interface LocalSvgReference {
  readonly tag: string;
  readonly attributes: Readonly<Record<string, string>>;
  readonly body?: string;
}

function expandLocalUses(source: string): string {
  const references = new Map<string, LocalSvgReference>();
  const remember = (tag: string, attributeSource: string, body?: string) => {
    const attributes = svgAttributes(attributeSource);
    const id = attributes.id?.trim();
    if (!id) return;
    if (references.has(id)) throw new Error(`SVG contains duplicate local id #${id}`);
    references.set(id, { tag: tag.toLowerCase(), attributes, ...(body !== undefined ? { body } : {}) });
  };
  const containers: { tag: string; attributes: string; bodyStart: number }[] = [];
  const tagPattern = /<\/?\s*([A-Za-z][\w:-]*)\b[^>]*>/g;
  for (let match = tagPattern.exec(source); match; match = tagPattern.exec(source)) {
    const tag = match[1]!.toLowerCase();
    if (tag !== "symbol" && tag !== "g") continue;
    if (/^<\//.test(match[0])) {
      const opened = containers.pop();
      if (opened?.tag !== tag) throw new Error("SVG contains mismatched local definition tags");
      remember(tag, opened.attributes, source.slice(opened.bodyStart, match.index));
    } else if (!/\/\s*>$/.test(match[0])) {
      containers.push({ tag,
        attributes: match[0].replace(/^<\s*[\w:-]+|\s*>$/g, ""),
        bodyStart: match.index + match[0].length });
    }
  }
  if (containers.length > 0) throw new Error("SVG contains unclosed local definition tags");
  for (const match of source.matchAll(
    /<(path|line|polyline|polygon|rect|circle|ellipse)\b([^>]*?)(?:\/\s*>|>\s*<\/\1\s*>)/gi))
    remember(match[1]!, match[2]!);

  const escape = (value: string) => value.replaceAll("&", "&amp;").replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  const serialize = (attributes: Readonly<Record<string, string>>, excluded: ReadonlySet<string>) =>
    Object.entries(attributes).filter(([name]) => !excluded.has(name))
      .map(([name, value]) => `${name}="${escape(value)}"`).join(" ");
  const definitionExcluded = new Set(["id", "viewBox", "width", "height", "preserveAspectRatio"]);
  const useExcluded = new Set(["href", "xlink:href", "x", "y", "width", "height",
    "transform", "preserveAspectRatio"]);
  const symbolViewportTransform = (definition: LocalSvgReference,
    instance: Readonly<Record<string, string>>): string | undefined => {
    if (definition.tag !== "symbol" || definition.attributes.viewBox === undefined) return undefined;
    const viewBox = definition.attributes.viewBox.trim().split(/[\s,]+/).map(Number);
    if (viewBox.length !== 4 || !viewBox.every(Number.isFinite) || viewBox[2]! <= 0 || viewBox[3]! <= 0)
      throw new Error("SVG symbol requires a positive numeric viewBox");
    const width = Number(instance.width ?? definition.attributes.width ?? viewBox[2]);
    const height = Number(instance.height ?? definition.attributes.height ?? viewBox[3]);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0)
      throw new Error("SVG symbol instance requires positive numeric width and height");
    const aspect = (instance.preserveAspectRatio ?? definition.attributes.preserveAspectRatio ??
      "xMidYMid meet").trim();
    if (aspect === "none") {
      const scaleX = width / viewBox[2]!, scaleY = height / viewBox[3]!;
      return `matrix(${scaleX} 0 0 ${scaleY} ${-viewBox[0]! * scaleX} ${-viewBox[1]! * scaleY})`;
    }
    const parsed = aspect.match(/^(xMin|xMid|xMax)(YMin|YMid|YMax)(?:\s+(meet|slice))?$/);
    if (!parsed) throw new Error(`Unsupported SVG preserveAspectRatio ${aspect}`);
    if (parsed[3] === "slice")
      throw new Error("SVG symbol preserveAspectRatio slice requires viewport clipping");
    const scale = Math.min(width / viewBox[2]!, height / viewBox[3]!);
    const alignX = parsed[1] === "xMin" ? 0 : parsed[1] === "xMax" ? 1 : 0.5;
    const alignY = parsed[2] === "YMin" ? 0 : parsed[2] === "YMax" ? 1 : 0.5;
    const translateX = (width - viewBox[2]! * scale) * alignX - viewBox[0]! * scale;
    const translateY = (height - viewBox[3]! * scale) * alignY - viewBox[1]! * scale;
    return `matrix(${scale} 0 0 ${scale} ${translateX} ${translateY})`;
  };
  const usePattern = /<use\b([^>]*?)(?:\/\s*>|>\s*<\/use\s*>)/gi;
  let expansionCount = 0;
  const expandFragment = (fragment: string, stack: readonly string[]): string =>
    fragment.replace(usePattern, (_token, attributeSource: string) => {
      if (++expansionCount > 4096) throw new RangeError("SVG exceeds 4096 local use instances");
      const attributes = withInlineStyle(svgAttributes(attributeSource));
      const href = attributes.href ?? attributes["xlink:href"];
      const match = href?.match(/^#([^\s]+)$/);
      if (!match) throw new Error("SVG use requires a local fragment reference");
      const id = match[1]!;
      if (stack.includes(id)) throw new Error(`SVG use reference cycle at #${id}`);
      const definition = references.get(id);
      if (!definition) throw new Error(`SVG use references missing #${id}`);
      const definitionAttributes = serialize(definition.attributes, definitionExcluded);
      const viewportTransform = symbolViewportTransform(definition, attributes);
      const body = viewportTransform && definition.body !== undefined
        ? `<g transform="${viewportTransform}">${definition.body}</g>` : definition.body;
      const referenced = definition.body === undefined
        ? `<${definition.tag}${definitionAttributes ? ` ${definitionAttributes}` : ""}/>`
        : `<g${definitionAttributes ? ` ${definitionAttributes}` : ""}>${body}</g>`;
      const expanded = expandFragment(referenced, [...stack, id]);
      const x = Number(attributes.x ?? 0), y = Number(attributes.y ?? 0);
      if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error("SVG use position must be finite");
      const presentation = serialize(attributes, useExcluded);
      const transform = `${attributes.transform ? `${attributes.transform} ` : ""}translate(${x} ${y})`;
      return `<g${presentation ? ` ${presentation}` : ""} transform="${escape(transform)}">${expanded}</g>`;
    });
  const expanded = expandFragment(source, []);
  if (Buffer.byteLength(expanded, "utf8") > 4 * 1024 * 1024)
    throw new RangeError("Expanded SVG exceeds 4 MiB");
  return expanded;
}

export function parseSvgVectorDocument(source: string, defaultColor: Color = white): SvgVectorDocument {
  if (Buffer.byteLength(source, "utf8") > 1024 * 1024) throw new RangeError("SVG exceeds 1 MiB");
  if (/<(?:script|image|foreignObject)\b|<!\s*(?:doctype|entity)\b/i.test(source))
    throw new Error("SVG contains external or executable content");
  const expandedSource = expandLocalUses(source.replace(/<!--[\s\S]*?-->/g, ""));
  const svgMatch = expandedSource.match(/<svg\b([^>]*)>/i);
  if (!svgMatch) throw new Error("SVG document has no root element");
  const rootAttributes = withInlineStyle(svgAttributes(svgMatch[1]!));
  const viewBox = parseViewBox(rootAttributes);
  const gradients = parseLinearGradients(expandedSource, defaultColor);
  const radialGradients = parseRadialGradients(expandedSource, defaultColor);
  const initial: PaintState = { fill: { red: 0, green: 0, blue: 0, alpha: 1 },
    strokeWidth: 1, opacity: 1, fillOpacity: 1, strokeOpacity: 1,
    fillRule: "nonzero", lineCap: "butt", lineJoin: "bevel",
    currentColor: defaultColor, transform: identity };
  const stack: PaintState[] = [initial];
  const layers: SvgVectorLayer[] = [];
  const tokens = expandedSource.match(/<\/?[A-Za-z][^>]*>/g) ?? [];
  let hiddenDepth = 0;
  for (const token of tokens) {
    const closing = /^<\//.test(token);
    const name = token.match(/^<\/?\s*([\w:-]+)/)?.[1]?.toLowerCase();
    if (!name) continue;
    if (closing) {
      if (name === "defs" || name === "symbol") hiddenDepth = Math.max(0, hiddenDepth - 1);
      if ((name === "svg" || name === "g") && stack.length > 1) stack.pop();
      continue;
    }
    const attributeSource = token.replace(/^<\s*[\w:-]+|\/?\s*>$/g, "");
    const attributes = withInlineStyle(svgAttributes(attributeSource));
    const parent = stack[stack.length - 1]!;
    const state = inherit(parent, attributes);
    if (name === "defs" || name === "symbol") {
      if (!/\/\s*>$/.test(token)) hiddenDepth += 1;
      continue;
    }
    if (name === "svg" || name === "g") {
      stack.push(state);
      if (/\/\s*>$/.test(token)) stack.pop();
      continue;
    }
    if (hiddenDepth > 0) continue;
    if (!primitiveTags.has(name)) continue;
    const rawPath = svgPrimitivePath(name, attributes);
    if (!rawPath) continue;
    const path = applyMatrix(rawPath, state.transform);
    const fill = state.fill ? multiplyAlpha(state.fill, state.opacity * state.fillOpacity) : undefined;
    const fillRadialGradient = state.fillGradientId && radialGradients.has(state.fillGradientId)
      ? resolveRadialGradient(radialGradients, state.fillGradientId, path, state, viewBox,
        state.fillOpacity) : undefined;
    const fillGradient = state.fillGradientId && !fillRadialGradient
      ? resolveGradient(gradients, state.fillGradientId, path, state, viewBox, state.fillOpacity) : undefined;
    const stroke = state.stroke ? multiplyAlpha(state.stroke, state.opacity * state.strokeOpacity) : undefined;
    const strokeRadialGradient = state.strokeGradientId && radialGradients.has(state.strokeGradientId)
      ? resolveRadialGradient(radialGradients, state.strokeGradientId, path, state, viewBox,
        state.strokeOpacity) : undefined;
    const strokeGradient = state.strokeGradientId && !strokeRadialGradient
      ? resolveGradient(gradients, state.strokeGradientId, path, state, viewBox,
        state.strokeOpacity) : undefined;
    if ((!fill || fill.alpha <= 0) && !fillGradient && !fillRadialGradient &&
        ((!stroke || stroke.alpha <= 0) && !strokeGradient && !strokeRadialGradient ||
         state.strokeWidth <= 0)) continue;
    layers.push({ path, ...(fill ? { fill } : {}), ...(fillGradient ? { fillGradient } : {}),
      ...(fillRadialGradient ? { fillRadialGradient } : {}),
      ...(stroke ? { stroke } : {}), ...(strokeGradient ? { strokeGradient } : {}),
      ...(strokeRadialGradient ? { strokeRadialGradient } : {}),
      strokeWidth: state.strokeWidth * matrixScale(state.transform), fillRule: state.fillRule,
      lineCap: state.lineCap, lineJoin: state.lineJoin,
      ...(state.miterLimit !== undefined ? { miterLimit: state.miterLimit } : {}),
      ...((stroke || strokeGradient || strokeRadialGradient) && state.dash
        ? { dash: scaleDash(state.dash, matrixScale(state.transform)) } : {}) });
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
  const gradientId = attributes.fill?.trim().match(/^url\(\s*#([^\s)]+)\s*\)$/i)?.[1];
  const fill = attributes.fill === undefined ? parent.fill : gradientId ? undefined :
    parseColor(attributes.fill, currentColor);
  const fillGradientId = attributes.fill === undefined ? parent.fillGradientId : gradientId;
  const strokeGradientId = attributes.stroke?.trim().match(/^url\(\s*#([^\s)]+)\s*\)$/i)?.[1];
  const stroke = attributes.stroke === undefined ? parent.stroke : strokeGradientId ? undefined :
    parseColor(attributes.stroke, currentColor);
  const inheritedStrokeGradientId = attributes.stroke === undefined
    ? parent.strokeGradientId : strokeGradientId;
  const strokeWidth = numberAttribute(attributes["stroke-width"], parent.strokeWidth);
  const opacity = clamp01(parent.opacity * numberAttribute(attributes.opacity, 1));
  const fillOpacity = clamp01(numberAttribute(attributes["fill-opacity"], parent.fillOpacity));
  const strokeOpacity = clamp01(numberAttribute(attributes["stroke-opacity"], parent.strokeOpacity));
  const fillRule = attributes["fill-rule"] === "evenodd" ? "evenodd" :
    attributes["fill-rule"] === "nonzero" ? "nonzero" : parent.fillRule;
  const lineCap = attributes["stroke-linecap"] === "round" ? "round" :
    attributes["stroke-linecap"] === "square" ? "square" :
    attributes["stroke-linecap"] === "butt" ? "butt" : parent.lineCap;
  const lineJoin = attributes["stroke-linejoin"] === "round" ? "round" :
    attributes["stroke-linejoin"] === "miter" ? "miter" :
    attributes["stroke-linejoin"] ? "bevel" : parent.lineJoin;
  const parsedMiterLimit = Number(attributes["stroke-miterlimit"]);
  const miterLimit = attributes["stroke-miterlimit"] === undefined ? parent.miterLimit :
    Number.isFinite(parsedMiterLimit) && parsedMiterLimit >= 1 ? parsedMiterLimit : parent.miterLimit;
  const dash = attributes["stroke-dasharray"] === undefined ? parent.dash :
    parseDash(attributes["stroke-dasharray"], attributes["stroke-dashoffset"] ??
      (parent.dash?.offset !== undefined ? String(parent.dash.offset) : undefined));
  const inheritedDash = dash && attributes["stroke-dashoffset"] !== undefined
    ? { ...dash, offset: finiteNumber(attributes["stroke-dashoffset"], 0) } : dash;
  return { ...(fill ? { fill } : {}), ...(fillGradientId ? { fillGradientId } : {}),
    ...(stroke ? { stroke } : {}),
    ...(inheritedStrokeGradientId ? { strokeGradientId: inheritedStrokeGradientId } : {}),
    strokeWidth, opacity, fillOpacity, strokeOpacity,
    fillRule, lineCap, lineJoin, currentColor,
    ...(miterLimit !== undefined ? { miterLimit } : {}),
    ...(inheritedDash ? { dash: inheritedDash } : {}),
    transform: multiply(parent.transform, parseTransform(attributes.transform)) };
}

function parseDash(value: string, offset: string | undefined) {
  if (value.trim().toLowerCase() === "none") return undefined;
  const values = value.trim().split(/[\s,]+/).filter(Boolean).map(Number);
  if (values.length < 1 || values.length > 32 ||
      values.some((item) => !Number.isFinite(item) || item <= 0))
    throw new Error(`SVG vector strokes support 1 through 32 positive dash lengths, got ${value}`);
  const normalized = values.length % 2 === 0 ? values : [...values, ...values];
  if (normalized.length > 32)
    throw new Error(`SVG dash sequence expands beyond 32 alternating lengths: ${value}`);
  const phase = offset !== undefined ? { offset: finiteNumber(offset, 0) } : {};
  return normalized.length === 2
    ? { length: normalized[0]!, gap: normalized[1]!, ...phase }
    : { values: normalized, ...phase };
}

function scaleDash(dash: DashStyle, scale: number): DashStyle {
  const phase = dash.offset !== undefined ? { offset: dash.offset * scale } : {};
  return "values" in dash ? { values: dash.values.map((value) => value * scale), ...phase }
    : { length: dash.length * scale, gap: dash.gap * scale, ...phase };
}

function parseLinearGradients(source: string, currentColor: Color): ReadonlyMap<string, GradientDefinition> {
  const raw = new Map<string, RawGradientDefinition>();
  for (const match of source.matchAll(/<linearGradient\b([^>]*?)(?:\/\s*>|>([\s\S]*?)<\/linearGradient\s*>)/gi)) {
    const attributes = withInlineStyle(svgAttributes(match[1]!));
    const id = attributes.id?.trim();
    if (!id) continue;
    const stops = [...(match[2] ?? "").matchAll(/<stop\b([^>]*)\/?\s*>/gi)].map((stop) => {
      const values = withInlineStyle(svgAttributes(stop[1]!));
      const color = parseColor(values["stop-color"] ?? "black", currentColor)!;
      return { offset: unitInterval(values.offset ?? "0"),
        color: multiplyAlpha(color, clamp01(numberAttribute(values["stop-opacity"], 1))) };
    }).sort((left, right) => left.offset - right.offset);
    raw.set(id, { attributes, stops });
  }
  const definitions = new Map<string, GradientDefinition>();
  const resolve = (id: string, visiting: ReadonlySet<string>): GradientDefinition | undefined => {
    const cached = definitions.get(id);
    if (cached) return cached;
    const item = raw.get(id);
    if (!item) return undefined;
    if (visiting.has(id)) throw new Error(`SVG linear gradient reference cycle at #${id}`);
    const href = item.attributes.href ?? item.attributes["xlink:href"];
    if (href !== undefined && !/^#[^\s]+$/.test(href))
      throw new Error(`SVG linear gradient #${id} has an external reference`);
    const nextVisiting = new Set(visiting); nextVisiting.add(id);
    const base = href ? resolve(href.slice(1), nextVisiting) : undefined;
    if (href && !base) throw new Error(`SVG linear gradient #${id} references missing ${href}`);
    const stops = item.stops.length > 0 ? item.stops : base?.stops ?? [];
    if (stops.length < 2 || stops.length > 8) return undefined;
    const definition: GradientDefinition = {
      units: item.attributes.gradientUnits === "userSpaceOnUse" ? "userSpaceOnUse" :
        item.attributes.gradientUnits === "objectBoundingBox" ? "objectBoundingBox" :
        base?.units ?? "objectBoundingBox",
      x1: item.attributes.x1 ?? base?.x1 ?? "0%", y1: item.attributes.y1 ?? base?.y1 ?? "0%",
      x2: item.attributes.x2 ?? base?.x2 ?? "100%", y2: item.attributes.y2 ?? base?.y2 ?? "0%",
      transform: item.attributes.gradientTransform !== undefined
        ? parseTransform(item.attributes.gradientTransform) : base?.transform ?? identity,
      stops,
      spread: item.attributes.spreadMethod === "repeat" ? "repeat" :
        item.attributes.spreadMethod === "reflect" ? "reflect" : base?.spread ?? "pad",
    };
    definitions.set(id, definition);
    return definition;
  };
  for (const id of raw.keys()) resolve(id, new Set());
  return definitions;
}

function parseRadialGradients(source: string, currentColor: Color): ReadonlyMap<string, RadialGradientDefinition> {
  const raw = new Map<string, RawRadialGradientDefinition>();
  for (const match of source.matchAll(/<radialGradient\b([^>]*?)(?:\/\s*>|>([\s\S]*?)<\/radialGradient\s*>)/gi)) {
    const attributes = withInlineStyle(svgAttributes(match[1]!));
    const id = attributes.id?.trim();
    if (!id) continue;
    const stops = [...(match[2] ?? "").matchAll(/<stop\b([^>]*)\/?\s*>/gi)].map((stop) => {
      const values = withInlineStyle(svgAttributes(stop[1]!));
      const color = parseColor(values["stop-color"] ?? "black", currentColor)!;
      return { offset: unitInterval(values.offset ?? "0"),
        color: multiplyAlpha(color, clamp01(numberAttribute(values["stop-opacity"], 1))) };
    }).sort((left, right) => left.offset - right.offset);
    raw.set(id, { attributes, stops });
  }
  const definitions = new Map<string, RadialGradientDefinition>();
  const resolve = (id: string, visiting: ReadonlySet<string>): RadialGradientDefinition | undefined => {
    const cached = definitions.get(id);
    if (cached) return cached;
    const item = raw.get(id);
    if (!item) return undefined;
    if (visiting.has(id)) throw new Error(`SVG radial gradient reference cycle at #${id}`);
    const href = item.attributes.href ?? item.attributes["xlink:href"];
    if (href !== undefined && !/^#[^\s]+$/.test(href))
      throw new Error(`SVG radial gradient #${id} has an external reference`);
    const nextVisiting = new Set(visiting); nextVisiting.add(id);
    const base = href ? resolve(href.slice(1), nextVisiting) : undefined;
    if (href && !base) throw new Error(`SVG radial gradient #${id} references missing ${href}`);
    const stops = item.stops.length > 0 ? item.stops : base?.stops ?? [];
    if (stops.length < 2 || stops.length > 8) return undefined;
    const cx = item.attributes.cx ?? base?.cx ?? "50%";
    const cy = item.attributes.cy ?? base?.cy ?? "50%";
    const definition: RadialGradientDefinition = {
      units: item.attributes.gradientUnits === "userSpaceOnUse" ? "userSpaceOnUse" :
        item.attributes.gradientUnits === "objectBoundingBox" ? "objectBoundingBox" :
        base?.units ?? "objectBoundingBox",
      cx, cy, radius: item.attributes.r ?? base?.radius ?? "50%",
      fx: item.attributes.fx ?? base?.fx ?? cx,
      fy: item.attributes.fy ?? base?.fy ?? cy,
      focalRadius: item.attributes.fr ?? base?.focalRadius ?? "0",
      transform: item.attributes.gradientTransform !== undefined
        ? parseTransform(item.attributes.gradientTransform) : base?.transform ?? identity,
      stops,
      spread: item.attributes.spreadMethod === "repeat" ? "repeat" :
        item.attributes.spreadMethod === "reflect" ? "reflect" : base?.spread ?? "pad",
    };
    definitions.set(id, definition);
    return definition;
  };
  for (const id of raw.keys()) resolve(id, new Set());
  return definitions;
}

function resolveRadialGradient(definitions: ReadonlyMap<string, RadialGradientDefinition>, id: string,
  path: string, state: PaintState, viewBox: Rect, paintOpacity: number): RadialGradientPaint {
  const definition = definitions.get(id);
  if (!definition) throw new Error(`SVG radial gradient #${id} is unsupported`);
  let center: { x: number; y: number }, edgeX: { x: number; y: number },
    edgeY: { x: number; y: number }, focal: { x: number; y: number };
  let focalRadius = 0;
  if (definition.units === "userSpaceOnUse") {
    const cx = coordinate(definition.cx, viewBox.x, viewBox.width);
    const cy = coordinate(definition.cy, viewBox.y, viewBox.height);
    const radius = coordinate(definition.radius, 0, Math.min(viewBox.width, viewBox.height));
    focalRadius = coordinate(definition.focalRadius, 0,
      Math.min(viewBox.width, viewBox.height)) / radius;
    center = transformPoint(state.transform, transformPoint(definition.transform, { x: cx, y: cy }));
    edgeX = transformPoint(state.transform, transformPoint(definition.transform, { x: cx + radius, y: cy }));
    edgeY = transformPoint(state.transform, transformPoint(definition.transform, { x: cx, y: cy + radius }));
    focal = transformPoint(state.transform, transformPoint(definition.transform, {
      x: coordinate(definition.fx, viewBox.x, viewBox.width),
      y: coordinate(definition.fy, viewBox.y, viewBox.height),
    }));
  } else {
    const bounds = new SVGPathData(path).getBounds();
    const cx = unitCoordinate(definition.cx), cy = unitCoordinate(definition.cy);
    const radius = unitCoordinate(definition.radius);
    focalRadius = unitCoordinate(definition.focalRadius) / radius;
    const map = (point: { x: number; y: number }) => {
      const transformed = transformPoint(definition.transform, point);
      return { x: bounds.minX + transformed.x * (bounds.maxX - bounds.minX),
        y: bounds.minY + transformed.y * (bounds.maxY - bounds.minY) };
    };
    center = map({ x: cx, y: cy }); edgeX = map({ x: cx + radius, y: cy });
    edgeY = map({ x: cx, y: cy + radius });
    focal = map({ x: unitCoordinate(definition.fx), y: unitCoordinate(definition.fy) });
  }
  const axisX = { x: edgeX.x - center.x, y: edgeX.y - center.y };
  const axisY = { x: edgeY.x - center.x, y: edgeY.y - center.y };
  const determinant = axisX.x * axisY.y - axisX.y * axisY.x;
  let focalX = ((focal.x - center.x) * axisY.y - (focal.y - center.y) * axisY.x) / determinant;
  let focalY = (axisX.x * (focal.y - center.y) - axisX.y * (focal.x - center.x)) / determinant;
  const focalLength = Math.hypot(focalX, focalY);
  if (!Number.isFinite(focalRadius) || focalRadius < 0 || focalRadius >= 1)
    throw new Error(`SVG radial gradient #${id} has an unsupported focal radius`);
  if (focalLength + focalRadius >= 1) {
    const scale = (0.999999 - focalRadius) / focalLength;
    focalX *= scale; focalY *= scale;
    focal = { x: center.x + axisX.x * focalX + axisY.x * focalY,
      y: center.y + axisX.y * focalX + axisY.y * focalY };
  }
  const stops = definition.stops.map((stop) => ({ offset: stop.offset,
    color: multiplyAlpha(stop.color, state.opacity * paintOpacity) }));
  const needsExplicitStops = stops.length > 2 || stops[0]!.offset !== 0 ||
    stops[stops.length - 1]!.offset !== 1;
  return { center, axisX, axisY,
    innerColor: stops[0]!.color, outerColor: stops[stops.length - 1]!.color,
    ...(needsExplicitStops ? { stops } : {}), spread: definition.spread,
    ...(Math.hypot(focal.x - center.x, focal.y - center.y) > 0.000001 ? { focal } : {}),
    ...(focalRadius > 0 ? { focalRadius } : {}) };
}

function resolveGradient(definitions: ReadonlyMap<string, GradientDefinition>, id: string,
  path: string, state: PaintState, viewBox: Rect, paintOpacity: number): LinearGradientPaint {
  const definition = definitions.get(id);
  if (!definition) throw new Error(`SVG linear gradient #${id} is not defined or has unsupported stops`);
  let start: { x: number; y: number }, end: { x: number; y: number };
  if (definition.units === "userSpaceOnUse") {
    start = { x: coordinate(definition.x1, viewBox.x, viewBox.width),
      y: coordinate(definition.y1, viewBox.y, viewBox.height) };
    end = { x: coordinate(definition.x2, viewBox.x, viewBox.width),
      y: coordinate(definition.y2, viewBox.y, viewBox.height) };
    start = transformPoint(state.transform, transformPoint(definition.transform, start));
    end = transformPoint(state.transform, transformPoint(definition.transform, end));
  } else {
    const bounds = new SVGPathData(path).getBounds();
    const normalizedStart = transformPoint(definition.transform,
      { x: unitCoordinate(definition.x1), y: unitCoordinate(definition.y1) });
    const normalizedEnd = transformPoint(definition.transform,
      { x: unitCoordinate(definition.x2), y: unitCoordinate(definition.y2) });
    start = { x: bounds.minX + normalizedStart.x * (bounds.maxX - bounds.minX),
      y: bounds.minY + normalizedStart.y * (bounds.maxY - bounds.minY) };
    end = { x: bounds.minX + normalizedEnd.x * (bounds.maxX - bounds.minX),
      y: bounds.minY + normalizedEnd.y * (bounds.maxY - bounds.minY) };
  }
  const stops = definition.stops.map((stop) => ({ offset: stop.offset,
    color: multiplyAlpha(stop.color, state.opacity * paintOpacity) }));
  return { start, end, startColor: stops[0]!.color,
    endColor: stops[stops.length - 1]!.color, ...(stops.length > 2 ? { stops } : {}),
    ...(definition.spread !== "pad" ? { spread: definition.spread } : {}) };
}

function transformPoint(matrix: Matrix, point: { readonly x: number; readonly y: number }) {
  return { x: matrix.a * point.x + matrix.c * point.y + matrix.e,
    y: matrix.b * point.x + matrix.d * point.y + matrix.f };
}

function unitInterval(value: string): number {
  const result = value.trim().endsWith("%") ? Number(value.slice(0, -1)) / 100 : Number(value);
  if (!Number.isFinite(result)) throw new Error(`Invalid SVG percentage ${value}`);
  return clamp01(result);
}

function unitCoordinate(value: string): number {
  const result = value.trim().endsWith("%") ? Number(value.slice(0, -1)) / 100 : Number(value);
  if (!Number.isFinite(result)) throw new Error(`Invalid SVG gradient coordinate ${value}`);
  return result;
}

function coordinate(value: string, origin: number, extent: number): number {
  if (value.trim().endsWith("%")) return origin + unitCoordinate(value) * extent;
  const result = Number(value);
  if (!Number.isFinite(result)) throw new Error(`Invalid SVG gradient coordinate ${value}`);
  return result;
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
function finiteNumber(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const result = Number(value);
  if (!Number.isFinite(result)) throw new Error(`Invalid SVG number ${value}`);
  return result;
}
const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
