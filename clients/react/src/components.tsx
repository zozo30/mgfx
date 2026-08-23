import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Key, KeyModifier, type Color } from "@mgfx/demo-client/protocol";
import { nativeTextAdvance, type MeshData, type PathData, type Point, type Style,
  type RichTextSpan, type TextStyle } from "@mgfx/demo-client/ui";
import { useNativeClipboard, useNativeCursor } from "./native-window.js";
import { canonicalPath } from "./vector-path.js";
import { parseSvgVectorDocument } from "./svg-document.js";
import { useAnimationTime } from "./animation.js";

export interface LayoutProps {
  readonly children?: ReactNode;
  readonly style?: Style;
}

export const Box = ({ children, style }: LayoutProps) =>
  <mgfx-box style={style ?? {}}>{children}</mgfx-box>;
export const Row = ({ children, style }: LayoutProps) =>
  <mgfx-row style={style ?? {}}>{children}</mgfx-row>;
export const Column = ({ children, style }: LayoutProps) =>
  <mgfx-column style={style ?? {}}>{children}</mgfx-column>;
export const Stack = ({ children, style }: LayoutProps) =>
  <mgfx-stack style={style ?? {}}>{children}</mgfx-stack>;
export const Circle = ({ style }: { readonly style?: Style }) =>
  <mgfx-circle style={style ?? {}} />;
export const Image = ({ textureId, style, sourceWidth, sourceHeight, fit, sampling }: {
  readonly textureId: number; readonly style?: Style;
  readonly sourceWidth?: number; readonly sourceHeight?: number;
  readonly fit?: "fill" | "contain" | "cover";
  readonly sampling?: "linear" | "nearest";
}) => <mgfx-box style={{ ...style, backgroundImage: {
  textureId,
  ...(sourceWidth !== undefined && sourceHeight !== undefined
    ? { sourceSize: { width: sourceWidth, height: sourceHeight } } : {}),
  ...(fit ? { fit } : {}),
  ...(sampling ? { sampling } : {}),
} }} />;
export const Mesh = ({ data, style }: { readonly data: MeshData; readonly style?: Style }) =>
  <mgfx-mesh mesh={data} style={style ?? {}} />;

export function Path({ data, color, gradient, strokeColor, strokeGradient, strokeWidth = 0, viewBox, tolerance,
  fillRule, lineCap = "round", lineJoin = "round", dash, style }: {
  readonly data: string; readonly color?: Color;
  readonly gradient?: { readonly start: { readonly x: number; readonly y: number };
    readonly end: { readonly x: number; readonly y: number };
    readonly startColor: Color; readonly endColor: Color };
  readonly strokeColor?: Color;
  readonly strokeGradient?: { readonly start: { readonly x: number; readonly y: number };
    readonly end: { readonly x: number; readonly y: number };
    readonly startColor: Color; readonly endColor: Color };
  readonly strokeWidth?: number; readonly viewBox?: { x: number; y: number;
    width: number; height: number }; readonly tolerance?: number;
  readonly fillRule?: "nonzero" | "evenodd"; readonly lineCap?: "butt" | "round";
  readonly lineJoin?: "bevel" | "round"; readonly style?: Style;
  readonly dash?: { readonly length: number; readonly gap: number; readonly offset?: number };
}) {
  const resource = useMemo(() => canonicalPath(data), [data]);
  const path: PathData = { resourceId: resource.resourceId, segments: resource.segments,
    viewBox: viewBox ?? resource.bounds, fit: "contain",
    ...(color ? { fill: color } : {}), ...(gradient ? { fillGradient: gradient } : {}),
    ...(strokeGradient ? { strokeGradient } : {}),
    ...(strokeColor && strokeWidth > 0
      ? { stroke: strokeColor, strokeWidth } : {}),
    ...(tolerance !== undefined ? { tolerance } : {}), ...(fillRule ? { fillRule } : {}),
    ...(dash ? { dash } : {}), lineCap, lineJoin };
  return <mgfx-path path={path} style={style ?? {}} />;
}

export function Svg({ source, color, tolerance = 0.15, style }: {
  readonly source: string; readonly color?: Color; readonly tolerance?: number;
  readonly style?: Style;
}) {
  const currentColor = color ?? rgba(1, 1, 1);
  const document = useMemo(() => parseSvgVectorDocument(source, currentColor),
    [source, currentColor.red, currentColor.green, currentColor.blue, currentColor.alpha]);
  return <Stack style={style ?? {}}>{document.layers.map((layer, index) =>
    <Path key={`svg-layer-${index}`} data={layer.path} viewBox={document.viewBox}
      {...(layer.fill ? { color: layer.fill } : {})}
      {...(layer.fillGradient ? { gradient: layer.fillGradient } : {})}
      {...(layer.stroke ? { strokeColor: layer.stroke, strokeWidth: layer.strokeWidth } : {})}
      {...(layer.strokeGradient
        ? { strokeGradient: layer.strokeGradient, strokeWidth: layer.strokeWidth } : {})}
      {...(layer.dash ? { dash: layer.dash } : {})}
      fillRule={layer.fillRule} lineCap={layer.lineCap} lineJoin={layer.lineJoin}
      tolerance={tolerance} style={{ position: "absolute", inset: all(0) }} />)}
  </Stack>;
}

