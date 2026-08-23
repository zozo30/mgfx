import { FrameEncoder, Key, KeyModifier, type Color, type KeyEvent, type ScrollEvent } from "./protocol.js";
import { circle, clickable, column, Component, ComponentHost, focusable, row, scrollView, stack, text,
  type Element, type Point, type Size, type TextStyle } from "./ui.js";

const rgba = (red: number, green: number, blue: number, alpha = 1): Color => ({ red, green, blue, alpha });

class DemoComponent extends Component {
  private selected = -1;
  private hovered = -1;
  private pressed = -1;
  private focused = -1;
  private listOffset = 0;
  private selectedItem = -1;
  private input = "";
  private inputFocused = false;
  build(): Element {
    const cardText: TextStyle = { fontSize: 18, color: rgba(0.04, 0.05, 0.08) };
    return column([
      row([text("MGFX TYPESCRIPT", { fontSize: 24 }), this.dotGrid()], {
        preferredSize: { height: 68 }, padding: { top: 8, right: 8, bottom: 8, left: 16 },
        background: rgba(0.18, 0.42, 0.95),
        cornerRadius: 14,
        mainAxisAlignment: "spaceBetween", crossAxisAlignment: "center",
      }, "header"),
      row([
        this.card("ONE", 0, rgba(0.95, 0.24, 0.2), rgba(1, 0.52, 0.2), cardText, "red"),
        this.card("TWO", 1, rgba(0.16, 0.78, 0.42), rgba(0.45, 1, 0.58), cardText, "green"),
        this.card("THREE", 2, rgba(0.24, 0.48, 1), rgba(0.48, 0.72, 1), cardText, "blue"),
      ], { gap: 16, crossAxisAlignment: "stretch" }, "cards"),
      scrollView(column(Array.from({ length: 7 }, (_, index) => this.listItem(index)), {
        gap: 6, crossAxisAlignment: "stretch",
      }, "list-content"), this.listOffset, {
        preferredSize: { height: 126 }, padding: { top: 6, right: 6, bottom: 6, left: 6 },
        background: rgba(0.08, 0.10, 0.16),
        cornerRadius: 12, borderWidth: 1, borderColor: rgba(0.22, 0.26, 0.38),
      }, "list-scroll", (_deltaX, deltaY) => {
        const next = Math.max(0, Math.min(188, this.listOffset + deltaY));
        if (next !== this.listOffset) { this.listOffset = next; this.invalidate(); }
      }),
      focusable(stack([text(this.input || "TYPE HERE", {
        fontSize: 16, color: this.input ? rgba(1, 1, 1) : rgba(0.55, 0.60, 0.70),
      })], {
        preferredSize: { height: 48 }, padding: { top: 15, right: 14, bottom: 15, left: 14 },
        background: this.inputFocused ? rgba(0.16, 0.28, 0.52) : rgba(0.12, 0.14, 0.21),
        borderWidth: this.inputFocused ? 2 : 1,
        borderColor: this.inputFocused ? rgba(0.38, 0.62, 1) : rgba(0.24, 0.28, 0.38),
        cornerRadius: 10, clip: true,
      }, "text-field"), {
        onFocusChange: (focused) => {
          if (this.inputFocused !== focused) { this.inputFocused = focused; this.invalidate(); }
        },
        onKeyDown: (key) => {
          if (key === Key.Backspace && this.input.length > 0) {
            this.input = [...this.input].slice(0, -1).join("");
            this.invalidate();
          }
        },
        onTextInput: (value) => {
          const next = [...this.input, ...value].slice(0, 28).join("");
          if (next !== this.input) { this.input = next; this.invalidate(); }
        },
      }),
      stack([text("CLICK A CARD", { fontSize: 14 })], {
        preferredSize: { height: 42 }, padding: { top: 12, right: 12, bottom: 12, left: 12 },
        background: rgba(0.42, 0.45, 0.52),
        cornerRadius: 10,
      }, "footer"),
    ], { padding: { top: 48, right: 48, bottom: 48, left: 48 }, gap: 22,
      crossAxisAlignment: "stretch" }, "page");
  }
  private dotGrid(): Element {
    const ink = rgba(0.55, 0.86, 0.68);
    const pattern = [false, true, false, true, false, false, true, false,
      true, false, false, false, false, true, false, true];
    const rows = Array.from({ length: 4 }, (_, rowIndex) => row(
      Array.from({ length: 4 }, (_, columnIndex) => {
        const filled = pattern[rowIndex * 4 + columnIndex]!;
        return circle({ preferredSize: { width: 8, height: 8 },
          background: filled ? ink : rgba(0, 0, 0, 0), borderWidth: filled ? 0 : 2,
          borderColor: ink }, `dot-${rowIndex}-${columnIndex}`);
      }), { mainAxisAlignment: "spaceBetween", crossAxisAlignment: "center" }, `dot-row-${rowIndex}`));
    return column(rows, {
      preferredSize: { width: 52, height: 52 }, padding: { top: 5, right: 5, bottom: 5, left: 5 },
      gap: 3, background: rgba(0.04, 0.12, 0.09), borderWidth: 3, borderColor: ink,
      mainAxisAlignment: "center", crossAxisAlignment: "stretch", clip: true,
    }, "dot-grid");
  }
  private listItem(index: number): Element {
    const labels = ["ITEM ONE", "ITEM TWO", "ITEM THREE", "ITEM FOUR", "ITEM FIVE", "ITEM SIX", "ITEM SEVEN"];
    const background = this.selectedItem === index ? rgba(0.35, 0.58, 1) : rgba(0.16, 0.19, 0.28);
    return clickable(stack([text(labels[index]!, { fontSize: 14 })], {
      preferredSize: { height: 38 }, padding: { top: 12, right: 12, bottom: 12, left: 12 },
      background, cornerRadius: 8, clip: true,
    }, `item-${index}`), () => {
      if (this.selectedItem !== index) { this.selectedItem = index; this.invalidate(); }
    });
  }
  private card(label: string, index: number, normal: Color, selected: Color,
               textStyle: TextStyle, key: string): Element {
    let background = this.selected === index ? selected : normal;
    if (this.focused === index) background = scale(background, 1.06);
    if (this.hovered === index) background = scale(background, 1.12);
    if (this.pressed === index) background = scale(background, 0.78);
    return clickable(stack([text(label, textStyle)], {
      preferredSize: { width: 128, height: 128 },
      padding: { top: 18, right: 18, bottom: 18, left: 18 },
      background, flexGrow: 1, cornerRadius: 14, clip: true,
    }, key), () => {
      if (this.selected !== index) { this.selected = index; this.invalidate(); }
    }, (hovered) => {
      const next = hovered ? index : -1;
      if (this.hovered !== next) { this.hovered = next; this.invalidate(); }
    }, (pressed) => {
      const next = pressed ? index : -1;
      if (this.pressed !== next) { this.pressed = next; this.invalidate(); }
    }, (focused) => {
      const next = focused ? index : -1;
      if (this.focused !== next) { this.focused = next; this.invalidate(); }
    });
  }
}

