import { createContext, createElement, type ReactNode } from "react";
import ReactReconciler from "react-reconciler";
import { ConcurrentRoot, DefaultEventPriority } from "react-reconciler/constants.js";
import { FrameEncoder, type FontFamily, type FontStyle, type FontWeight, type Key, type KeyEvent,
  type MeshUploadVertex, type PathSegment, type ScrollEvent } from "@mgfx/demo-client/protocol";
import {
  box, cacheNativeTextAdvance, circle, clickable, column, Component, ComponentHost, focusable,
  nativeTextAdvance, nativeTextMetricRuns, row, scrollView, stack, text,
  type Element, type Point, type Size, type Style, type TextStyle,
  mesh, path as vectorPath, type MeshData, type PathData,
} from "@mgfx/demo-client/ui";
import { NativeWindowProvider, type NativeWindowCommands } from "./native-window.js";

export type HostType = "mgfx-box" | "mgfx-row" | "mgfx-column" | "mgfx-stack" |
  "mgfx-circle" | "mgfx-text" | "mgfx-scroll" | "mgfx-mesh" | "mgfx-path";

export interface HostProps {
  readonly children?: ReactNode; readonly style?: Style; readonly value?: string;
  readonly textStyle?: TextStyle; readonly offsetY?: number; readonly onClick?: () => void;
  readonly onHoverChange?: (value: boolean) => void; readonly onPressChange?: (value: boolean) => void;
  readonly onFocusChange?: (value: boolean) => void; readonly onScroll?: (x: number, y: number) => void;
  readonly onPointerDown?: (point: Point) => void; readonly onPointerMove?: (point: Point) => void;
  readonly onPointerUp?: (point: Point) => void;
  readonly onKeyDown?: (key: Key, modifiers: number) => void;
  readonly onTextInput?: (value: string) => void;
  readonly mesh?: MeshData;
  readonly path?: PathData;
}

interface HostNode { kind: "host"; id: number; type: HostType; props: HostProps; children: HostChild[]; hidden: boolean }
interface TextNode { kind: "text"; id: number; value: string; hidden: boolean }
type HostChild = HostNode | TextNode;

interface Container {
  children: HostChild[];
  surface: ReactSurface;
}

let nextId = 1;
let currentPriority = DefaultEventPriority;
const transitionContext = createContext<null>(null);

function append(children: HostChild[], child: HostChild): void {
  const existing = children.indexOf(child);
  if (existing >= 0) children.splice(existing, 1);
  children.push(child);
}

function insert(children: HostChild[], child: HostChild, before: HostChild): void {
  const existing = children.indexOf(child);
  if (existing >= 0) children.splice(existing, 1);
  const index = children.indexOf(before);
  children.splice(index < 0 ? children.length : index, 0, child);
}

const hostConfig = {
  supportsMutation: true, supportsPersistence: false, supportsHydration: false,
  isPrimaryRenderer: false, warnsIfNotActing: false,
  getRootHostContext: () => ({}),
  getChildHostContext: (context: object) => context,
  getPublicInstance: (instance: HostChild) => instance,
  prepareForCommit: () => null,
  resetAfterCommit: (container: Container) => container.surface.commit(),
  preparePortalMount: () => {},
  createInstance: (type: HostType, props: HostProps): HostNode =>
    ({ kind: "host", id: nextId++, type, props, children: [], hidden: false }),
  createTextInstance: (value: string): TextNode =>
    ({ kind: "text", id: nextId++, value, hidden: false }),
  appendInitialChild: (parent: HostNode, child: HostChild) => append(parent.children, child),
  finalizeInitialChildren: () => false,
  shouldSetTextContent: () => false,
  appendChild: (parent: HostNode, child: HostChild) => append(parent.children, child),
  appendChildToContainer: (container: Container, child: HostChild) => append(container.children, child),
  insertBefore: (parent: HostNode, child: HostChild, before: HostChild) => insert(parent.children, child, before),
  insertInContainerBefore: (container: Container, child: HostChild, before: HostChild) =>
    insert(container.children, child, before),
  removeChild: (parent: HostNode, child: HostChild) => {
    const index = parent.children.indexOf(child); if (index >= 0) parent.children.splice(index, 1);
  },
  removeChildFromContainer: (container: Container, child: HostChild) => {
    const index = container.children.indexOf(child); if (index >= 0) container.children.splice(index, 1);
  },
  clearContainer: (container: Container) => { container.children = []; },
  commitUpdate: (instance: HostNode, _type: HostType, _old: HostProps, props: HostProps) => {
    instance.props = props;
  },
  commitTextUpdate: (instance: TextNode, _old: string, value: string) => { instance.value = value; },
  hideInstance: (instance: HostNode) => { instance.hidden = true; },
  unhideInstance: (instance: HostNode) => { instance.hidden = false; },
  hideTextInstance: (instance: TextNode) => { instance.hidden = true; },
  unhideTextInstance: (instance: TextNode) => { instance.hidden = false; },
  scheduleTimeout: setTimeout,
  cancelTimeout: clearTimeout,
  noTimeout: -1,
  supportsMicrotasks: true,
  scheduleMicrotask: queueMicrotask,
  getInstanceFromNode: () => null,
  beforeActiveInstanceBlur: () => {}, afterActiveInstanceBlur: () => {},
  prepareScopeUpdate: () => {}, getInstanceFromScope: () => null, detachDeletedInstance: () => {},
  NotPendingTransition: null,
  HostTransitionContext: transitionContext,
  setCurrentUpdatePriority: (priority: number) => { currentPriority = priority; },
  getCurrentUpdatePriority: () => currentPriority,
  resolveUpdatePriority: () => currentPriority || DefaultEventPriority,
  resetFormInstance: () => {},
  requestPostPaintCallback: (callback: (time: number) => void) => setTimeout(() => callback(performance.now()), 0),
  shouldAttemptEagerTransition: () => false,
  trackSchedulerEvent: () => {}, resolveEventType: () => null,
  resolveEventTimeStamp: () => performance.now(),
  maySuspendCommit: () => false, preloadInstance: () => true,
  startSuspendingCommit: () => {}, suspendInstance: () => {}, waitForCommitToBeReady: () => null,
};