export function Text({ value, style }: {
  readonly value: string;
  readonly style?: TextStyle;
}) {
  return <mgfx-text value={value} textStyle={{ fontFamily: "system", fontSize: 22, ...style }} />;
}

export function RichText({ spans, style }: {
  readonly spans: readonly RichTextSpan[];
  readonly style?: TextStyle;
}) {
  return <mgfx-rich-text richTextSpans={spans}
    textStyle={{ fontFamily: "system", fontSize: 22, ...style }} />;
}

export interface ButtonProps {
  readonly label: string;
  readonly onPress: () => void;
  readonly style?: Style;
  readonly textStyle?: TextStyle;
  readonly background?: Color;
  readonly activeBackground?: Color;
  readonly active?: boolean;
  readonly disabled?: boolean;
}

export function Button({ label, onPress, style = {}, textStyle, background = rgba(0.22, 0.45, 0.95),
  activeBackground, active = false, disabled = false }: ButtonProps) {
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [focused, setFocused] = useState(false);
  useNativeCursor("pointer", hovered && !disabled);
  let color = active && activeBackground ? activeBackground : background;
  if (focused) color = scale(color, 1.05);
  if (hovered && !disabled) color = scale(color, 1.12);
  if (pressed && !disabled) color = scale(color, 0.78);
  if (disabled) color = scale(color, 0.55);
  const handlers = disabled ? {} : {
    onClick: onPress, onHoverChange: setHovered, onPressChange: setPressed,
    onFocusChange: setFocused,
  };
  return (
    <mgfx-stack {...handlers} style={{ preferredSize: { height: 48 }, padding: all(12),
      cornerRadius: 10, clip: true, ...style, background: color }}>
      <Text value={label} style={{ fontWeight: "bold", ...textStyle }} />
    </mgfx-stack>
  );
}

export interface TextFieldProps {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly placeholder?: string;
  readonly maxLength?: number;
  readonly style?: Style;
  readonly textStyle?: TextStyle;
}

