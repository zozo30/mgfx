import { FrameEncoder, Key, type ClipRect, type Color, type PathSegment, type Vertex } from "./protocol.js";

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
export interface ImagePaint {
  readonly textureId: number;
  readonly tint?: Color;
  readonly sourceSize?: Size;
  readonly fit?: "fill" | "contain" | "cover";
}
export interface Style {
  preferredSize?: Partial<Size>; padding?: Partial<Insets>; gap?: number;
  background?: Color; backgroundGradient?: LinearGradient;
  backgroundPattern?: DiagonalStripePattern; flexGrow?: number;
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
}
export interface TextStyle {
  fontSize?: number;
  color?: Color;
  fontFamily?: "pixel" | "system" | "monospace";
  lineHeight?: number;
}

const nativeTextAdvances = new Map<string, number>();
const nativeTextKey = (family: "system" | "monospace", value: string) => `${family}\0${value}`;
export function cacheNativeTextAdvance(family: "system" | "monospace", value: string,
  advance: number): void {
  if (Number.isFinite(advance) && advance >= 0) nativeTextAdvances.set(nativeTextKey(family, value), advance);
}
export function nativeTextAdvance(family: "system" | "monospace", value: string): number | undefined {
  return nativeTextAdvances.get(nativeTextKey(family, value));
}
export interface MeshData {
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
  readonly fit?: "stretch" | "contain";
  readonly fill?: Color;
  readonly fillGradient?: {
    readonly start: Point; readonly end: Point;
    readonly startColor: Color; readonly endColor: Color;
  };
  readonly stroke?: Color;
  readonly strokeWidth?: number;
  readonly tolerance?: number;
  readonly fillRule?: "nonzero" | "evenodd";
  readonly lineCap?: "butt" | "round";
  readonly lineJoin?: "bevel" | "round";
}
export type ElementType = "box" | "row" | "column" | "stack" | "text" | "scroll" | "circle" | "mesh" | "path";
export interface Element {
  type: ElementType; key: string; style: Style; children: readonly Element[];
  onClick?: () => void; onHoverChange?: (hovered: boolean) => void;
  onPressChange?: (pressed: boolean) => void; value?: string; textStyle?: TextStyle;
  onFocusChange?: (focused: boolean) => void;
  onScroll?: (deltaX: number, deltaY: number) => void; scrollOffsetY?: number;
  onKeyDown?: (key: Key) => void; onTextInput?: (text: string) => void;
  mesh?: MeshData;
  path?: PathData;
}

const make = (type: ElementType, children: readonly Element[], style: Style, key: string): Element =>
  ({ type, children, style, key });
export const box = (style: Style = {}, key = ""): Element => make("box", [], style, key);
export const circle = (style: Style = {}, key = ""): Element => make("circle", [], style, key);
export const mesh = (data: MeshData, style: Style = {}, key = ""): Element =>
  ({ ...make("mesh", [], style, key), mesh: data });
export const path = (data: PathData, style: Style = {}, key = ""): Element =>
  ({ ...make("path", [], style, key), path: data });
export const row = (children: readonly Element[], style: Style = {}, key = ""): Element => make("row", children, style, key);
export const column = (children: readonly Element[], style: Style = {}, key = ""): Element => make("column", children, style, key);
export const stack = (children: readonly Element[], style: Style = {}, key = ""): Element => make("stack", children, style, key);
export const text = (value: string, textStyle: TextStyle = {}, key = ""): Element =>
  ({ type: "text", children: [], style: {}, key, value, textStyle });
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
  onKeyDown?: (key: Key) => void;
  onTextInput?: (text: string) => void;
}): Element => ({ ...element, ...handlers });

export abstract class Component {
  private notify: (() => void) | undefined;
  abstract build(): Element;
  protected invalidate(): void { this.notify?.(); }
  attach(callback: () => void): void { this.notify = callback; }
}

