import { FrameEncoder, Key, TextDecoration,
  type ClipRect, type Color, type PathConicGradientPaint, type PathRadialGradientPaint,
  type PathGradientPaint, type PathTexturePaint,
  type PathSegment, type RichTextRun, type Vertex } from "./protocol.js";

export interface Point { readonly x: number; readonly y: number }
export interface Size { readonly width: number; readonly height: number }
export interface Rect extends Point, Size {}
export interface Constraints { minWidth: number; maxWidth: number; minHeight: number; maxHeight: number }
export interface Insets { top: number; right: number; bottom: number; left: number }
export interface LinearGradient {
  readonly start: Color;
  readonly end: Color;
  readonly direction?: "horizontal" | "vertical" | "diagonal";
}
export interface DiagonalStripePattern {
  readonly color: Color;
  readonly stripeWidth?: number;
  readonly gap?: number;
  readonly direction?: "forward" | "backward";
  readonly offset?: number;
}
export interface GridPattern {
  readonly spacing?: number; readonly minorWidth?: number; readonly majorWidth?: number;
  readonly offsetX?: number; readonly offsetY?: number; readonly majorEvery?: number;
  readonly minorColor: Color; readonly majorColor: Color;
}
export interface DotGridPattern {
  readonly rows: number; readonly columns: number; readonly filledMask: number;
  readonly activeIndex?: number; readonly inset?: number; readonly radius?: number;
  readonly borderWidth?: number; readonly fillColor: Color;
  readonly ringColor: Color; readonly highlightColor?: Color;
}
export interface WaveDotPattern {
  readonly count: number; readonly inset?: number;
  readonly minimumRadius: number; readonly maximumRadius: number;
  readonly phase: number; readonly frequency: number; readonly borderWidth?: number;
  readonly troughStartColor: Color; readonly troughEndColor: Color;
  readonly crestStartColor: Color; readonly crestEndColor: Color; readonly borderColor: Color;
}
export interface ArcStyle {
  readonly startAngle: number;
  readonly sweepAngle: number;
  readonly thickness: number;
  readonly color?: Color;
  readonly startColor?: Color;
  readonly endColor?: Color;
  readonly roundCaps?: boolean;
}
export interface ImagePaint {
  readonly textureId: number;
  readonly tint?: Color;
  readonly sourceSize?: Size;
  readonly sourceRect?: Rect;
  readonly fit?: "fill" | "contain" | "cover";
  readonly alignX?: "start" | "center" | "end";
  readonly alignY?: "start" | "center" | "end";
  readonly sampling?: "linear" | "nearest";
  readonly tileSize?: Size;
  readonly tileOffsetX?: number; readonly tileOffsetY?: number;
  readonly repeatX?: boolean; readonly repeatY?: boolean;
  readonly nineSlice?: { readonly source: Insets; readonly destination?: Insets };
  readonly effects?: {
    readonly saturation?: number; readonly contrast?: number;
    readonly brightness?: number; readonly hueRotation?: number;
    readonly blur?: number;
  };
}
export interface Transform {
  readonly translateX?: number; readonly translateY?: number;
  readonly scaleX?: number; readonly scaleY?: number;
  readonly rotation?: number;
  readonly originX?: number; readonly originY?: number;
}
export interface Shadow {
  readonly color: Color; readonly blur?: number; readonly spread?: number;
  readonly offsetX?: number; readonly offsetY?: number;
}
export interface RadialGradient {
  readonly inner: Color; readonly outer: Color;
  readonly centerX?: number; readonly centerY?: number; readonly radius?: number;
}
export interface ConicGradient {
  readonly start: Color; readonly middle: Color; readonly end: Color;
  readonly centerX?: number; readonly centerY?: number; readonly rotation?: number;
}
export interface Style {
  preferredSize?: Partial<Size>; padding?: Partial<Insets>; gap?: number;
  background?: Color; backgroundGradient?: LinearGradient;
  backgroundRadialGradient?: RadialGradient;
  backgroundConicGradient?: ConicGradient;
  backgroundPattern?: DiagonalStripePattern; flexGrow?: number;
  backgroundGrid?: GridPattern;
  backgroundDotGrid?: DotGridPattern;
  backgroundWaveDots?: WaveDotPattern;
  backgroundArc?: ArcStyle;
  backgroundImage?: ImagePaint;
  mainAxisAlignment?: "start" | "center" | "end" | "spaceBetween";
  crossAxisAlignment?: "start" | "center" | "end" | "stretch";
  clip?: boolean;
  borderWidth?: number; borderColor?: Color;
  cornerRadius?: number;
  position?: "flow" | "absolute";
  inset?: Partial<Insets>;
  zIndex?: number;
  modal?: boolean;
  transform?: Transform;
  opacity?: number;
  shadow?: Shadow;
}
export interface TextStyle {
  fontSize?: number;
  color?: Color;
  fontFamily?: "pixel" | "system" | "monospace" | "serif" | "rounded";
  fontResourceId?: number;
  fontWeight?: "regular" | "medium" | "semibold" | "bold";
  fontStyle?: "regular" | "italic";
  letterSpacing?: number;
  textDecoration?: "none" | "underline" | "line-through" | "underline line-through";
  lineHeight?: number;
  wrap?: boolean;
  textAlign?: "start" | "center" | "end";
}
export interface RichTextSpan { readonly value: string; readonly style?: TextStyle }

const nativeTextAdvances = new Map<string, number>();
const nativeTextKey = (family: Exclude<NonNullable<TextStyle["fontFamily"]>, "pixel">, value: string,
  weight: "regular" | "medium" | "semibold" | "bold" = "regular",
  style: "regular" | "italic" = "regular", letterSpacing = 0, fontResourceId = 0) =>
  `${family}\0${fontResourceId}\0${weight}\0${style}\0${letterSpacing}\0${value}`;
export function cacheNativeTextAdvance(
  family: Exclude<NonNullable<TextStyle["fontFamily"]>, "pixel">, value: string,
  advance: number, weight: "regular" | "medium" | "semibold" | "bold" = "regular",
  style: "regular" | "italic" = "regular", letterSpacing = 0, fontResourceId = 0): void {
  if (Number.isFinite(advance) && advance >= 0)
    nativeTextAdvances.set(
      nativeTextKey(family, value, weight, style, letterSpacing, fontResourceId), advance);
}
export function nativeTextAdvance(
  family: Exclude<NonNullable<TextStyle["fontFamily"]>, "pixel">, value: string,
  weight: "regular" | "medium" | "semibold" | "bold" = "regular",
  style: "regular" | "italic" = "regular", letterSpacing = 0,
  fontResourceId = 0): number | undefined {
  return nativeTextAdvances.get(
    nativeTextKey(family, value, weight, style, letterSpacing, fontResourceId));
}

export function nativeTextMetricRuns(value: string, style: TextStyle): readonly string[] {
  if (!style.fontFamily || style.fontFamily === "pixel") return [];
  if (!style.wrap) return value.split("\n").filter(Boolean);
  const runs = new Set<string>();
  for (const paragraph of value.split("\n")) {
    for (const word of paragraph.match(/\S+/gu) ?? []) runs.add(word);
  }
  if (/[^\S\n]/u.test(value)) runs.add(" ");
  return [...runs];
}

interface LaidOutTextLine { readonly value: string; readonly width: number }
interface LaidOutRichTextSpan { readonly value: string; readonly style: TextStyle }
interface LaidOutRichTextLine {
  readonly spans: readonly LaidOutRichTextSpan[];
  readonly width: number;
}

function textRunWidth(value: string, style: TextStyle, fontSize: number): number {
  if (value.length === 0) return 0;
  if (style.fontFamily && style.fontFamily !== "pixel") {
    const tracking = (style.letterSpacing ?? 0) / fontSize;
    const exact = nativeTextAdvance(
      style.fontFamily, value, style.fontWeight, style.fontStyle, tracking,
      style.fontResourceId);
    const average = style.fontFamily === "monospace" ? 0.60 : 0.56;
    return (exact ?? [...value].length * (average + tracking)) * fontSize;
  }
  const cell = fontSize / 7;
  return value.length * cell * 6 - cell;
}

function layoutTextLines(value: string, style: TextStyle, maximumWidth: number): LaidOutTextLine[] {
  const fontSize = style.fontSize ?? 16;
  if (!style.wrap || maximumWidth <= 0) {
    return value.split("\n").map((line) => ({ value: line,
      width: textRunWidth(line, style, fontSize) }));
  }
  const result: LaidOutTextLine[] = [];
  const spaceWidth = textRunWidth(" ", style, fontSize);
  for (const paragraph of value.split("\n")) {
    const words = paragraph.match(/\S+/gu) ?? [];
    if (words.length === 0) { result.push({ value: "", width: 0 }); continue; }
    let line = "", width = 0;
    for (const word of words) {
      const wordWidth = textRunWidth(word, style, fontSize);
      const candidateWidth = line ? width + spaceWidth + wordWidth : wordWidth;
      if (line && candidateWidth > maximumWidth) {
        result.push({ value: line, width });
        line = word; width = wordWidth;
      } else {
        line += line ? ` ${word}` : word;
        width = candidateWidth;
      }
    }
    result.push({ value: line, width });
  }
  return result;
}

function sameRichTextStyle(left: TextStyle, right: TextStyle): boolean {
  const leftColor = left.color, rightColor = right.color;
  return left.fontFamily === right.fontFamily && left.fontResourceId === right.fontResourceId &&
    left.fontWeight === right.fontWeight && left.fontStyle === right.fontStyle &&
    left.letterSpacing === right.letterSpacing && left.textDecoration === right.textDecoration &&
    left.fontSize === right.fontSize && leftColor?.red === rightColor?.red &&
    leftColor?.green === rightColor?.green && leftColor?.blue === rightColor?.blue &&
    leftColor?.alpha === rightColor?.alpha;
}