export function TextField({ value, onChange, placeholder = "", maxLength = 256,
  style = {}, textStyle }: TextFieldProps) {
  const [focused, setFocused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [caret, setCaret] = useState([...value].length);
  const [anchor, setAnchor] = useState([...value].length);
  const [dragging, setDragging] = useState(false);
  const [blinkEpoch, setBlinkEpoch] = useState(0);
  const clipboard = useNativeClipboard();
  const animationTime = useAnimationTime(focused);
  useNativeCursor("text", hovered);
  const characters = [...value];
  useEffect(() => {
    setCaret((index) => Math.min(index, characters.length));
    setAnchor((index) => Math.min(index, characters.length));
  }, [value]);
  const displayed = value || placeholder;
  const color = value ? textStyle?.color ?? rgba(1, 1, 1) : rgba(0.55, 0.60, 0.70);
  const selectionStart = Math.min(anchor, caret);
  const selectionEnd = Math.max(anchor, caret);
  const hasSelection = selectionStart !== selectionEnd;
  const caretVisible = !focused || (animationTime - blinkEpoch) % 1000 < 600;
  const wakeCaret = () => setBlinkEpoch(animationTime);
  const fontSize = textStyle?.fontSize ?? 22;
  const fontFamily = textStyle?.fontFamily ?? "system";
  const fontWeight = textStyle?.fontWeight ?? "regular";
  const fontStyle = textStyle?.fontStyle ?? "regular";
  const letterSpacing = (textStyle?.letterSpacing ?? 0) / fontSize;
  const fontResourceId = textStyle?.fontResourceId ?? 0;
  const paddingLeft = style.padding?.left ?? 12;
  const characterWidth = (character: string) => {
    if (fontFamily !== "pixel") {
      return (nativeTextAdvance(
        fontFamily, character, fontWeight, fontStyle, letterSpacing, fontResourceId) ??
        (fontFamily === "monospace" ? 0.60 : 0.56) + letterSpacing) * fontSize;
    }
    return fontSize * 6 / 7;
  };
  const indexAt = (point: Point) => {
    const x = Math.max(0, point.x - paddingLeft);
    let position = 0;
    for (let index = 0; index < characters.length; index++) {
      const width = characterWidth(characters[index]!);
      if (x < position + width / 2) return index;
      position += width;
    }
    return characters.length;
  };
  const insert = (text: string) => {
    const incoming = [...text];
    const available = Math.max(0, maxLength - (characters.length - (selectionEnd - selectionStart)));
    const accepted = incoming.slice(0, available);
    if (accepted.length === 0) return;
    const next = selectionStart + accepted.length;
    onChange([...characters.slice(0, selectionStart), ...accepted,
      ...characters.slice(selectionEnd)].join(""));
    setCaret(next);
    setAnchor(next);
    wakeCaret();
  };
  const caretNode = <Box style={{ preferredSize: { width: 2, height: fontSize },
    background: caretVisible ? rgba(0.60, 0.82, 1) : rgba(0.60, 0.82, 1, 0) }} />;
  return (
    <mgfx-stack style={{ preferredSize: { height: 48 }, padding: all(12), cornerRadius: 10,
      clip: true, background: focused ? rgba(0.16, 0.28, 0.52) : rgba(0.12, 0.14, 0.21),
      borderWidth: focused ? 2 : 1,
      borderColor: focused ? rgba(0.38, 0.62, 1) : rgba(0.24, 0.28, 0.38), ...style }}
      onHoverChange={setHovered}
      onFocusChange={(next) => { setFocused(next); if (next) {
        setCaret(characters.length); setAnchor(characters.length); wakeCaret();
      } }}
      onPointerDown={(point) => {
        const index = indexAt(point); setCaret(index); setAnchor(index); setDragging(true); wakeCaret();
      }}
      onPointerMove={(point) => { if (dragging) setCaret(indexAt(point)); }}
      onPointerUp={() => setDragging(false)}
      onTextInput={insert}
      onKeyDown={(key, modifiers) => {
        const extending = (modifiers & KeyModifier.Shift) !== 0;
        wakeCaret();
        if (key === Key.Backspace && hasSelection) {
          onChange([...characters.slice(0, selectionStart), ...characters.slice(selectionEnd)].join(""));
          setCaret(selectionStart); setAnchor(selectionStart);
        } else if (key === Key.Backspace && caret > 0) {
          onChange([...characters.slice(0, caret - 1), ...characters.slice(caret)].join(""));
          setCaret(caret - 1); setAnchor(caret - 1);
        } else if (key === Key.ArrowLeft) {
          const next = !extending && hasSelection ? selectionStart : Math.max(0, caret - 1);
          setCaret(next); if (!extending) setAnchor(next);
        } else if (key === Key.ArrowRight) {
          const next = !extending && hasSelection ? selectionEnd : Math.min(characters.length, caret + 1);
          setCaret(next); if (!extending) setAnchor(next);
        } else if (key === Key.SelectAll) {
          setAnchor(0); setCaret(characters.length);
        } else if (key === Key.Copy) {
          clipboard.writeClipboard(hasSelection
            ? characters.slice(selectionStart, selectionEnd).join("") : value);
        } else if (key === Key.Cut) {
          clipboard.writeClipboard(hasSelection
            ? characters.slice(selectionStart, selectionEnd).join("") : value);
          if (hasSelection) {
            onChange([...characters.slice(0, selectionStart),
              ...characters.slice(selectionEnd)].join(""));
            setCaret(selectionStart); setAnchor(selectionStart);
          } else {
            onChange(""); setCaret(0); setAnchor(0);
          }
        } else if (key === Key.Paste) {
          void clipboard.readClipboard().then(insert);
        }
      }}>
      {focused ? <Row style={{ gap: 0, crossAxisAlignment: "center" }}>
        <Text value={characters.slice(0, selectionStart).join("")}
          style={{ ...textStyle, color: textStyle?.color ?? rgba(1, 1, 1) }} />
        {hasSelection && caret === selectionStart ? caretNode : null}
        {hasSelection ? <Box style={{ background: rgba(0.20, 0.46, 0.88) }}>
          <Text value={characters.slice(selectionStart, selectionEnd).join("")}
            style={{ ...textStyle, color: textStyle?.color ?? rgba(1, 1, 1) }} />
        </Box> : caretNode}
        {hasSelection && caret === selectionEnd ? caretNode : null}
        <Text value={characters.length === 0 ? placeholder : characters.slice(selectionEnd).join("")}
          style={{ ...textStyle, color: characters.length === 0
            ? rgba(0.55, 0.60, 0.70) : textStyle?.color ?? rgba(1, 1, 1) }} />
      </Row> : <Text value={displayed} style={{ ...textStyle, color }} />}
    </mgfx-stack>
  );
}

export const all = (value: number) =>
  ({ top: value, right: value, bottom: value, left: value });
export const rgba = (red: number, green: number, blue: number, alpha = 1): Color =>
  ({ red, green, blue, alpha });

function scale(color: Color, amount: number): Color {
  return { red: Math.min(1, color.red * amount), green: Math.min(1, color.green * amount),
    blue: Math.min(1, color.blue * amount), alpha: color.alpha };
}