export class ComponentHost {
  private component: Component | undefined;
  private root: Node | undefined;
  private dirty = false;
  private hovered: Node | undefined;
  private pressed: Node | undefined;
  private focused: Node | undefined;
  private keyboardPressed: Node | undefined;
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
    const target = this.root?.hitTarget(point);
    if (target === this.hovered) return false;
    this.hovered?.onHoverChange?.(false);
    this.hovered = target;
    this.hovered?.onHoverChange?.(true);
    return true;
  }
  pointerDown(point: Point): boolean {
    const target = this.root?.hitTarget(point);
    if (!target) return false;
    this.setFocus(target);
    this.pressed?.onPressChange?.(false);
    this.pressed = target;
    target.onPressChange?.(true);
    return true;
  }
  pointerUp(point: Point): boolean {
    const pressed = this.pressed;
    if (!pressed) return false;
    this.pressed = undefined;
    pressed.onPressChange?.(false);
    if (this.root?.hitTarget(point) === pressed) pressed.onClick?.();
    return true;
  }
  keyDown(key: Key, shift: boolean, repeat: boolean): boolean {
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
    if (this.focused?.onKeyDown) {
      this.focused.onKeyDown(key);
      return true;
    }
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
    const target = this.root?.scrollTarget(point);
    if (!target?.onScroll) return false;
    target.onScroll(deltaX, deltaY);
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
    if (this.focused) {
      const targets: Node[] = [];
      this.root.collectTargets(targets);
      if (!targets.includes(this.focused)) this.setFocus(targets[0]);
    }
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
}