type Config = ReactReconciler.HostConfig<HostType, HostProps, Container, HostNode, TextNode,
  never, never, never, HostChild, object, never, ReturnType<typeof setTimeout>, number, null>;
const reconciler = ReactReconciler(hostConfig as unknown as Config);

class SnapshotComponent extends Component {
  constructor(private readonly container: Container) { super(); }
  build(): Element {
    const children = this.container.children.flatMap((child) => toElement(child));
    return children.length === 1 ? children[0]! : column(children,
      { crossAxisAlignment: "stretch" }, "react-root");
  }
}

function toElement(child: HostChild): Element[] {
  if (child.hidden) return [];
  if (child.kind === "text") return [text(child.value, {}, `react-text-${child.id}`)];
  const key = `react-${child.id}`;
  const children = child.children.flatMap((value) => toElement(value));
  const style = child.props.style ?? {};
  let element: Element;
  switch (child.type) {
  case "mgfx-row": element = row(children, style, key); break;
  case "mgfx-column": element = column(children, style, key); break;
  case "mgfx-stack": element = stack(children, style, key); break;
  case "mgfx-circle": element = circle(style, key); break;
  case "mgfx-mesh": element = child.props.mesh ? mesh(child.props.mesh, style, key) : box(style, key); break;
  case "mgfx-path": element = child.props.path ? vectorPath(child.props.path, style, key) : box(style, key); break;
  case "mgfx-text": {
    const raw = child.children.filter((value): value is TextNode => value.kind === "text")
      .map((value) => value.value).join("");
    element = text(child.props.value ?? raw, child.props.textStyle ?? {}, key);
    break;
  }
  case "mgfx-scroll": element = scrollView(children[0] ?? box(), child.props.offsetY ?? 0,
    style, key, child.props.onScroll); break;
  default: element = children.length === 0 ? box(style, key) : stack(children, style, key);
  }
  if (child.props.onClick || child.props.onHoverChange || child.props.onPressChange) {
    element = clickable(element, child.props.onClick ?? (() => {}), child.props.onHoverChange,
      child.props.onPressChange, child.props.onFocusChange);
  }
  if (child.props.onTextInput || child.props.onKeyDown ||
      (child.props.onFocusChange && !child.props.onClick) || child.props.onPointerDown) {
    element = focusable(element, {
      ...(child.props.onFocusChange ? { onFocusChange: child.props.onFocusChange } : {}),
      ...(child.props.onKeyDown ? { onKeyDown: child.props.onKeyDown } : {}),
      ...(child.props.onTextInput ? { onTextInput: child.props.onTextInput } : {}),
    });
  }
  if (child.props.onPointerDown || child.props.onPointerMove || child.props.onPointerUp) {
    element = { ...element,
      ...(child.props.onPointerDown ? { onPointerDown: child.props.onPointerDown } : {}),
      ...(child.props.onPointerMove ? { onPointerMove: child.props.onPointerMove } : {}),
      ...(child.props.onPointerUp ? { onPointerUp: child.props.onPointerUp } : {}),
    };
  }
  return [element];
}

export class ReactSurface {
  private readonly container: Container;
  private readonly root: ReturnType<typeof reconciler.createContainer>;
  private readonly host = new ComponentHost();
  private readonly snapshot: SnapshotComponent;
  private viewport: Size = { width: 0, height: 0 };
  private readonly uploadedPaths = new Set<number>();
  private readonly uploadedMeshes = new Set<number>();
  private readonly requestedTextMetrics = new Set<string>();
  private metricRelayoutScheduled = false;