function layoutRichTextLines(spans: readonly RichTextSpan[], base: TextStyle,
  maximumWidth: number): LaidOutRichTextLine[] {
  const fontSize = base.fontSize ?? 16;
  const lines: Array<{ spans: LaidOutRichTextSpan[]; width: number }> =
    [{ spans: [], width: 0 }];
  let pendingSpace: { style: TextStyle; width: number } | undefined;
  const current = () => lines[lines.length - 1]!;
  const append = (value: string, style: TextStyle, width: number) => {
    const line = current(), previous = line.spans[line.spans.length - 1];
    if (previous && sameRichTextStyle(previous.style, style))
      line.spans[line.spans.length - 1] = { value: previous.value + value, style };
    else line.spans.push({ value, style });
    line.width += width;
  };
  const breakLine = () => { pendingSpace = undefined; lines.push({ spans: [], width: 0 }); };

  for (const span of spans) {
    const style: TextStyle = { ...base, ...span.style, fontSize };
    for (const token of span.value.match(/\n|[^\S\n]+|[^\s]+/gu) ?? []) {
      if (token === "\n") { breakLine(); continue; }
      if (/^[^\S\n]+$/u.test(token)) {
        if (base.wrap) pendingSpace = { style, width: textRunWidth(" ", style, fontSize) };
        else append(token, style, textRunWidth(token, style, fontSize));
        continue;
      }
      const wordWidth = textRunWidth(token, style, fontSize);
      const separatorWidth = current().spans.length > 0 ? pendingSpace?.width ?? 0 : 0;
      if (base.wrap && maximumWidth > 0 && current().spans.length > 0 &&
          current().width + separatorWidth + wordWidth > maximumWidth) breakLine();
      else if (pendingSpace && current().spans.length > 0)
        append(" ", pendingSpace.style, pendingSpace.width);
      pendingSpace = undefined;
      append(token, style, wordWidth);
    }
  }
  return lines;
}
export interface MeshData {
  readonly resourceId: number;
  readonly positions: readonly Point[];
  readonly indices: readonly number[];
  readonly color: Color;
  readonly colors?: readonly Color[];
  readonly viewBox?: Rect;
  readonly fit?: "stretch" | "contain";
}
export interface PathData {
  readonly resourceId: number;
  readonly segments: readonly PathSegment[];
  readonly viewBox: Rect;
  readonly sourceClip?: Rect;
  readonly fit?: "stretch" | "contain";
  readonly fill?: Color;
  readonly fillGradient?: {
    readonly start: Point; readonly end: Point;
    readonly startColor: Color; readonly endColor: Color;
    readonly stops?: readonly { readonly offset: number; readonly color: Color }[];
    readonly spread?: "pad" | "repeat" | "reflect";
  };
  readonly fillRadialGradient?: PathRadialGradientPaint;
  readonly fillConicGradient?: PathConicGradientPaint;
  readonly fillTexture?: PathTexturePaint;
  readonly stroke?: Color;
  readonly strokeGradient?: {
    readonly start: Point; readonly end: Point;
    readonly startColor: Color; readonly endColor: Color;
    readonly stops?: readonly { readonly offset: number; readonly color: Color }[];
    readonly spread?: "pad" | "repeat" | "reflect";
  };
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
export interface VectorTextData {
  readonly value: string; readonly x: number; readonly y: number; readonly fontSize: number;
  readonly viewBox: Rect; readonly sourceClip?: Rect; readonly color: Color;
  readonly family: Exclude<NonNullable<TextStyle["fontFamily"]>, "pixel">;
  readonly weight?: TextStyle["fontWeight"]; readonly fontStyle?: TextStyle["fontStyle"];
  readonly letterSpacing?: number; readonly decoration?: TextDecoration;
  readonly fillGradient?: PathGradientPaint;
  readonly fillRadialGradient?: PathRadialGradientPaint;
  readonly strokeColor?: Color; readonly strokeWidth?: number;
  readonly anchor?: "start" | "middle" | "end";
  readonly sourceTransform?: { readonly a: number; readonly b: number; readonly c: number;
    readonly d: number; readonly e: number; readonly f: number };
}
export interface VectorRichTextData {
  readonly runs: readonly RichTextRun[]; readonly x: number; readonly y: number;
  readonly fontSize: number; readonly viewBox: Rect; readonly sourceClip?: Rect;
  readonly anchor?: "start" | "middle" | "end";
  readonly sourceTransform?: { readonly a: number; readonly b: number; readonly c: number;
    readonly d: number; readonly e: number; readonly f: number };
}
export interface VectorImageData {
  readonly textureId: number; readonly sourceSize: Size;
  readonly x: number; readonly y: number; readonly width: number; readonly height: number;
  readonly viewBox: Rect; readonly sourceClip?: Rect;
  readonly fit?: "fill" | "contain" | "cover"; readonly sampling?: "linear" | "nearest";
  readonly alignX?: "start" | "center" | "end";
  readonly alignY?: "start" | "center" | "end";
  readonly opacity?: number;
  readonly sourceTransform?: { readonly a: number; readonly b: number; readonly c: number;
    readonly d: number; readonly e: number; readonly f: number };
}
export type ElementType = "box" | "row" | "column" | "stack" | "text" | "richText" |
  "vectorText" | "vectorRichText" | "vectorImage" | "scroll" | "circle" | "mesh" | "path";
export interface Element {
  type: ElementType; key: string; style: Style; children: readonly Element[];
  autoFocus?: boolean;
  onClick?: () => void; onHoverChange?: (hovered: boolean) => void;
  onPressChange?: (pressed: boolean) => void; value?: string; textStyle?: TextStyle;
  onPointerDown?: (point: Point) => void; onPointerMove?: (point: Point) => void;
  onPointerUp?: (point: Point) => void;
  onFocusChange?: (focused: boolean) => void;
  onScroll?: (deltaX: number, deltaY: number) => void; scrollOffsetY?: number;
  onKeyDown?: (key: Key, modifiers: number) => void; onTextInput?: (text: string) => void;
  mesh?: MeshData;
  path?: PathData;
  vectorText?: VectorTextData;
  vectorRichText?: VectorRichTextData;
  vectorImage?: VectorImageData;
  richTextSpans?: readonly RichTextSpan[];
}

const make = (type: ElementType, children: readonly Element[], style: Style, key: string): Element =>
  ({ type, children, style, key });
export const box = (style: Style = {}, key = ""): Element => make("box", [], style, key);
export const circle = (style: Style = {}, key = ""): Element => make("circle", [], style, key);
export const mesh = (data: MeshData, style: Style = {}, key = ""): Element =>
  ({ ...make("mesh", [], style, key), mesh: data });
export const path = (data: PathData, style: Style = {}, key = ""): Element =>
  ({ ...make("path", [], style, key), path: data });
export const vectorText = (data: VectorTextData, style: Style = {}, key = ""): Element =>
  ({ ...make("vectorText", [], style, key), vectorText: data });
export const vectorRichText = (data: VectorRichTextData, style: Style = {}, key = ""): Element =>
  ({ ...make("vectorRichText", [], style, key), vectorRichText: data });
export const vectorImage = (data: VectorImageData, style: Style = {}, key = ""): Element =>
  ({ ...make("vectorImage", [], style, key), vectorImage: data });
export const row = (children: readonly Element[], style: Style = {}, key = ""): Element => make("row", children, style, key);
export const column = (children: readonly Element[], style: Style = {}, key = ""): Element => make("column", children, style, key);
export const stack = (children: readonly Element[], style: Style = {}, key = ""): Element => make("stack", children, style, key);
export const text = (value: string, textStyle: TextStyle = {}, key = ""): Element =>
  ({ type: "text", children: [], style: {}, key, value, textStyle });
export const richText = (spans: readonly RichTextSpan[], textStyle: TextStyle = {}, key = ""): Element =>
  ({ type: "richText", children: [], style: {}, key, textStyle, richTextSpans: spans });
export const scrollView = (child: Element, offsetY: number, style: Style = {}, key = "",
  onScroll?: (deltaX: number, deltaY: number) => void): Element => ({
    type: "scroll", children: [child], style: { ...style, clip: true }, key, scrollOffsetY: offsetY,
    ...(onScroll ? { onScroll } : {}),
  });
export const clickable = (element: Element, onClick: () => void,
  onHoverChange?: (hovered: boolean) => void, onPressChange?: (pressed: boolean) => void,
  onFocusChange?: (focused: boolean) => void): Element => ({
    ...element, onClick,
    ...(onHoverChange ? { onHoverChange } : {}),
    ...(onPressChange ? { onPressChange } : {}),
    ...(onFocusChange ? { onFocusChange } : {}),
  });
export const focusable = (element: Element, handlers: {
  onFocusChange?: (focused: boolean) => void;
  onKeyDown?: (key: Key, modifiers: number) => void;
  onTextInput?: (text: string) => void;
}): Element => ({ ...element, ...handlers });

export abstract class Component {
  private notify: (() => void) | undefined;
  abstract build(): Element;
  protected invalidate(): void { this.notify?.(); }
  attach(callback: () => void): void { this.notify = callback; }
}

const scrollIndicatorWidth = 10;
const scrollIndicatorRightInset = 8;
const scrollContentGap = 18;
const scrollIndicatorGutter = scrollContentGap + scrollIndicatorWidth +
  scrollIndicatorRightInset;
const scrollIndicatorVerticalInset = 10;

export class ComponentHost {
  private component: Component | undefined;
  private root: Node | undefined;
  private dirty = false;
  private hovered: Node | undefined;
  private pressed: Node | undefined;
  private focused: Node | undefined;
  private keyboardPressed: Node | undefined;
  private scrollDrag: { target: Node; grabOffset: number } | undefined;
  rebuild(component: Component): void {
    this.component = component;
    component.attach(() => { this.dirty = true; });
    this.reconcile();
  }
  layout(viewport: Size): void {
    if (this.dirty) this.reconcile();
    const constraints = { minWidth: viewport.width, maxWidth: viewport.width,
      minHeight: viewport.height, maxHeight: viewport.height };
    this.root?.measure(constraints);
    this.root?.layout({ x: 0, y: 0, ...viewport });
  }
  paint(encoder: FrameEncoder, viewport: Size): void { this.root?.paint(encoder, viewport); }
  pointerMove(point: Point): boolean {
    if (this.scrollDrag) {
      const local = this.scrollDrag.target.localPoint(point);
      this.scrollDrag.target.dragScrollbar(local.y, this.scrollDrag.grabOffset);
      return true;
    }
    if (this.pressed?.onPointerMove) {
      this.pressed.onPointerMove(this.pressed.localPoint(point));
      return true;
    }
    const target = this.root?.hitTarget(point);
    if (target === this.hovered) return false;
    this.hovered?.onHoverChange?.(false);
    this.hovered = target;
    this.hovered?.onHoverChange?.(true);
    return true;
  }
  pointerDown(point: Point): boolean {
    const scrollbar = this.root?.scrollbarTarget(point);
    if (scrollbar?.onScroll) {
      this.scrollDrag = { target: scrollbar,
        grabOffset: scrollbar.beginScrollbarDrag(scrollbar.localPoint(point).y) };
      return true;
    }
    const target = this.root?.hitTarget(point);
    if (!target) return false;
    this.setFocus(target);
    this.pressed?.onPressChange?.(false);
    this.pressed = target;
    target.onPressChange?.(true);
    target.onPointerDown?.(target.localPoint(point));
    return true;
  }
  pointerUp(point: Point): boolean {
    if (this.scrollDrag) {
      const drag = this.scrollDrag;
      this.scrollDrag = undefined;
      drag.target.dragScrollbar(drag.target.localPoint(point).y, drag.grabOffset);
      return true;
    }
    const pressed = this.pressed;
    if (!pressed) return false;
    this.pressed = undefined;
    pressed.onPressChange?.(false);
    pressed.onPointerUp?.(pressed.localPoint(point));
    if (this.root?.hitTarget(point) === pressed) pressed.onClick?.();
    return true;
  }
  keyDown(key: Key, shift: boolean, repeat: boolean, modifiers = shift ? 1 : 0): boolean {
    if (key === Key.Tab) {
      if (!repeat) this.focusNext(shift);
      return true;
    }
    if ((key === Key.Enter || key === Key.Space) && this.focused) {
      if (!repeat && !this.keyboardPressed) {
        this.keyboardPressed = this.focused;
        this.focused.onPressChange?.(true);
      }
      return true;
    }
    if (key === Key.PageUp || key === Key.PageDown || key === Key.Home || key === Key.End)
      return this.keyboardScroll(key);
    if (this.focused?.onKeyDown) {
      this.focused.onKeyDown(key, modifiers);
      return true;
    }
    if (key === Key.ArrowUp || key === Key.ArrowDown) return this.keyboardScroll(key);
    return false;
  }
  keyUp(key: Key): boolean {
    if ((key !== Key.Enter && key !== Key.Space) || !this.keyboardPressed) return false;
    const target = this.keyboardPressed;
    this.keyboardPressed = undefined;
    target.onPressChange?.(false);
    if (target === this.focused) target.onClick?.();
    return true;
  }
  scroll(point: Point, deltaX: number, deltaY: number): boolean {
    const target = this.root?.scrollTarget(point, deltaY);
    if (!target?.onScroll) return false;
    target.onScroll(deltaX, target.clampScrollDelta(deltaY));
    return true;
  }
  textInput(text: string): boolean {
    if (!this.focused?.onTextInput || text.length === 0) return false;
    this.focused.onTextInput(text);
    return true;
  }
  needsRebuild(): boolean { return this.dirty; }
  rootBounds(): Rect | undefined { return this.root?.bounds; }
  private reconcile(): void {
    if (!this.component) return;
    const element = this.component.build();
    if (this.root?.matches(element)) this.root.update(element);
    else this.root = new Node(element);
    const targets: Node[] = [];
    this.root.collectTargets(targets);
    const requested = targets.find((target) => target.autoFocus);
    if (this.focused && !targets.includes(this.focused)) this.setFocus(requested ?? targets[0]);
    else if (!this.focused && requested) this.setFocus(requested);
    this.dirty = false;
  }
  private setFocus(target: Node | undefined): void {
    if (target === this.focused) return;
    this.focused?.onFocusChange?.(false);
    this.focused = target;
    this.focused?.onFocusChange?.(true);
  }
  private focusNext(reverse: boolean): void {
    const targets: Node[] = [];
    this.root?.collectTargets(targets);
    if (targets.length === 0) return;
    const current = this.focused ? targets.indexOf(this.focused) : -1;
    const next = reverse
      ? (current <= 0 ? targets.length - 1 : current - 1)
      : (current + 1) % targets.length;
    this.setFocus(targets[next]);
  }
  private keyboardScroll(key: Key): boolean {
    const target = this.focused?.scrollAncestor() ?? this.root?.firstScrollable();
    return target?.keyboardScroll(key) ?? false;
  }
}

class Node {
  type: ElementType; key: string; style: Style = {}; children: Node[] = [];
  autoFocus = false;
  onClick: (() => void) | undefined; value = ""; textStyle: TextStyle = {};
  onHoverChange: ((hovered: boolean) => void) | undefined;
  onPressChange: ((pressed: boolean) => void) | undefined;
  onFocusChange: ((focused: boolean) => void) | undefined;
  onPointerDown: ((point: Point) => void) | undefined;
  onPointerMove: ((point: Point) => void) | undefined;
  onPointerUp: ((point: Point) => void) | undefined;
  onScroll: ((deltaX: number, deltaY: number) => void) | undefined;
  scrollOffsetY = 0;
  onKeyDown: ((key: Key, modifiers: number) => void) | undefined;
  onTextInput: ((text: string) => void) | undefined;
  mesh: MeshData | undefined = undefined;
  path: PathData | undefined = undefined;
  vectorText: VectorTextData | undefined = undefined;
  vectorRichText: VectorRichTextData | undefined = undefined;
  vectorImage: VectorImageData | undefined = undefined;
  richTextSpans: readonly RichTextSpan[] = [];
  measured: Size = { width: 0, height: 0 };
  bounds: Rect = { x: 0, y: 0, width: 0, height: 0 };
  private parent: Node | undefined;
  constructor(element: Element, parent?: Node) {
    this.type = element.type; this.key = element.key; this.parent = parent; this.update(element);
  }
  matches(element: Element): boolean { return this.type === element.type && this.key === element.key; }
  update(element: Element): void {
    this.type = element.type; this.key = element.key; this.style = element.style;
    this.autoFocus = element.autoFocus ?? false;
    this.onClick = element.onClick; this.onHoverChange = element.onHoverChange;
    this.onPressChange = element.onPressChange; this.onFocusChange = element.onFocusChange;
    this.onPointerDown = element.onPointerDown; this.onPointerMove = element.onPointerMove;
    this.onPointerUp = element.onPointerUp;
    this.onScroll = element.onScroll; this.scrollOffsetY = element.scrollOffsetY ?? 0;
    this.onKeyDown = element.onKeyDown; this.onTextInput = element.onTextInput;
    this.value = element.value ?? "";
    this.textStyle = element.textStyle ?? {};
    this.mesh = element.mesh;
    this.path = element.path;
    this.vectorText = element.vectorText;
    this.vectorRichText = element.vectorRichText;
    this.vectorImage = element.vectorImage;
    this.richTextSpans = element.richTextSpans ?? [];
    const old = this.children, used = old.map(() => false);
    this.children = element.children.map((child, index) => {
      let found = child.key === "" && old[index]?.matches(child) ? index : -1;
      if (child.key !== "") found = old.findIndex((candidate, candidateIndex) =>
        !used[candidateIndex] && candidate.matches(child));
      if (found < 0) return new Node(child, this);
      used[found] = true; old[found]!.parent = this; old[found]!.update(child); return old[found]!;
    });
  }
  measure(constraints: Constraints): Size {
    const padding = insets(this.style.padding);
    const gutter = this.type === "scroll" ? scrollIndicatorGutter : 0;
    const inner = { minWidth: 0,
      maxWidth: extent(constraints.maxWidth, padding.left, padding.right + gutter),
      minHeight: 0, maxHeight: extent(constraints.maxHeight, padding.top, padding.bottom) };
    if (this.type === "scroll") inner.maxHeight = 1_000_000;
    let width = 0, height = 0;
    if (this.type === "text" && this.value) {
      const fontSize = this.textStyle.fontSize ?? 16;
      const lines = layoutTextLines(this.value, this.textStyle, inner.maxWidth);
      width = Math.max(0, ...lines.map((line) => line.width));
      const lineHeight = this.textStyle.lineHeight ?? fontSize * 1.2;
      height = fontSize + Math.max(0, lines.length - 1) * lineHeight;
    }
    if (this.type === "richText" && this.richTextSpans.length > 0) {
      const fontSize = this.textStyle.fontSize ?? 16;
      const lines = layoutRichTextLines(this.richTextSpans, this.textStyle, inner.maxWidth);
      width = Math.max(0, ...lines.map((line) => line.width));
      const lineHeight = this.textStyle.lineHeight ?? fontSize * 1.2;
      height = fontSize + Math.max(0, lines.length - 1) * lineHeight;
    }
    let flowCount = 0;
    for (const child of this.children) {
      const size = child.measure(inner);
      if (child.style.position === "absolute") continue;
      flowCount += 1;
      if (this.type === "row") { width += size.width; height = Math.max(height, size.height); }
      else if (this.type === "column") { width = Math.max(width, size.width); height += size.height; }
      else { width = Math.max(width, size.width); height = Math.max(height, size.height); }
    }
    const gaps = Math.max(0, flowCount - 1) * (this.style.gap ?? 0);
    if (this.type === "row") width += gaps;
    if (this.type === "column") height += gaps;
    const preferred = this.style.preferredSize ?? {};
    const desiredHeight = this.type === "scroll" && preferred.height !== undefined
      ? preferred.height : Math.max(preferred.height ?? 0, height + padding.top + padding.bottom);
    this.measured = constrain({ width: Math.max(preferred.width ?? 0,
      width + padding.left + padding.right + gutter),
      height: desiredHeight }, constraints);
    return this.measured;
  }
  layout(bounds: Rect): void {
    this.bounds = bounds;
    const p = insets(this.style.padding);
    const content = { x: bounds.x + p.left, y: bounds.y + p.top,
      width: extent(bounds.width, p.left, p.right), height: extent(bounds.height, p.top, p.bottom) };
    if (this.type === "scroll") {
      const child = this.children[0];
      if (child) {
        const offset = Math.max(0, Math.min(this.scrollOffsetY, Math.max(0, child.measured.height - content.height)));
        child.layout({ x: content.x, y: content.y - offset,
          width: extent(content.width, 0, scrollIndicatorGutter), height: child.measured.height });
      }
      return;
    }
    const horizontal = this.type === "row", vertical = this.type === "column", linear = horizontal || vertical;
    const flowChildren = this.children.filter((child) => child.style.position !== "absolute");
    const gap = this.style.gap ?? 0;
    let occupied = linear ? Math.max(0, flowChildren.length - 1) * gap : 0, flex = 0;
    for (const child of flowChildren) { occupied += horizontal ? child.measured.width : child.measured.height; flex += Math.max(0, child.style.flexGrow ?? 0); }
    const remaining = linear ? Math.max(0, (horizontal ? content.width : content.height) - occupied) : 0;
    let leading = 0, effectiveGap = gap;
    if (linear && flex === 0) {
      if (this.style.mainAxisAlignment === "center") leading = remaining / 2;
      if (this.style.mainAxisAlignment === "end") leading = remaining;
      if (this.style.mainAxisAlignment === "spaceBetween" && flowChildren.length > 1) effectiveGap += remaining / (flowChildren.length - 1);
    }
    let x = content.x + (horizontal ? leading : 0), y = content.y + (vertical ? leading : 0);
    for (const child of flowChildren) {
      let width = Math.min(child.measured.width, content.width), height = Math.min(child.measured.height, content.height);
      const grow = Math.max(0, child.style.flexGrow ?? 0);
      if (linear && flex > 0 && grow > 0) {
        if (horizontal) width += remaining * grow / flex; else height += remaining * grow / flex;
      }
      let childX = content.x, childY = content.y;
      if (horizontal) {
        childX = x;
        if (this.style.crossAxisAlignment === "center") childY += (content.height - height) / 2;
        if (this.style.crossAxisAlignment === "end") childY += content.height - height;
        if (this.style.crossAxisAlignment === "stretch") height = content.height;
        x += width + effectiveGap;
      } else if (vertical) {
        childY = y;
        if (this.style.crossAxisAlignment === "center") childX += (content.width - width) / 2;
        if (this.style.crossAxisAlignment === "end") childX += content.width - width;
        if (this.style.crossAxisAlignment === "stretch") width = content.width;
        y += height + effectiveGap;
      }
      child.layout({ x: childX, y: childY, width, height });
    }
    for (const child of this.children) {
      if (child.style.position !== "absolute") continue;
      const inset = insets(child.style.inset);
      const hasLeft = child.style.inset?.left !== undefined;
      const hasRight = child.style.inset?.right !== undefined;
      const hasTop = child.style.inset?.top !== undefined;
      const hasBottom = child.style.inset?.bottom !== undefined;
      const width = hasLeft && hasRight
        ? extent(content.width, inset.left, inset.right) : child.measured.width;
      const height = hasTop && hasBottom
        ? extent(content.height, inset.top, inset.bottom) : child.measured.height;
      const childX = hasLeft ? content.x + inset.left
        : hasRight ? content.x + content.width - inset.right - width : content.x;
      const childY = hasTop ? content.y + inset.top
        : hasBottom ? content.y + content.height - inset.bottom - height : content.y;
      child.layout({ x: childX, y: childY, width, height });
    }
  }
  paint(encoder: FrameEncoder, viewport: Size): void {
    if (this.style.opacity !== undefined) encoder.pushOpacity(this.style.opacity);
    if (this.style.transform) encoder.pushTransform(this.affineTransform(viewport));
    const shadow = this.style.shadow;
    if (shadow && shadow.color.alpha > 0 && this.bounds.width > 0 && this.bounds.height > 0) {
      const destination = { ...this.bounds, x: this.bounds.x + (shadow.offsetX ?? 0),
        y: this.bounds.y + (shadow.offsetY ?? 0) };
      const radius = this.type === "circle"
        ? Math.min(this.bounds.width, this.bounds.height) / 2 : this.style.cornerRadius ?? 0;
      encoder.shadow({ destination: normalizedRect(destination, viewport), cornerRadius: radius,
        blur: shadow.blur ?? 12, spread: shadow.spread ?? 0, color: shadow.color });
    }
    if (this.style.clip) encoder.pushClip({ left: this.bounds.x / viewport.width,
      top: this.bounds.y / viewport.height, right: (this.bounds.x + this.bounds.width) / viewport.width,
      bottom: (this.bounds.y + this.bounds.height) / viewport.height });
    const background = this.style.background;
    const gradient = this.style.backgroundGradient;
    const radial = this.style.backgroundRadialGradient;
    const conic = this.style.backgroundConicGradient;
    if (this.type === "mesh") {
      paintMesh(encoder, this.bounds, this.mesh, viewport);
    } else if (this.type === "path") {
      paintPath(encoder, this.bounds, this.path, viewport);
    } else if (this.type === "circle") {
      if (radial) {
        paintRadialGradient(encoder, this.bounds, radial,
          Math.min(this.bounds.width, this.bounds.height) / 2, viewport);
        paintCircle(encoder, this.bounds, undefined, undefined, this.style.borderWidth ?? 0,
          this.style.borderColor, viewport);
      } else if (conic) {
        paintConicGradient(encoder, this.bounds, conic,
          Math.min(this.bounds.width, this.bounds.height) / 2, viewport);
        paintCircle(encoder, this.bounds, undefined, undefined, this.style.borderWidth ?? 0,
          this.style.borderColor, viewport);
      } else paintCircle(encoder, this.bounds, background, gradient, this.style.borderWidth ?? 0,
        this.style.borderColor, viewport);
    } else if ((this.style.cornerRadius ?? 0) > 0) {
      let combinedBorder = false;
      if (radial) {
        paintRadialGradient(encoder, this.bounds, radial, this.style.cornerRadius ?? 0, viewport);
      } else if (conic) {
        paintConicGradient(encoder, this.bounds, conic, this.style.cornerRadius ?? 0, viewport);
      } else if (gradient) {
        paintLinearGradient(encoder, this.bounds, gradient, this.style.cornerRadius ?? 0, viewport);
      } else if (this.style.backgroundImage) {
        paintServerRoundedRect(encoder, this.bounds, this.style.cornerRadius ?? 0, background,
          0, undefined, viewport);
      } else {
        paintServerRoundedRect(encoder, this.bounds, this.style.cornerRadius ?? 0, background,
          this.style.borderWidth ?? 0, this.style.borderColor, viewport);
        combinedBorder = true;
      }
      paintImage(encoder, this.bounds, this.style.backgroundImage,
        this.style.cornerRadius ?? 0, viewport);
      paintGridPattern(encoder, this.bounds, this.style.backgroundGrid,
        this.style.cornerRadius ?? 0, viewport);
      paintDotGrid(encoder, this.bounds, this.style.backgroundDotGrid, viewport);
      paintWaveDots(encoder, this.bounds, this.style.backgroundWaveDots, viewport);
      if (!combinedBorder) paintServerRoundedRect(encoder, this.bounds,
        this.style.cornerRadius ?? 0, undefined, this.style.borderWidth ?? 0,
        this.style.borderColor, viewport);
    } else {
      let combinedBorder = false;
      if (this.bounds.width > 0 && this.bounds.height > 0) {
        if (radial) paintRadialGradient(encoder, this.bounds, radial, 0, viewport);
        else if (conic) paintConicGradient(encoder, this.bounds, conic, 0, viewport);
        else if (gradient) paintLinearGradient(encoder, this.bounds, gradient, 0, viewport);
        else if (!this.style.backgroundImage && !this.style.backgroundPattern &&
          !this.style.backgroundGrid &&
          !this.style.backgroundDotGrid && !this.style.backgroundWaveDots) {
          paintServerRoundedRect(encoder, this.bounds, 0, background,
            this.style.borderWidth ?? 0, this.style.borderColor, viewport);
          combinedBorder = true;
        } else paintServerRoundedRect(encoder, this.bounds, 0, background, 0, undefined, viewport);
        paintImage(encoder, this.bounds, this.style.backgroundImage, 0, viewport);
      }
      paintGridPattern(encoder, this.bounds, this.style.backgroundGrid, 0, viewport);
      paintDiagonalStripes(encoder, this.bounds, this.style.backgroundPattern, viewport);
      paintDotGrid(encoder, this.bounds, this.style.backgroundDotGrid, viewport);
      paintWaveDots(encoder, this.bounds, this.style.backgroundWaveDots, viewport);
      if (!combinedBorder) paintServerRoundedRect(encoder, this.bounds, 0, undefined,
        this.style.borderWidth ?? 0, this.style.borderColor, viewport);
    }
    paintArc(encoder, this.bounds, this.style.backgroundArc, viewport);
    if (this.type === "text") paintText(encoder, this.bounds, this.value, this.textStyle, viewport);
    if (this.type === "richText")
      paintRichText(encoder, this.bounds, this.richTextSpans, this.textStyle, viewport);
    if (this.type === "vectorText") paintVectorText(encoder, this.bounds, this.vectorText, viewport);
    if (this.type === "vectorRichText")
      paintVectorRichText(encoder, this.bounds, this.vectorRichText, viewport);
    if (this.type === "vectorImage") paintVectorImage(encoder, this.bounds, this.vectorImage, viewport);
    for (const child of this.paintOrder()) child.paint(encoder, viewport);
    if (this.type === "scroll") this.paintScrollIndicator(encoder, viewport);
    if (this.style.clip) encoder.popClip();
    if (this.style.transform) encoder.popTransform();
    if (this.style.opacity !== undefined) encoder.popOpacity();
  }
  hitTarget(point: Point): Node | undefined {
    const transformedPoint = this.inverseTransform(point);
    const inside = contains(this.bounds, transformedPoint);
    if (this.style.clip && !inside) return undefined;
    const modal = this.modalChild();
    if (modal) return modal.hitTarget(transformedPoint);
    const ordered = this.paintOrder();
    for (let i = ordered.length - 1; i >= 0; i--) {
      const target = ordered[i]!.hitTarget(transformedPoint);
      if (target) return target;
    }
    return inside && this.isFocusable() ? this : undefined;
  }
  collectTargets(targets: Node[]): void {
    if (this.isFocusable()) targets.push(this);
    const modal = this.modalChild();
    if (modal) modal.collectTargets(targets);
    else for (const child of this.paintOrder()) child.collectTargets(targets);
  }
  localPoint(point: Point): Point {
    const layoutPoint = this.pointFromRoot(point);
    return { x: layoutPoint.x - this.bounds.x, y: layoutPoint.y - this.bounds.y };
  }
  scrollTarget(point: Point, deltaY = 0): Node | undefined {
    const transformedPoint = this.inverseTransform(point);
    if (!contains(this.bounds, transformedPoint)) return undefined;
    const modal = this.modalChild();
    if (modal) return modal.scrollTarget(transformedPoint, deltaY);
    const ordered = this.paintOrder();
    for (let i = ordered.length - 1; i >= 0; i--) {
      const target = ordered[i]!.scrollTarget(transformedPoint, deltaY);
      if (target) return target;
    }
    return this.onScroll && this.canScroll(deltaY) ? this : undefined;
  }
  scrollbarTarget(point: Point): Node | undefined {
    const transformedPoint = this.inverseTransform(point);
    if (!contains(this.bounds, transformedPoint)) return undefined;
    const modal = this.modalChild();
    if (modal) return modal.scrollbarTarget(transformedPoint);
    const geometry = this.scrollIndicatorGeometry();
    if (geometry && contains(geometry.track, transformedPoint)) return this;
    const ordered = this.paintOrder();
    for (let i = ordered.length - 1; i >= 0; i--) {
      const target = ordered[i]!.scrollbarTarget(transformedPoint);
      if (target) return target;
    }
    return undefined;
  }
  beginScrollbarDrag(localY: number): number {
    const geometry = this.scrollIndicatorGeometry();
    if (!geometry) return 0;
    const absoluteY = this.bounds.y + localY;
    if (contains(geometry.thumb, { x: geometry.thumb.x, y: absoluteY }))
      return absoluteY - geometry.thumb.y;
    const grabOffset = geometry.thumb.height / 2;
    this.dragScrollbar(localY, grabOffset);
    return grabOffset;
  }
  dragScrollbar(localY: number, grabOffset: number): void {
    const geometry = this.scrollIndicatorGeometry();
    if (!geometry || !this.onScroll) return;
    const travel = geometry.track.height - geometry.thumb.height;
    if (travel <= 0) return;
    const thumbY = Math.max(geometry.track.y, Math.min(
      this.bounds.y + localY - grabOffset, geometry.track.y + travel));
    const next = geometry.maximum * (thumbY - geometry.track.y) / travel;
    const current = Math.max(0, Math.min(this.scrollOffsetY, geometry.maximum));
    this.onScroll(0, next - current);
  }
  clampScrollDelta(deltaY: number): number {
    const maximum = this.maximumScrollOffset();
    const current = Math.max(0, Math.min(this.scrollOffsetY, maximum));
    return Math.max(0, Math.min(current + deltaY, maximum)) - current;
  }
  scrollAncestor(): Node | undefined {
    let candidate: Node | undefined = this;
    while (candidate) {
      if (candidate.type === "scroll" && candidate.onScroll && candidate.maximumScrollOffset() > 0.5)
        return candidate;
      candidate = candidate.parent;
    }
    return undefined;
  }
  firstScrollable(): Node | undefined {
    if (this.type === "scroll" && this.onScroll && this.maximumScrollOffset() > 0.5) return this;
    const modal = this.modalChild();
    if (modal) return modal.firstScrollable();
    for (const child of this.paintOrder()) {
      const target = child.firstScrollable();
      if (target) return target;
    }
    return undefined;
  }
  keyboardScroll(key: Key): boolean {
    if (!this.onScroll) return false;
    const padding = insets(this.style.padding);
    const viewportHeight = extent(this.bounds.height, padding.top, padding.bottom);
    const maximum = this.maximumScrollOffset();
    const current = Math.max(0, Math.min(this.scrollOffsetY, maximum));
    let delta = 0;
    if (key === Key.ArrowUp) delta = -40;
    if (key === Key.ArrowDown) delta = 40;
    if (key === Key.PageUp) delta = -viewportHeight * 0.9;
    if (key === Key.PageDown) delta = viewportHeight * 0.9;
    if (key === Key.Home) delta = -current;
    if (key === Key.End) delta = maximum - current;
    const applied = this.clampScrollDelta(delta);
    if (Math.abs(applied) <= 0.0001) return false;
    this.onScroll(0, applied);
    return true;
  }
  private canScroll(deltaY: number): boolean {
    if (deltaY === 0) return this.maximumScrollOffset() > 0;
    return Math.abs(this.clampScrollDelta(deltaY)) > 0.0001;
  }
  private maximumScrollOffset(): number {
    if (this.type !== "scroll") return 0;
    const child = this.children[0];
    if (!child) return 0;
    const padding = insets(this.style.padding);
    const viewportHeight = extent(this.bounds.height, padding.top, padding.bottom);
    return Math.max(0, child.measured.height - viewportHeight);
  }
  private paintScrollIndicator(encoder: FrameEncoder, viewport: Size): void {
    const geometry = this.scrollIndicatorGeometry();
    if (!geometry) return;
    paintServerRoundedRect(encoder, geometry.track, scrollIndicatorWidth / 2,
      { red: 0.10, green: 0.16, blue: 0.25, alpha: 0.48 }, 0, undefined, viewport);
    paintServerRoundedRect(encoder, geometry.thumb, scrollIndicatorWidth / 2,
      { red: 0.36, green: 0.70, blue: 0.92, alpha: 0.82 }, 0, undefined, viewport);
  }
  private scrollIndicatorGeometry(): { track: Rect; thumb: Rect; maximum: number } | undefined {
    const child = this.children[0];
    const maximum = this.maximumScrollOffset();
    if (this.type !== "scroll" || !child || maximum <= 0.5 ||
        this.bounds.width < scrollIndicatorGutter ||
        this.bounds.height < scrollIndicatorVerticalInset * 2 + 12) return undefined;
    const padding = insets(this.style.padding);
    const visibleHeight = extent(this.bounds.height, padding.top, padding.bottom);
    const trackHeight = Math.max(1,
      this.bounds.height - scrollIndicatorVerticalInset * 2);
    const thumbHeight = Math.min(trackHeight,
      Math.max(24, trackHeight * Math.min(1, visibleHeight / child.measured.height)));
    const current = Math.max(0, Math.min(this.scrollOffsetY, maximum));
    const travel = Math.max(0, trackHeight - thumbHeight);
    const track = {
      x: this.bounds.x + this.bounds.width - scrollIndicatorRightInset - scrollIndicatorWidth,
      y: this.bounds.y + scrollIndicatorVerticalInset,
      width: scrollIndicatorWidth, height: trackHeight,
    };
    const thumb = { ...track, y: track.y + travel * current / maximum, height: thumbHeight };
    return { track, thumb, maximum };
  }
  private isFocusable(): boolean {
    return this.onClick !== undefined || this.onKeyDown !== undefined || this.onTextInput !== undefined ||
      this.onPointerDown !== undefined;
  }
  private paintOrder(): Node[] {
    return this.children.map((child, index) => ({ child, index }))
      .sort((left, right) => (left.child.style.zIndex ?? 0) - (right.child.style.zIndex ?? 0) ||
        left.index - right.index).map(({ child }) => child);
  }
  private modalChild(): Node | undefined {
    return [...this.children].filter((child) => child.style.modal)
      .sort((left, right) => (right.style.zIndex ?? 0) - (left.style.zIndex ?? 0))[0];
  }
  private affineTransform(viewport: Size) {
    const transform = this.style.transform ?? {};
    const scaleX = transform.scaleX ?? 1, scaleY = transform.scaleY ?? 1;
    const radians = (transform.rotation ?? 0) * Math.PI / 180;
    const cosine = Math.cos(radians), sine = Math.sin(radians);
    const originX = (this.bounds.x + this.bounds.width * (transform.originX ?? 0.5)) /
      viewport.width * 2 - 1;
    const originY = 1 - (this.bounds.y + this.bounds.height * (transform.originY ?? 0.5)) /
      viewport.height * 2;
    const m11 = cosine * scaleX, m12 = -sine * scaleX;
    const m21 = sine * scaleY, m22 = cosine * scaleY;
    return { m11, m12, m21, m22,
      translateX: originX - m11 * originX - m21 * originY +
        (transform.translateX ?? 0) / viewport.width * 2,
      translateY: originY - m12 * originX - m22 * originY -
        (transform.translateY ?? 0) / viewport.height * 2 };
  }
  private inverseTransform(point: Point): Point {
    const transform = this.style.transform;
    if (!transform) return point;
    const origin = { x: this.bounds.x + this.bounds.width * (transform.originX ?? 0.5),
      y: this.bounds.y + this.bounds.height * (transform.originY ?? 0.5) };
    const translated = { x: point.x - (transform.translateX ?? 0) - origin.x,
      y: point.y - (transform.translateY ?? 0) - origin.y };
    const radians = -(transform.rotation ?? 0) * Math.PI / 180;
    const cosine = Math.cos(radians), sine = Math.sin(radians);
    const rotated = { x: translated.x * cosine - translated.y * sine,
      y: translated.x * sine + translated.y * cosine };
    const scaleX = transform.scaleX ?? 1, scaleY = transform.scaleY ?? 1;
    if (Math.abs(scaleX) < 0.000001 || Math.abs(scaleY) < 0.000001)
      return { x: Number.POSITIVE_INFINITY, y: Number.POSITIVE_INFINITY };
    return { x: rotated.x / scaleX + origin.x, y: rotated.y / scaleY + origin.y };
  }
  private pointFromRoot(point: Point): Point {
    const parentPoint = this.parent ? this.parent.pointFromRoot(point) : point;
    return this.inverseTransform(parentPoint);
  }
}

function paintRadialGradient(encoder: FrameEncoder, bounds: Rect, gradient: RadialGradient,
  cornerRadius: number, viewport: Size): void {
  if (bounds.width <= 0 || bounds.height <= 0) return;
  encoder.radialGradient({ destination: normalizedRect(bounds, viewport),
    centerX: gradient.centerX ?? 0.5, centerY: gradient.centerY ?? 0.5,
    radius: gradient.radius ?? Math.hypot(bounds.width, bounds.height) / 2,
    cornerRadius, innerColor: gradient.inner, outerColor: gradient.outer });
}

function paintLinearGradient(encoder: FrameEncoder, bounds: Rect, gradient: LinearGradient,
  cornerRadius: number, viewport: Size): void {
  if (bounds.width <= 0 || bounds.height <= 0) return;
  encoder.linearGradient({ destination: normalizedRect(bounds, viewport), cornerRadius,
    direction: gradient.direction ?? "horizontal",
    startColor: gradient.start, endColor: gradient.end });
}

function paintConicGradient(encoder: FrameEncoder, bounds: Rect, gradient: ConicGradient,
  cornerRadius: number, viewport: Size): void {
  if (bounds.width <= 0 || bounds.height <= 0) return;
  encoder.conicGradient({ destination: normalizedRect(bounds, viewport),
    centerX: gradient.centerX ?? 0.5, centerY: gradient.centerY ?? 0.5,
    rotation: (gradient.rotation ?? 0) * Math.PI / 180, cornerRadius,
    startColor: gradient.start, middleColor: gradient.middle, endColor: gradient.end });
}

function paintServerRoundedRect(encoder: FrameEncoder, bounds: Rect, cornerRadius: number,
  fill: Color | undefined, borderWidth: number, border: Color | undefined,
  viewport: Size): void {
  if (bounds.width <= 0 || bounds.height <= 0 ||
      ((!fill || fill.alpha <= 0) && (!border || border.alpha <= 0 || borderWidth <= 0))) return;
  const transparent = { red: 0, green: 0, blue: 0, alpha: 0 };
  encoder.roundedRect({ destination: normalizedRect(bounds, viewport), cornerRadius, borderWidth,
    fillColor: fill ?? transparent, borderColor: border ?? transparent });
}

function paintPath(encoder: FrameEncoder, bounds: Rect, path: PathData | undefined,
  viewport: Size): void {
  if (!path || (!path.fill && !path.fillGradient && !path.fillRadialGradient &&
      !path.fillConicGradient && !path.fillTexture && !path.stroke && !path.strokeGradient &&
      !path.strokeRadialGradient && !path.strokeConicGradient && !path.strokeTexture) ||
      path.viewBox.width <= 0 || path.viewBox.height <= 0) return;
  let destination = bounds;
  if (path.fit === "contain") {
    const sourceAspect = path.viewBox.width / path.viewBox.height;
    const boundsAspect = bounds.width / bounds.height;
    if (sourceAspect > boundsAspect) {
      const height = bounds.width / sourceAspect;
      destination = { ...bounds, y: bounds.y + (bounds.height - height) / 2, height };
    } else {
      const width = bounds.height * sourceAspect;
      destination = { ...bounds, x: bounds.x + (bounds.width - width) / 2, width };
    }
  }
  if (path.sourceClip) {
    const clipValues = [path.sourceClip.x, path.sourceClip.y,
      path.sourceClip.width, path.sourceClip.height];
    if (clipValues.some((value) => !Number.isFinite(value)) ||
        path.sourceClip.width < 0 || path.sourceClip.height < 0)
      throw new RangeError("Path source clip must be a finite nonnegative rectangle");
    if (path.sourceClip.width === 0 || path.sourceClip.height === 0) return;
    const clip = { x: destination.x +
        (path.sourceClip.x - path.viewBox.x) / path.viewBox.width * destination.width,
      y: destination.y +
        (path.sourceClip.y - path.viewBox.y) / path.viewBox.height * destination.height,
      width: path.sourceClip.width / path.viewBox.width * destination.width,
      height: path.sourceClip.height / path.viewBox.height * destination.height };
    encoder.pushClip({ left: clip.x / viewport.width, top: clip.y / viewport.height,
      right: (clip.x + clip.width) / viewport.width,
      bottom: (clip.y + clip.height) / viewport.height });
  }
  encoder.path(path.resourceId, normalizedRect(destination, viewport), path.viewBox, {
    ...(path.fill ? { fill: path.fill } : {}),
    ...(path.fillGradient ? { fillGradient: path.fillGradient } : {}),
    ...(path.fillRadialGradient ? { fillRadialGradient: path.fillRadialGradient } : {}),
    ...(path.fillConicGradient ? { fillConicGradient: path.fillConicGradient } : {}),
    ...(path.fillTexture ? { fillTexture: path.fillTexture } : {}),
    ...(path.stroke ? { stroke: path.stroke } : {}),
    ...(path.strokeGradient ? { strokeGradient: path.strokeGradient } : {}),
    ...(path.strokeRadialGradient ? { strokeRadialGradient: path.strokeRadialGradient } : {}),
    ...(path.strokeConicGradient ? { strokeConicGradient: path.strokeConicGradient } : {}),
    ...(path.strokeTexture ? { strokeTexture: path.strokeTexture } : {}),
    ...(path.strokeWidth !== undefined ? { strokeWidth: path.strokeWidth } : {}),
    ...(path.tolerance !== undefined ? { tolerance: path.tolerance } : {}),
    ...(path.fillRule ? { fillRule: path.fillRule } : {}),
    ...(path.lineCap ? { lineCap: path.lineCap } : {}),
    ...(path.lineJoin ? { lineJoin: path.lineJoin } : {}),
    ...(path.miterLimit !== undefined ? { miterLimit: path.miterLimit } : {}),
    ...(path.dash ? { dash: path.dash } : {}),
  });
  if (path.sourceClip) encoder.popClip();
}

function paintVectorText(encoder: FrameEncoder, bounds: Rect, text: VectorTextData | undefined,
  viewport: Size): void {
  if (!text || !text.value || text.fontSize <= 0 ||
      (!text.fillGradient && !text.fillRadialGradient && text.color.alpha <= 0 &&
        !(text.strokeColor && (text.strokeWidth ?? 0) > 0)) ||
      text.viewBox.width <= 0 || text.viewBox.height <= 0) return;
  const sourceAspect = text.viewBox.width / text.viewBox.height;
  const boundsAspect = bounds.width / bounds.height;
  let destination = bounds;
  if (sourceAspect > boundsAspect) {
    const height = bounds.width / sourceAspect;
    destination = { ...bounds, y: bounds.y + (bounds.height - height) / 2, height };
  } else {
    const width = bounds.height * sourceAspect;
    destination = { ...bounds, x: bounds.x + (bounds.width - width) / 2, width };
  }
  if (text.sourceClip) {
    const clip = { x: destination.x +
        (text.sourceClip.x - text.viewBox.x) / text.viewBox.width * destination.width,
      y: destination.y +
        (text.sourceClip.y - text.viewBox.y) / text.viewBox.height * destination.height,
      width: text.sourceClip.width / text.viewBox.width * destination.width,
      height: text.sourceClip.height / text.viewBox.height * destination.height };
    if (clip.width <= 0 || clip.height <= 0) return;
    encoder.pushClip({ left: clip.x / viewport.width, top: clip.y / viewport.height,
      right: (clip.x + clip.width) / viewport.width,
      bottom: (clip.y + clip.height) / viewport.height });
  }
  if (text.sourceTransform) {
    const matrix = text.sourceTransform;
    const sourceScaleX = destination.width / text.viewBox.width / viewport.width * 2;
    const sourceScaleY = -destination.height / text.viewBox.height / viewport.height * 2;
    const sourceTranslateX = destination.x / viewport.width * 2 - 1 -
      text.viewBox.x * sourceScaleX;
    const sourceTranslateY = 1 - destination.y / viewport.height * 2 -
      text.viewBox.y * sourceScaleY;
    const m21 = sourceScaleX * matrix.c / sourceScaleY;
    const m12 = sourceScaleY * matrix.b / sourceScaleX;
    encoder.pushTransform({ m11: matrix.a, m12, m21, m22: matrix.d,
      translateX: sourceScaleX * matrix.e + sourceTranslateX -
        matrix.a * sourceTranslateX - m21 * sourceTranslateY,
      translateY: sourceScaleY * matrix.f + sourceTranslateY -
        m12 * sourceTranslateX - matrix.d * sourceTranslateY });
  }
  const x = destination.x + (text.x - text.viewBox.x) / text.viewBox.width * destination.width;
  const y = destination.y + (text.y - text.viewBox.y) / text.viewBox.height * destination.height;
  const fontSize = text.fontSize / text.viewBox.height * destination.height;
  const args = [text.value, x / viewport.width * 2 - 1, 1 - y / viewport.height * 2,
    fontSize / viewport.height * 2] as const;
  const mapPoint = (point: Point) => ({
      x: (destination.x + (point.x - text.viewBox.x) / text.viewBox.width * destination.width) /
        viewport.width * 2 - 1,
      y: 1 - (destination.y + (point.y - text.viewBox.y) / text.viewBox.height *
        destination.height) / viewport.height * 2,
    });
  if (text.fillRadialGradient) {
    const gradient = text.fillRadialGradient;
    const objectBoundingBox = gradient.coordinateSpace === "objectBoundingBox";
    const center = objectBoundingBox ? gradient.center : mapPoint(gradient.center);
    const mapVector = (vector: Point) => objectBoundingBox ? vector : (() => {
      const edge = mapPoint({ x: gradient.center.x + vector.x, y: gradient.center.y + vector.y });
      return { x: edge.x - center.x, y: edge.y - center.y };
    })();
    encoder.radialGradientSystemText(...args, { ...gradient, center,
      axisX: mapVector(gradient.axisX), axisY: mapVector(gradient.axisY),
      ...(gradient.focal ? { focal: objectBoundingBox ? gradient.focal : mapPoint(gradient.focal) } : {}) },
      text.family, text.weight, text.fontStyle, text.letterSpacing ?? 0,
      text.decoration ?? TextDecoration.None, 0, text.anchor ?? "start", "alphabetic");
  } else if (text.fillGradient) {
    const objectBoundingBox = text.fillGradient.coordinateSpace === "objectBoundingBox";
    encoder.gradientSystemText(...args, { ...text.fillGradient,
      start: objectBoundingBox ? text.fillGradient.start : mapPoint(text.fillGradient.start),
      end: objectBoundingBox ? text.fillGradient.end : mapPoint(text.fillGradient.end) },
      text.family, text.weight, text.fontStyle, text.letterSpacing ?? 0,
      text.decoration ?? TextDecoration.None, 0, text.anchor ?? "start", "alphabetic");
  } else if (text.strokeColor && (text.strokeWidth ?? 0) > 0) {
    encoder.styledSystemText(...args, text.color, text.strokeColor,
      text.strokeWidth! / text.fontSize, text.family, text.weight, text.fontStyle,
      text.letterSpacing ?? 0, text.decoration ?? TextDecoration.None, 0,
      text.anchor ?? "start", "alphabetic");
  } else {
    encoder.systemText(...args, text.color, text.family, text.weight, text.fontStyle,
      text.letterSpacing ?? 0, text.decoration ?? TextDecoration.None, 0,
      text.anchor ?? "start", "alphabetic");
  }
  if (text.sourceTransform) encoder.popTransform();
  if (text.sourceClip) encoder.popClip();
}

function paintVectorRichText(encoder: FrameEncoder, bounds: Rect,
  text: VectorRichTextData | undefined, viewport: Size): void {
  if (!text || text.runs.length === 0 || text.fontSize <= 0 ||
      text.viewBox.width <= 0 || text.viewBox.height <= 0) return;
  const sourceAspect = text.viewBox.width / text.viewBox.height;
  const boundsAspect = bounds.width / bounds.height;
  let destination = bounds;
  if (sourceAspect > boundsAspect) {
    const height = bounds.width / sourceAspect;
    destination = { ...bounds, y: bounds.y + (bounds.height - height) / 2, height };
  } else {
    const width = bounds.height * sourceAspect;
    destination = { ...bounds, x: bounds.x + (bounds.width - width) / 2, width };
  }
  if (text.sourceClip) {
    const clip = { x: destination.x +
        (text.sourceClip.x - text.viewBox.x) / text.viewBox.width * destination.width,
      y: destination.y +
        (text.sourceClip.y - text.viewBox.y) / text.viewBox.height * destination.height,
      width: text.sourceClip.width / text.viewBox.width * destination.width,
      height: text.sourceClip.height / text.viewBox.height * destination.height };
    if (clip.width <= 0 || clip.height <= 0) return;
    encoder.pushClip({ left: clip.x / viewport.width, top: clip.y / viewport.height,
      right: (clip.x + clip.width) / viewport.width,
      bottom: (clip.y + clip.height) / viewport.height });
  }
  if (text.sourceTransform) {
    const matrix = text.sourceTransform;
    const sourceScaleX = destination.width / text.viewBox.width / viewport.width * 2;
    const sourceScaleY = -destination.height / text.viewBox.height / viewport.height * 2;
    const sourceTranslateX = destination.x / viewport.width * 2 - 1 -
      text.viewBox.x * sourceScaleX;
    const sourceTranslateY = 1 - destination.y / viewport.height * 2 -
      text.viewBox.y * sourceScaleY;
    const m21 = sourceScaleX * matrix.c / sourceScaleY;
    const m12 = sourceScaleY * matrix.b / sourceScaleX;
    encoder.pushTransform({ m11: matrix.a, m12, m21, m22: matrix.d,
      translateX: sourceScaleX * matrix.e + sourceTranslateX -
        matrix.a * sourceTranslateX - m21 * sourceTranslateY,
      translateY: sourceScaleY * matrix.f + sourceTranslateY -
        m12 * sourceTranslateX - matrix.d * sourceTranslateY });
  }
  const x = destination.x + (text.x - text.viewBox.x) / text.viewBox.width * destination.width;
  const y = destination.y + (text.y - text.viewBox.y) / text.viewBox.height * destination.height;
  const fontSize = text.fontSize / text.viewBox.height * destination.height;
  encoder.richText(text.runs, x / viewport.width * 2 - 1, 1 - y / viewport.height * 2,
    fontSize / viewport.height * 2, text.anchor ?? "start", "alphabetic");
  if (text.sourceTransform) encoder.popTransform();
  if (text.sourceClip) encoder.popClip();
}

function paintVectorImage(encoder: FrameEncoder, bounds: Rect, image: VectorImageData | undefined,
  viewport: Size): void {
  if (!image || image.width <= 0 || image.height <= 0 || image.viewBox.width <= 0 ||
      image.viewBox.height <= 0) return;
  const sourceAspect = image.viewBox.width / image.viewBox.height;
  const boundsAspect = bounds.width / bounds.height;
  let documentBounds = bounds;
  if (sourceAspect > boundsAspect) {
    const height = bounds.width / sourceAspect;
    documentBounds = { ...bounds, y: bounds.y + (bounds.height - height) / 2, height };
  } else {
    const width = bounds.height * sourceAspect;
    documentBounds = { ...bounds, x: bounds.x + (bounds.width - width) / 2, width };
  }
  if (image.sourceClip) {
    const clip = { x: documentBounds.x +
        (image.sourceClip.x - image.viewBox.x) / image.viewBox.width * documentBounds.width,
      y: documentBounds.y +
        (image.sourceClip.y - image.viewBox.y) / image.viewBox.height * documentBounds.height,
      width: image.sourceClip.width / image.viewBox.width * documentBounds.width,
      height: image.sourceClip.height / image.viewBox.height * documentBounds.height };
    if (clip.width <= 0 || clip.height <= 0) return;
    encoder.pushClip({ left: clip.x / viewport.width, top: clip.y / viewport.height,
      right: (clip.x + clip.width) / viewport.width,
      bottom: (clip.y + clip.height) / viewport.height });
  }
  if (image.opacity !== undefined && image.opacity < 1) encoder.pushOpacity(image.opacity);
  if (image.sourceTransform) {
    const matrix = image.sourceTransform;
    const sourceScaleX = documentBounds.width / image.viewBox.width / viewport.width * 2;
    const sourceScaleY = -documentBounds.height / image.viewBox.height / viewport.height * 2;
    const sourceTranslateX = documentBounds.x / viewport.width * 2 - 1 -
      image.viewBox.x * sourceScaleX;
    const sourceTranslateY = 1 - documentBounds.y / viewport.height * 2 -
      image.viewBox.y * sourceScaleY;
    const m21 = sourceScaleX * matrix.c / sourceScaleY;
    const m12 = sourceScaleY * matrix.b / sourceScaleX;
    encoder.pushTransform({ m11: matrix.a, m12, m21, m22: matrix.d,
      translateX: sourceScaleX * matrix.e + sourceTranslateX -
        matrix.a * sourceTranslateX - m21 * sourceTranslateY,
      translateY: sourceScaleY * matrix.f + sourceTranslateY -
        m12 * sourceTranslateX - matrix.d * sourceTranslateY });
  }
  const destination = {
    x: documentBounds.x + (image.x - image.viewBox.x) / image.viewBox.width * documentBounds.width,
    y: documentBounds.y + (image.y - image.viewBox.y) / image.viewBox.height * documentBounds.height,
    width: image.width / image.viewBox.width * documentBounds.width,
    height: image.height / image.viewBox.height * documentBounds.height,
  };
  paintImage(encoder, destination, { textureId: image.textureId, sourceSize: image.sourceSize,
    fit: image.fit ?? "fill", sampling: image.sampling ?? "linear",
    alignX: image.alignX ?? "center", alignY: image.alignY ?? "center" }, 0, viewport);
  if (image.sourceTransform) encoder.popTransform();
  if (image.opacity !== undefined && image.opacity < 1) encoder.popOpacity();
  if (image.sourceClip) encoder.popClip();
}

function paintMesh(encoder: FrameEncoder, bounds: Rect, mesh: MeshData | undefined,
  viewport: Size): void {
  if (!mesh || mesh.indices.length === 0 || mesh.indices.length % 3 !== 0) return;
  const source = mesh.viewBox ?? { x: 0, y: 0, width: 1, height: 1 };
  if (source.width <= 0 || source.height <= 0) return;
  let destination = bounds;
  if (mesh.fit === "contain") {
    const sourceAspect = source.width / source.height;
    const boundsAspect = bounds.width / bounds.height;
    if (sourceAspect > boundsAspect) {
      const height = bounds.width / sourceAspect;
      destination = { ...bounds, y: bounds.y + (bounds.height - height) / 2, height };
    } else {
      const width = bounds.height * sourceAspect;
      destination = { ...bounds, x: bounds.x + (bounds.width - width) / 2, width };
    }
  }
  encoder.meshResource(mesh.resourceId, normalizedRect(destination, viewport), source);
}

function normalizedRect(r: Rect, viewport: Size): ClipRect {
  return { left: r.x / viewport.width * 2 - 1,
    top: 1 - r.y / viewport.height * 2,
    right: (r.x + r.width) / viewport.width * 2 - 1,
    bottom: 1 - (r.y + r.height) / viewport.height * 2 };
}

function imageGeometry(bounds: Rect, image: ImagePaint): {
  destination: Rect; uv: ClipRect;
} {
  let uv: ClipRect = { left: 0, top: 0, right: 1, bottom: 1 };
  let sourceSize = image.sourceSize;
  if (image.sourceRect) {
    if (!sourceSize || sourceSize.width <= 0 || sourceSize.height <= 0 ||
        image.sourceRect.x < 0 || image.sourceRect.y < 0 ||
        image.sourceRect.width <= 0 || image.sourceRect.height <= 0 ||
        image.sourceRect.x + image.sourceRect.width > sourceSize.width ||
        image.sourceRect.y + image.sourceRect.height > sourceSize.height) {
      return { destination: { ...bounds, width: 0, height: 0 }, uv };
    }
    uv = { left: image.sourceRect.x / sourceSize.width,
      top: image.sourceRect.y / sourceSize.height,
      right: (image.sourceRect.x + image.sourceRect.width) / sourceSize.width,
      bottom: (image.sourceRect.y + image.sourceRect.height) / sourceSize.height };
    sourceSize = { width: image.sourceRect.width, height: image.sourceRect.height };
  }
  if (!sourceSize || !image.fit || image.fit === "fill" ||
      !sourceSize || sourceSize.width <= 0 || sourceSize.height <= 0) {
    return { destination: bounds, uv };
  }
  const sourceAspect = sourceSize.width / sourceSize.height;
  const destinationAspect = bounds.width / bounds.height;
  const alignment = (value: "start" | "center" | "end" | undefined) =>
    value === "start" ? 0 : value === "end" ? 1 : 0.5;
  const alignX = alignment(image.alignX), alignY = alignment(image.alignY);
  if (image.fit === "contain") {
    if (sourceAspect > destinationAspect) {
      const height = bounds.width / sourceAspect;
      return { destination: { ...bounds, y: bounds.y + (bounds.height - height) * alignY, height }, uv };
    }
    const width = bounds.height * sourceAspect;
    return { destination: { ...bounds, x: bounds.x + (bounds.width - width) * alignX, width }, uv };
  }
  if (sourceAspect > destinationAspect) {
    const visible = destinationAspect / sourceAspect;
    const width = uv.right - uv.left;
    const left = uv.left + width * (1 - visible) * alignX;
    return { destination: bounds, uv: { ...uv, left, right: left + width * visible } };
  }
  const visible = sourceAspect / destinationAspect;
  const height = uv.bottom - uv.top;
  const top = uv.top + height * (1 - visible) * alignY;
  return { destination: bounds, uv: { ...uv, top, bottom: top + height * visible } };
}

function paintImage(encoder: FrameEncoder, bounds: Rect, image: ImagePaint | undefined,
  cornerRadius: number, viewport: Size): void {
  if (!image || bounds.width <= 0 || bounds.height <= 0) return;
  if (image.nineSlice && image.sourceSize && image.sourceSize.width > 0 &&
      image.sourceSize.height > 0) {
    const source = image.nineSlice.source;
    const destination = image.nineSlice.destination ?? source;
    encoder.nineSliceImage(image.textureId, normalizedRect(bounds, viewport),
      { left: 0, top: 0, right: 1, bottom: 1 },
      { left: source.left / image.sourceSize.width, top: source.top / image.sourceSize.height,
        right: source.right / image.sourceSize.width, bottom: source.bottom / image.sourceSize.height },
      destination, image.tint, cornerRadius, image.sampling ?? "linear");
    return;
  }
  if (image.tileSize) {
    const tile = image.tileSize;
    if (tile.width <= 0 || tile.height <= 0) return;
    const repeatX = image.repeatX ?? true, repeatY = image.repeatY ?? true;
    if (!repeatX && !repeatY) return;
    const offsetX = image.tileOffsetX ?? 0, offsetY = image.tileOffsetY ?? 0;
    const uv = { left: repeatX ? -offsetX / tile.width : 0,
      top: repeatY ? -offsetY / tile.height : 0,
      right: repeatX ? (bounds.width - offsetX) / tile.width : 1,
      bottom: repeatY ? (bounds.height - offsetY) / tile.height : 1 };
    if (image.effects) {
      encoder.filteredImageSurface(image.textureId, normalizedRect(bounds, viewport), uv,
        image.effects, image.tint, cornerRadius, image.sampling ?? "linear", repeatX, repeatY);
    } else {
      encoder.tiledImageSurface(image.textureId, normalizedRect(bounds, viewport), uv,
        image.tint, cornerRadius, image.sampling ?? "linear", repeatX, repeatY);
    }
    return;
  }
  const geometry = imageGeometry(bounds, image);
  if (geometry.destination.width <= 0 || geometry.destination.height <= 0) return;
  if (image.effects) {
    encoder.filteredImageSurface(image.textureId,
      normalizedRect(geometry.destination, viewport), geometry.uv, image.effects,
      image.tint, cornerRadius, image.sampling ?? "linear");
  } else if (cornerRadius > 0 || image.sampling === "nearest") {
    encoder.imageSurface(image.textureId, normalizedRect(geometry.destination, viewport), geometry.uv,
      image.tint, cornerRadius, image.sampling ?? "linear");
  } else {
    encoder.image(image.textureId, normalizedRect(geometry.destination, viewport),
      geometry.uv, image.tint);
  }
}

function paintDiagonalStripes(encoder: FrameEncoder, r: Rect,
  pattern: DiagonalStripePattern | undefined, viewport: Size): void {
  if (!pattern || pattern.color.alpha <= 0 || r.width <= 0 || r.height <= 0) return;
  const width = Math.max(1, pattern.stripeWidth ?? 8);
  encoder.diagonalPattern({ destination: normalizedRect(r, viewport), stripeWidth: width,
    gap: Math.max(0, pattern.gap ?? 8), offset: pattern.offset ?? 0,
    backward: pattern.direction === "backward", color: pattern.color });
}

function paintGridPattern(encoder: FrameEncoder, bounds: Rect, pattern: GridPattern | undefined,
  cornerRadius: number, viewport: Size): void {
  if (!pattern || bounds.width <= 0 || bounds.height <= 0) return;
  encoder.gridPattern({ destination: normalizedRect(bounds, viewport),
    spacing: pattern.spacing ?? 24, minorWidth: pattern.minorWidth ?? 1,
    majorWidth: pattern.majorWidth ?? 1.5, offsetX: pattern.offsetX ?? 0,
    offsetY: pattern.offsetY ?? 0, majorEvery: pattern.majorEvery ?? 5,
    cornerRadius, minorColor: pattern.minorColor, majorColor: pattern.majorColor });
}

function paintDotGrid(encoder: FrameEncoder, bounds: Rect, pattern: DotGridPattern | undefined,
  viewport: Size): void {
  if (!pattern || bounds.width <= 0 || bounds.height <= 0) return;
  encoder.dotGrid({ destination: normalizedRect(bounds, viewport), rows: pattern.rows,
    columns: pattern.columns, filledMask: pattern.filledMask >>> 0,
    activeIndex: pattern.activeIndex ?? -1, inset: pattern.inset ?? 5,
    radius: pattern.radius ?? 4, borderWidth: pattern.borderWidth ?? 2,
    fillColor: pattern.fillColor, ringColor: pattern.ringColor,
    highlightColor: pattern.highlightColor ?? pattern.fillColor });
}

function paintWaveDots(encoder: FrameEncoder, bounds: Rect, pattern: WaveDotPattern | undefined,
  viewport: Size): void {
  if (!pattern || bounds.width <= 0 || bounds.height <= 0) return;
  encoder.waveDots({ destination: normalizedRect(bounds, viewport), count: pattern.count,
    inset: pattern.inset ?? 0, minimumRadius: pattern.minimumRadius,
    maximumRadius: pattern.maximumRadius, phase: pattern.phase,
    frequency: pattern.frequency, borderWidth: pattern.borderWidth ?? 0,
    troughStartColor: pattern.troughStartColor, troughEndColor: pattern.troughEndColor,
    crestStartColor: pattern.crestStartColor, crestEndColor: pattern.crestEndColor,
    borderColor: pattern.borderColor });
}

function paintArc(encoder: FrameEncoder, bounds: Rect, arc: ArcStyle | undefined,
  viewport: Size): void {
  const startColor = arc?.startColor ?? arc?.color;
  const endColor = arc?.endColor ?? arc?.color;
  if (!arc || !startColor || !endColor || bounds.width <= 0 || bounds.height <= 0 ||
      (startColor.alpha <= 0 && endColor.alpha <= 0) ||
      arc.sweepAngle <= 0 || arc.thickness <= 0) return;
  const shared = { destination: normalizedRect(bounds, viewport),
    startAngle: arc.startAngle * Math.PI / 180,
    sweepAngle: Math.min(360, arc.sweepAngle) * Math.PI / 180,
    thickness: arc.thickness, roundCaps: arc.roundCaps ?? true };
  if (arc.startColor || arc.endColor) encoder.gradientArc({ ...shared, startColor, endColor });
  else encoder.arc({ ...shared, color: startColor });
}

export function constrain(size: Size, c: Constraints): Size {
  return { width: clamp(size.width, c.minWidth, Math.max(c.minWidth, c.maxWidth)),
    height: clamp(size.height, c.minHeight, Math.max(c.minHeight, c.maxHeight)) };
}
const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));
const extent = (value: number, before: number, after: number): number => Math.max(0, value - before - after);
const insets = (p?: Partial<Insets>): Insets => ({ top: p?.top ?? 0, right: p?.right ?? 0, bottom: p?.bottom ?? 0, left: p?.left ?? 0 });
const contains = (r: Rect, p: Point): boolean => p.x >= r.x && p.y >= r.y && p.x < r.x + r.width && p.y < r.y + r.height;
function rectangleVertices(r: Rect, color: Color, v: Size): Vertex[] {
  const l = r.x / v.width * 2 - 1, right = (r.x + r.width) / v.width * 2 - 1;
  const t = 1 - r.y / v.height * 2, b = 1 - (r.y + r.height) / v.height * 2;
  return [{ x:l,y:t,color },{ x:l,y:b,color },{ x:right,y:b,color },{ x:l,y:t,color },{ x:right,y:b,color },{ x:right,y:t,color }];
}