class Node {
  type: ElementType; key: string; style: Style = {}; children: Node[] = [];
  onClick: (() => void) | undefined; value = ""; textStyle: TextStyle = {};
  onHoverChange: ((hovered: boolean) => void) | undefined;
  onPressChange: ((pressed: boolean) => void) | undefined;
  onFocusChange: ((focused: boolean) => void) | undefined;
  onScroll: ((deltaX: number, deltaY: number) => void) | undefined;
  scrollOffsetY = 0;
  onKeyDown: ((key: Key) => void) | undefined;
  onTextInput: ((text: string) => void) | undefined;
  mesh: MeshData | undefined = undefined;
  path: PathData | undefined = undefined;
  measured: Size = { width: 0, height: 0 };
  bounds: Rect = { x: 0, y: 0, width: 0, height: 0 };
  constructor(element: Element) { this.type = element.type; this.key = element.key; this.update(element); }
  matches(element: Element): boolean { return this.type === element.type && this.key === element.key; }
  update(element: Element): void {
    this.type = element.type; this.key = element.key; this.style = element.style;
    this.onClick = element.onClick; this.onHoverChange = element.onHoverChange;
    this.onPressChange = element.onPressChange; this.onFocusChange = element.onFocusChange;
    this.onScroll = element.onScroll; this.scrollOffsetY = element.scrollOffsetY ?? 0;
    this.onKeyDown = element.onKeyDown; this.onTextInput = element.onTextInput;
    this.value = element.value ?? "";
    this.textStyle = element.textStyle ?? {};
    this.mesh = element.mesh;
    this.path = element.path;
    const old = this.children, used = old.map(() => false);
    this.children = element.children.map((child, index) => {
      let found = child.key === "" && old[index]?.matches(child) ? index : -1;
      if (child.key !== "") found = old.findIndex((candidate, candidateIndex) =>
        !used[candidateIndex] && candidate.matches(child));
      if (found < 0) return new Node(child);
      used[found] = true; old[found]!.update(child); return old[found]!;
    });
  }
  measure(constraints: Constraints): Size {
    const padding = insets(this.style.padding);
    const inner = { minWidth: 0, maxWidth: extent(constraints.maxWidth, padding.left, padding.right),
      minHeight: 0, maxHeight: extent(constraints.maxHeight, padding.top, padding.bottom) };
    if (this.type === "scroll") inner.maxHeight = 1_000_000;
    let width = 0, height = 0;
    if (this.type === "text" && this.value) {
      const fontSize = this.textStyle.fontSize ?? 16;
      const lines = this.value.split("\n");
      if (this.textStyle.fontFamily && this.textStyle.fontFamily !== "pixel") {
        const averageAdvance = this.textStyle.fontFamily === "monospace" ? 0.60 : 0.56;
        width = Math.max(0, ...lines.map((line) => {
          const exactAdvance = nativeTextAdvance(this.textStyle.fontFamily as "system" | "monospace", line);
          return exactAdvance !== undefined ? exactAdvance * fontSize
            : [...line].length * fontSize * averageAdvance;
        }));
      } else {
        const cell = fontSize / 7;
        width = Math.max(0, ...lines.map((line) => line.length === 0 ? 0
          : line.length * cell * 6 - cell));
      }
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
    this.measured = constrain({ width: Math.max(preferred.width ?? 0, width + padding.left + padding.right),
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
          width: Math.min(content.width, child.measured.width), height: child.measured.height });
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
      const hasHorizontal = child.style.inset?.left !== undefined || child.style.inset?.right !== undefined;
      const hasVertical = child.style.inset?.top !== undefined || child.style.inset?.bottom !== undefined;
      child.layout({ x: content.x + inset.left, y: content.y + inset.top,
        width: hasHorizontal ? extent(content.width, inset.left, inset.right) : child.measured.width,
        height: hasVertical ? extent(content.height, inset.top, inset.bottom) : child.measured.height });
    }
  }
  paint(encoder: FrameEncoder, viewport: Size): void {
    if (this.style.clip) encoder.pushClip({ left: this.bounds.x / viewport.width,
      top: this.bounds.y / viewport.height, right: (this.bounds.x + this.bounds.width) / viewport.width,
      bottom: (this.bounds.y + this.bounds.height) / viewport.height });
    const background = this.style.background;
    const gradient = this.style.backgroundGradient;
    if (this.type === "mesh") {
      paintMesh(encoder, this.bounds, this.mesh, viewport);
    } else if (this.type === "path") {
      paintPath(encoder, this.bounds, this.path, viewport);
    } else if (this.type === "circle") {
      paintCircle(encoder, this.bounds, background, gradient, this.style.borderWidth ?? 0,
        this.style.borderColor, viewport);
    } else if ((this.style.cornerRadius ?? 0) > 0) {
      paintRoundedRect(encoder, this.bounds, this.style.cornerRadius ?? 0, background, gradient,
        this.style.borderWidth ?? 0, this.style.borderColor, viewport);
    } else {
      if (this.bounds.width > 0 && this.bounds.height > 0) {
        if (gradient) encoder.triangles(gradientRectangleVertices(this.bounds, gradient, viewport));
        else if (background && background.alpha > 0)
          encoder.triangles(rectangleVertices(this.bounds, background, viewport));
        if (this.style.backgroundImage) {
          const image = imageGeometry(this.bounds, this.style.backgroundImage);
          encoder.image(this.style.backgroundImage.textureId, normalizedRect(image.destination, viewport),
            image.uv, this.style.backgroundImage.tint);
        }
      }
      paintDiagonalStripes(encoder, this.bounds, this.style.backgroundPattern, viewport);
      paintBorder(encoder, this.bounds, this.style.borderWidth ?? 0, this.style.borderColor, viewport);
    }
    if (this.type === "text") paintText(encoder, this.bounds, this.value, this.textStyle, viewport);
    for (const child of this.paintOrder()) child.paint(encoder, viewport);
    if (this.style.clip) encoder.popClip();
  }
  hitTarget(point: Point): Node | undefined {
    if (!contains(this.bounds, point)) return undefined;
    const modal = this.modalChild();
    if (modal) return modal.hitTarget(point);
    const ordered = this.paintOrder();
    for (let i = ordered.length - 1; i >= 0; i--) {
      const target = ordered[i]!.hitTarget(point);
      if (target) return target;
    }
    return this.isFocusable() ? this : undefined;
  }
  collectTargets(targets: Node[]): void {
    if (this.isFocusable()) targets.push(this);
    const modal = this.modalChild();
    if (modal) modal.collectTargets(targets);
    else for (const child of this.paintOrder()) child.collectTargets(targets);
  }
  scrollTarget(point: Point): Node | undefined {
    if (!contains(this.bounds, point)) return undefined;
    const modal = this.modalChild();
    if (modal) return modal.scrollTarget(point);
    const ordered = this.paintOrder();
    for (let i = ordered.length - 1; i >= 0; i--) {
      const target = ordered[i]!.scrollTarget(point);
      if (target) return target;
    }
    return this.onScroll ? this : undefined;
  }
  private isFocusable(): boolean {
    return this.onClick !== undefined || this.onKeyDown !== undefined || this.onTextInput !== undefined;
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
}

function paintPath(encoder: FrameEncoder, bounds: Rect, path: PathData | undefined,
  viewport: Size): void {
  if (!path || (!path.fill && !path.fillGradient && !path.stroke) ||
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
  encoder.path(path.resourceId, normalizedRect(destination, viewport), path.viewBox, {
    ...(path.fill ? { fill: path.fill } : {}),
    ...(path.fillGradient ? { fillGradient: path.fillGradient } : {}),
    ...(path.stroke ? { stroke: path.stroke } : {}),
    ...(path.strokeWidth !== undefined ? { strokeWidth: path.strokeWidth } : {}),
    ...(path.tolerance !== undefined ? { tolerance: path.tolerance } : {}),
    ...(path.fillRule ? { fillRule: path.fillRule } : {}),
    ...(path.lineCap ? { lineCap: path.lineCap } : {}),
    ...(path.lineJoin ? { lineJoin: path.lineJoin } : {}),
  });
}

function paintMesh(encoder: FrameEncoder, bounds: Rect, mesh: MeshData | undefined,
  viewport: Size): void {
  if (!mesh || mesh.indices.length === 0 || mesh.indices.length % 3 !== 0) return;
  const vertices: Vertex[] = [];
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
  for (const index of mesh.indices) {
    const position = mesh.positions[index];
    if (!position) return;
    const color = mesh.colors?.[index] ?? mesh.color;
    vertices.push(pointVertex({
      x: destination.x + (position.x - source.x) / source.width * destination.width,
      y: destination.y + (position.y - source.y) / source.height * destination.height,
    }, color, viewport));
  }
  encoder.triangles(vertices);
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
  const uv: ClipRect = { left: 0, top: 0, right: 1, bottom: 1 };
  if (!image.sourceSize || !image.fit || image.fit === "fill" ||
      image.sourceSize.width <= 0 || image.sourceSize.height <= 0) {
    return { destination: bounds, uv };
  }
  const sourceAspect = image.sourceSize.width / image.sourceSize.height;
  const destinationAspect = bounds.width / bounds.height;
  if (image.fit === "contain") {
    if (sourceAspect > destinationAspect) {
      const height = bounds.width / sourceAspect;
      return { destination: { ...bounds, y: bounds.y + (bounds.height - height) / 2, height }, uv };
    }
    const width = bounds.height * sourceAspect;
    return { destination: { ...bounds, x: bounds.x + (bounds.width - width) / 2, width }, uv };
  }
  if (sourceAspect > destinationAspect) {
    const visible = destinationAspect / sourceAspect;
    return { destination: bounds, uv: { ...uv, left: (1 - visible) / 2, right: (1 + visible) / 2 } };
  }
  const visible = sourceAspect / destinationAspect;
  return { destination: bounds, uv: { ...uv, top: (1 - visible) / 2, bottom: (1 + visible) / 2 } };
}

function paintDiagonalStripes(encoder: FrameEncoder, r: Rect,
  pattern: DiagonalStripePattern | undefined, viewport: Size): void {
  if (!pattern || pattern.color.alpha <= 0 || r.width <= 0 || r.height <= 0) return;
  const width = Math.max(1, pattern.stripeWidth ?? 8);
  const gap = Math.max(0, pattern.gap ?? 8), period = width + gap;
  const offset = ((pattern.offset ?? 0) % period + period) % period;
  const slant = pattern.direction === "backward" ? -r.height : r.height;
  const vertices: Vertex[] = [];
  for (let x = -r.height - width + offset; x < r.width + r.height + width; x += period) {
    const topLeft = { x: r.x + x + slant, y: r.y };
    const topRight = { x: topLeft.x + width, y: r.y };
    const bottomLeft = { x: r.x + x, y: r.y + r.height };
    const bottomRight = { x: bottomLeft.x + width, y: r.y + r.height };
    vertices.push(pointVertex(topLeft, pattern.color, viewport),
      pointVertex(bottomLeft, pattern.color, viewport),
      pointVertex(bottomRight, pattern.color, viewport),
      pointVertex(topLeft, pattern.color, viewport),
      pointVertex(bottomRight, pattern.color, viewport),
      pointVertex(topRight, pattern.color, viewport));
  }
  if (vertices.length === 0) return;
  encoder.pushClip({ left: r.x / viewport.width, top: r.y / viewport.height,
    right: (r.x + r.width) / viewport.width,
    bottom: (r.y + r.height) / viewport.height });
  encoder.triangles(vertices);
  encoder.popClip();
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

function gradientRectangleVertices(r: Rect, gradient: LinearGradient, v: Size): Vertex[] {
  const topLeft = { x: r.x, y: r.y }, bottomLeft = { x: r.x, y: r.y + r.height };
  const bottomRight = { x: r.x + r.width, y: r.y + r.height };
  const topRight = { x: r.x + r.width, y: r.y };
  return [topLeft, bottomLeft, bottomRight, topLeft, bottomRight, topRight]
    .map((point) => pointVertex(point, gradientColor(point, r, gradient), v));
}

function paintBorder(encoder: FrameEncoder, r: Rect, requested: number,
  color: Color | undefined, viewport: Size): void {
  const width = Math.min(requested, r.width / 2, r.height / 2);
  if (!color || color.alpha <= 0 || width <= 0) return;
  const vertices = [
    ...rectangleVertices({ x: r.x, y: r.y, width: r.width, height: width }, color, viewport),
    ...rectangleVertices({ x: r.x, y: r.y + r.height - width, width: r.width, height: width }, color, viewport),
    ...rectangleVertices({ x: r.x, y: r.y + width, width, height: r.height - width * 2 }, color, viewport),
    ...rectangleVertices({ x: r.x + r.width - width, y: r.y + width, width, height: r.height - width * 2 }, color, viewport),
  ];
  encoder.triangles(vertices);
}

function paintCircle(encoder: FrameEncoder, r: Rect, fill: Color | undefined,
  gradient: LinearGradient | undefined,
  borderWidth: number, border: Color | undefined, viewport: Size): void {
  const segments = 32, radius = Math.min(r.width, r.height) / 2;
  if (radius <= 0) return;
  const center = { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  if (gradient || (fill && fill.alpha > 0)) {
    const vertices: Vertex[] = [];
    const vertex = (point: Point) => pointVertex(point,
      gradient ? gradientColor(point, r, gradient) : fill!, viewport);
    for (let index = 0; index < segments; index++) vertices.push(vertex(center),
      vertex(circlePoint(center, radius, index, segments)),
      vertex(circlePoint(center, radius, index + 1, segments)));
    encoder.triangles(vertices);
  }
  if (border && border.alpha > 0 && borderWidth > 0) {
    const inner = Math.max(0, radius - borderWidth), vertices: Vertex[] = [];
    for (let index = 0; index < segments; index++) {
      const outerA = circlePoint(center, radius, index, segments);
      const outerB = circlePoint(center, radius, index + 1, segments);
      const innerA = circlePoint(center, inner, index, segments);
      const innerB = circlePoint(center, inner, index + 1, segments);
      vertices.push(pointVertex(outerA, border, viewport), pointVertex(innerA, border, viewport),
        pointVertex(innerB, border, viewport), pointVertex(outerA, border, viewport),
        pointVertex(innerB, border, viewport), pointVertex(outerB, border, viewport));
    }
    encoder.triangles(vertices);
  }
}

function paintRoundedRect(encoder: FrameEncoder, r: Rect, requestedRadius: number,
  fill: Color | undefined, gradient: LinearGradient | undefined,
  requestedBorder: number, border: Color | undefined,
  viewport: Size): void {
  const points = 32, radius = Math.min(requestedRadius, r.width / 2, r.height / 2);
  if (radius <= 0) {
    if (gradient) encoder.triangles(gradientRectangleVertices(r, gradient, viewport));
    else if (fill && fill.alpha > 0) encoder.triangles(rectangleVertices(r, fill, viewport));
    paintBorder(encoder, r, requestedBorder, border, viewport);
    return;
  }
  const center = { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  if (gradient || (fill && fill.alpha > 0)) {
    const vertices: Vertex[] = [];
    const vertex = (point: Point) => pointVertex(point,
      gradient ? gradientColor(point, r, gradient) : fill!, viewport);
    for (let index = 0; index < points; index++) vertices.push(vertex(center),
      vertex(roundedPoint(r, radius, index)), vertex(roundedPoint(r, radius, index + 1)));
    encoder.triangles(vertices);
  }
  const width = Math.min(requestedBorder, r.width / 2, r.height / 2);
  if (border && border.alpha > 0 && width > 0) {
    const inner = { x: r.x + width, y: r.y + width,
      width: r.width - width * 2, height: r.height - width * 2 };
    const innerRadius = Math.max(0, radius - width), vertices: Vertex[] = [];
    for (let index = 0; index < points; index++) {
      const outerA = roundedPoint(r, radius, index), outerB = roundedPoint(r, radius, index + 1);
      const innerA = inner.width <= 0 || inner.height <= 0 ? center : roundedPoint(inner, innerRadius, index);
      const innerB = inner.width <= 0 || inner.height <= 0 ? center : roundedPoint(inner, innerRadius, index + 1);
      vertices.push(pointVertex(outerA, border, viewport), pointVertex(innerA, border, viewport),
        pointVertex(innerB, border, viewport), pointVertex(outerA, border, viewport),
        pointVertex(innerB, border, viewport), pointVertex(outerB, border, viewport));
    }
    encoder.triangles(vertices);
  }
}

function gradientColor(point: Point, bounds: Rect, gradient: LinearGradient): Color {
  const x = bounds.width <= 0 ? 0 : (point.x - bounds.x) / bounds.width;
  const y = bounds.height <= 0 ? 0 : (point.y - bounds.y) / bounds.height;
  const amount = clamp(gradient.direction === "vertical" ? y :
    gradient.direction === "diagonal" ? (x + y) / 2 : x, 0, 1);
  return {
    red: gradient.start.red + (gradient.end.red - gradient.start.red) * amount,
    green: gradient.start.green + (gradient.end.green - gradient.start.green) * amount,
    blue: gradient.start.blue + (gradient.end.blue - gradient.start.blue) * amount,
    alpha: gradient.start.alpha + (gradient.end.alpha - gradient.start.alpha) * amount,
  };
}

function roundedPoint(r: Rect, radius: number, rawIndex: number): Point {
  const perCorner = 8, index = rawIndex % (perCorner * 4), corner = Math.floor(index / perCorner);
  const segment = index % perCorner;
  const centers = [
    { x: r.x + radius, y: r.y + radius },
    { x: r.x + r.width - radius, y: r.y + radius },
    { x: r.x + r.width - radius, y: r.y + r.height - radius },
    { x: r.x + radius, y: r.y + r.height - radius },
  ];
  const angle = [Math.PI, Math.PI * 1.5, 0, Math.PI * 0.5][corner]! +
    segment / perCorner * Math.PI * 0.5;
  const center = centers[corner]!;
  return { x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius };
}

function circlePoint(center: Point, radius: number, index: number, segments: number): Point {
  const angle = index / segments * Math.PI * 2;
  return { x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius };
}

function pointVertex(point: Point, color: Color, viewport: Size): Vertex {
  return { x: point.x / viewport.width * 2 - 1, y: 1 - point.y / viewport.height * 2, color };
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
  const lines = value.split("\n"), lineHeight = style.lineHeight ?? fontSize * 1.2;
  if (style.fontFamily && style.fontFamily !== "pixel") {
    const family = style.fontFamily;
    lines.forEach((line, index) => {
      if (line.length === 0) return;
      encoder.systemText(line, bounds.x / viewport.width * 2 - 1,
        1 - (bounds.y + index * lineHeight) / viewport.height * 2,
        fontSize / viewport.height * 2, color, family);
    });
    return;
  }
  const vertices: Vertex[] = [];
  lines.forEach((line, lineIndex) => [...line.toUpperCase()]
    .forEach((character, characterIndex) => (glyphs[character] ?? fallback).forEach((bits, row) => {
      for (let column = 0; column < 5; column++) if (bits & (1 << (4 - column))) vertices.push(...rectangleVertices({
        x: bounds.x + characterIndex * cell * 6 + column * cell,
        y: bounds.y + lineIndex * lineHeight + row * cell, width: cell, height: cell,
      }, color, viewport));
    })));
  if (vertices.length) encoder.triangles(vertices);
}