export type { Point, Size } from "./ui.js";

export class TypeScriptDemo {
  private readonly host = new ComponentHost();
  constructor() { this.host.rebuild(new DemoComponent()); }
  pointerDown(point: Point): boolean {
    this.host.pointerDown(point);
    return this.host.needsRebuild();
  }
  pointerMove(point: Point): boolean {
    this.host.pointerMove(point);
    return this.host.needsRebuild();
  }
  pointerUp(point: Point): boolean {
    this.host.pointerUp(point);
    return this.host.needsRebuild();
  }
  keyDown(event: KeyEvent): boolean {
    this.host.keyDown(event.key, (event.modifiers & KeyModifier.Shift) !== 0, event.repeat,
      event.modifiers);
    return this.host.needsRebuild();
  }
  keyUp(event: KeyEvent): boolean {
    this.host.keyUp(event.key);
    return this.host.needsRebuild();
  }
  scroll(event: ScrollEvent): boolean {
    this.host.scroll({ x: event.x, y: event.y }, event.deltaX, event.deltaY);
    return this.host.needsRebuild();
  }
  textInput(value: string): boolean {
    this.host.textInput(value);
    return this.host.needsRebuild();
  }
  frame(viewport: Size): Buffer {
    this.host.layout(viewport);
    const encoder = new FrameEncoder();
    encoder.clear(rgba(0.025, 0.035, 0.055));
    this.host.paint(encoder, viewport);
    encoder.endFrame();
    return encoder.finish();
  }
}

function scale(color: Color, amount: number): Color {
  return { red: Math.min(1, color.red * amount), green: Math.min(1, color.green * amount),
    blue: Math.min(1, color.blue * amount), alpha: color.alpha };
}