  constructor(private readonly onFrame: (frame: Buffer) => void,
              private readonly windowCommands?: NativeWindowCommands,
              private readonly resourceCommands?: {
                readonly createPath: (id: number, segments: readonly PathSegment[]) => void;
                readonly createMesh?: (id: number, vertices: readonly MeshUploadVertex[],
                  indices: readonly number[]) => void;
                readonly measureText?: (family: FontFamily, text: string,
                  weight?: FontWeight, style?: FontStyle, letterSpacing?: number) => Promise<number>;
              }) {
    this.container = { children: [], surface: this };
    this.snapshot = new SnapshotComponent(this.container);
    const report = (error: Error) => { throw error; };
    this.root = reconciler.createContainer(this.container, ConcurrentRoot, null, false, null,
      "mgfx-", report, report, report, () => {});
  }

  render(node: ReactNode): void {
    const rendered = this.windowCommands
      ? createElement(NativeWindowProvider, { commands: this.windowCommands }, node)
      : node;
    reconciler.updateContainerSync(rendered, this.root, null);
    reconciler.flushSyncWork();
  }
  resize(viewport: Size): void { this.viewport = viewport; this.submit(); }
  pointerMove(point: Point): void { reconciler.flushSyncFromReconciler(() => this.host.pointerMove(point)); }
  pointerDown(point: Point): void { reconciler.flushSyncFromReconciler(() => this.host.pointerDown(point)); }
  pointerUp(point: Point): void { reconciler.flushSyncFromReconciler(() => this.host.pointerUp(point)); }
  keyDown(event: KeyEvent): void {
    reconciler.flushSyncFromReconciler(() => this.host.keyDown(event.key,
      (event.modifiers & 1) !== 0, event.repeat, event.modifiers));
  }
  keyUp(event: KeyEvent): void { reconciler.flushSyncFromReconciler(() => this.host.keyUp(event.key)); }
  scroll(event: ScrollEvent): void {
    reconciler.flushSyncFromReconciler(() => this.host.scroll({ x: event.x, y: event.y }, event.deltaX, event.deltaY));
  }
  textInput(value: string): void { reconciler.flushSyncFromReconciler(() => this.host.textInput(value)); }

  commit(): void { this.submit(); }
  private submit(): void {
    if (this.viewport.width <= 0 || this.viewport.height <= 0 || this.container.children.length === 0) return;
    this.uploadPaths(this.container.children);
    this.uploadMeshes(this.container.children);
    this.requestMetrics(this.container.children);
    this.host.rebuild(this.snapshot);
    this.host.layout(this.viewport);
    const encoder = new FrameEncoder();
    encoder.clear({ red: 0.025, green: 0.035, blue: 0.055, alpha: 1 });
    this.host.paint(encoder, this.viewport);
    encoder.endFrame();
    this.onFrame(encoder.finish());
  }
  private uploadPaths(children: readonly HostChild[]): void {
    for (const child of children) {
      if (child.kind !== "host") continue;
      const path = child.props.path;
      if (path && !this.uploadedPaths.has(path.resourceId)) {
        this.resourceCommands?.createPath(path.resourceId, path.segments);
        this.uploadedPaths.add(path.resourceId);
      }
      this.uploadPaths(child.children);
    }
  }
  private uploadMeshes(children: readonly HostChild[]): void {
    for (const child of children) {
      if (child.kind !== "host") continue;
      const mesh = child.props.mesh;
      if (mesh && !this.uploadedMeshes.has(mesh.resourceId)) {
        const vertices = mesh.positions.map((position, index) => ({ position,
          color: mesh.colors?.[index] ?? mesh.color }));
        this.resourceCommands?.createMesh?.(mesh.resourceId, vertices, mesh.indices);
        this.uploadedMeshes.add(mesh.resourceId);
      }
      this.uploadMeshes(child.children);
    }
  }
  private requestMetrics(children: readonly HostChild[]): void {
    for (const child of children) {
      if (child.kind !== "host") continue;
      if (child.type === "mgfx-text") {
        const family = child.props.textStyle?.fontFamily;
        const weight = child.props.textStyle?.fontWeight ?? "regular";
        const style = child.props.textStyle?.fontStyle ?? "regular";
        const fontSize = child.props.textStyle?.fontSize ?? 16;
        const letterSpacing = (child.props.textStyle?.letterSpacing ?? 0) / fontSize;
        const value = child.props.value ?? child.children
          .filter((item): item is TextNode => item.kind === "text").map((item) => item.value).join("");
        if (family && family !== "pixel") {
          for (const run of nativeTextMetricRuns(value, child.props.textStyle ?? {})) {
            if (nativeTextAdvance(family, run, weight, style, letterSpacing) !== undefined) continue;
            const key = `${family}\0${weight}\0${style}\0${letterSpacing}\0${run}`;
            if (!this.requestedTextMetrics.has(key) && this.resourceCommands?.measureText) {
              this.requestedTextMetrics.add(key);
              void this.resourceCommands.measureText(
                family, run, weight, style, letterSpacing).then((advance) => {
                cacheNativeTextAdvance(family, run, advance, weight, style, letterSpacing);
                if (!this.metricRelayoutScheduled) {
                  this.metricRelayoutScheduled = true;
                  queueMicrotask(() => {
                    this.metricRelayoutScheduled = false;
                    this.submit();
                  });
                }
              }).catch(() => {});
            }
          }
        }
      }
      this.requestMetrics(child.children);
    }
  }
}