function paintCircle(encoder: FrameEncoder, r: Rect, fill: Color | undefined,
  gradient: LinearGradient | undefined,
  borderWidth: number, border: Color | undefined, viewport: Size): void {
  const radius = Math.min(r.width, r.height) / 2;
  if (radius <= 0) return;
  if (gradient) encoder.linearGradientCircle({ destination: normalizedRect(r, viewport),
    direction: gradient.direction ?? "horizontal",
    startColor: gradient.start, endColor: gradient.end });
  const transparent = { red: 0, green: 0, blue: 0, alpha: 0 };
  if ((!gradient && fill && fill.alpha > 0) || (border && border.alpha > 0 && borderWidth > 0))
    encoder.circle({ destination: normalizedRect(r, viewport), borderWidth,
      fillColor: gradient ? transparent : fill ?? transparent,
      borderColor: border ?? transparent });
}

const glyphs: Readonly<Record<string, readonly number[]>> = {
  A:[14,17,17,31,17,17,17], C:[14,17,16,16,16,17,14], D:[30,17,17,17,17,17,30],
  E:[31,16,16,30,16,16,31],
  F:[31,16,16,30,16,16,16], G:[14,17,16,23,17,17,15], H:[17,17,17,31,17,17,17],
  I:[14,4,4,4,4,4,14], K:[17,18,20,24,20,18,17],
  L:[16,16,16,16,16,16,31], M:[17,27,21,21,17,17,17], N:[17,25,21,19,17,17,17],
  O:[14,17,17,17,17,17,14], P:[30,17,17,30,16,16,16], R:[30,17,17,30,20,18,17],
  S:[15,16,16,14,1,1,30], T:[31,4,4,4,4,4,4], U:[17,17,17,17,17,17,14],
  V:[17,17,17,17,17,10,4], W:[17,17,17,21,21,21,10], X:[17,17,10,4,10,17,17],
  Y:[17,17,10,4,4,4,4], "0":[14,17,19,21,25,17,14], "1":[4,12,4,4,4,4,14],
  "2":[14,17,1,2,4,8,31], "3":[30,1,1,14,1,1,30], "4":[2,6,10,18,31,2,2],
  "5":[31,16,16,30,1,1,30], "6":[14,16,16,30,17,17,14], "7":[31,1,2,4,8,8,8],
  "8":[14,17,17,14,17,17,14], "9":[14,17,17,15,1,1,14], " ":[0,0,0,0,0,0,0],
};
const fallback = [31,17,1,2,4,0,4] as const;
function paintText(encoder: FrameEncoder, bounds: Rect, value: string, style: TextStyle, viewport: Size): void {
  const fontSize = style.fontSize ?? 16, color = style.color ?? { red:1,green:1,blue:1,alpha:1 }, cell = fontSize / 7;
  const lines = layoutTextLines(value, style, bounds.width);
  const lineHeight = style.lineHeight ?? fontSize * 1.2;
  const lineX = (width: number) => bounds.x + (style.textAlign === "center"
    ? (bounds.width - width) / 2 : style.textAlign === "end" ? bounds.width - width : 0);
  if (style.fontFamily && style.fontFamily !== "pixel") {
    const family = style.fontFamily;
    const tracking = (style.letterSpacing ?? 0) / fontSize;
    const decoration = style.textDecoration === "underline" ? TextDecoration.Underline
      : style.textDecoration === "line-through" ? TextDecoration.LineThrough
      : style.textDecoration === "underline line-through"
        ? TextDecoration.Underline | TextDecoration.LineThrough : TextDecoration.None;
    lines.forEach((line, index) => {
      if (line.value.length === 0) return;
      encoder.systemText(line.value, lineX(line.width) / viewport.width * 2 - 1,
        1 - (bounds.y + index * lineHeight) / viewport.height * 2,
        fontSize / viewport.height * 2, color, family, style.fontWeight, style.fontStyle,
        tracking, decoration, style.fontResourceId);
    });
    return;
  }
  const vertices: Vertex[] = [];
  lines.forEach((line, lineIndex) => [...line.value.toUpperCase()]
    .forEach((character, characterIndex) => (glyphs[character] ?? fallback).forEach((bits, row) => {
      for (let column = 0; column < 5; column++) if (bits & (1 << (4 - column))) vertices.push(...rectangleVertices({
        x: lineX(line.width) + characterIndex * cell * 6 + column * cell,
        y: bounds.y + lineIndex * lineHeight + row * cell, width: cell, height: cell,
      }, color, viewport));
    })));
  if (vertices.length) encoder.triangles(vertices);
}

function paintRichText(encoder: FrameEncoder, bounds: Rect, spans: readonly RichTextSpan[],
  base: TextStyle, viewport: Size): void {
  if (spans.length === 0) return;
  const fontSize = base.fontSize ?? 16;
  const lines = layoutRichTextLines(spans, base, bounds.width);
  const lineHeight = base.lineHeight ?? fontSize * 1.2;
  const lineX = (width: number) => bounds.x + (base.textAlign === "center"
    ? (bounds.width - width) / 2 : base.textAlign === "end" ? bounds.width - width : 0);
  lines.forEach((line, lineIndex) => {
    if (line.spans.length === 0) return;
    encoder.richText(line.spans.map((span) => {
      const style = span.style;
      const decoration = style.textDecoration === "underline" ? TextDecoration.Underline
        : style.textDecoration === "line-through" ? TextDecoration.LineThrough
        : style.textDecoration === "underline line-through"
          ? TextDecoration.Underline | TextDecoration.LineThrough : TextDecoration.None;
      return {
        text: span.value,
        color: style.color ?? { red: 1, green: 1, blue: 1, alpha: 1 },
        family: !style.fontFamily || style.fontFamily === "pixel"
          ? "system" as const : style.fontFamily,
        ...(style.fontWeight ? { weight: style.fontWeight } : {}),
        ...(style.fontStyle ? { style: style.fontStyle } : {}),
        letterSpacing: (style.letterSpacing ?? 0) / fontSize,
        decoration,
        ...(style.fontResourceId === undefined ? {} : { fontResourceId: style.fontResourceId }),
      };
    }), lineX(line.width) / viewport.width * 2 - 1,
    1 - (bounds.y + lineIndex * lineHeight) / viewport.height * 2,
    fontSize / viewport.height * 2);
  });
}
