import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Key, KeyModifier, type Color,
  type PathConicGradientPaint, type PathRadialGradientPaint,
  type PathTexturePaint } from "@mgfx/demo-client/protocol";
import { nativeTextAdvance, type Insets, type MeshData, type PathData, type Point, type Rect, type Style,
  type RichTextSpan, type TextStyle } from "@mgfx/demo-client/ui";
import { useNativeClipboard, useNativeCursor } from "./native-window.js";
import { canonicalPath } from "./vector-path.js";
import { parseSvgVectorDocument, type SvgVectorLayer } from "./svg-document.js";
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
export function Scroll({ children, style }: LayoutProps) {
  const [offsetY, setOffsetY] = useState(0);
  return <mgfx-scroll offsetY={offsetY}
    onScroll={(_deltaX, deltaY) => setOffsetY((current) => Math.max(0, current + deltaY))}
    style={style ?? {}}>{children}</mgfx-scroll>;
}
export const Circle = ({ style }: { readonly style?: Style }) =>
  <mgfx-circle style={style ?? {}} />;
export const Image = ({ textureId, style, sourceWidth, sourceHeight, fit, alignX, alignY, sampling,
  sourceRect, tileWidth, tileHeight, tileOffsetX, tileOffsetY, repeatX, repeatY, nineSlice,
  effects }: {
  readonly textureId: number; readonly style?: Style;
  readonly sourceWidth?: number; readonly sourceHeight?: number;
  readonly fit?: "fill" | "contain" | "cover";
  readonly sourceRect?: Rect;
  readonly alignX?: "start" | "center" | "end";
  readonly alignY?: "start" | "center" | "end";
  readonly sampling?: "linear" | "nearest";
  readonly tileWidth?: number; readonly tileHeight?: number;
  readonly tileOffsetX?: number; readonly tileOffsetY?: number;
  readonly repeatX?: boolean; readonly repeatY?: boolean;
  readonly nineSlice?: { readonly source: Insets; readonly destination?: Insets };
  readonly effects?: { readonly saturation?: number; readonly contrast?: number;
    readonly brightness?: number; readonly hueRotation?: number; readonly blur?: number };
}) => <mgfx-box style={{ ...style, backgroundImage: {
  textureId,
  ...(sourceWidth !== undefined && sourceHeight !== undefined
    ? { sourceSize: { width: sourceWidth, height: sourceHeight } } : {}),
  ...(fit ? { fit } : {}),
  ...(sourceRect ? { sourceRect } : {}),
  ...(alignX ? { alignX } : {}),
  ...(alignY ? { alignY } : {}),
  ...(sampling ? { sampling } : {}),
  ...(tileWidth !== undefined && tileHeight !== undefined
    ? { tileSize: { width: tileWidth, height: tileHeight } } : {}),
  ...(tileOffsetX !== undefined ? { tileOffsetX } : {}),
  ...(tileOffsetY !== undefined ? { tileOffsetY } : {}),
  ...(repeatX !== undefined ? { repeatX } : {}),
  ...(repeatY !== undefined ? { repeatY } : {}),
  ...(nineSlice ? { nineSlice } : {}),
  ...(effects ? { effects } : {}),
} }} />;
export const Mesh = ({ data, style }: { readonly data: MeshData; readonly style?: Style }) =>
  <mgfx-mesh mesh={data} style={style ?? {}} />;

export function Path({ data, color, gradient, radialGradient, conicGradient, texture, strokeColor,
  strokeGradient, strokeRadialGradient, strokeConicGradient, strokeTexture,
  strokeWidth = 0, viewBox, tolerance,
  sourceClip, fillRule, lineCap = "round", lineJoin = "round", miterLimit, dash, style }: {
  readonly data: string; readonly color?: Color;
  readonly gradient?: { readonly start: { readonly x: number; readonly y: number };
    readonly end: { readonly x: number; readonly y: number };
    readonly startColor: Color; readonly endColor: Color;
    readonly stops?: readonly { readonly offset: number; readonly color: Color }[];
    readonly spread?: "pad" | "repeat" | "reflect" };
  readonly radialGradient?: PathRadialGradientPaint;
  readonly conicGradient?: PathConicGradientPaint;
  readonly texture?: PathTexturePaint;
  readonly strokeColor?: Color;
  readonly strokeGradient?: { readonly start: { readonly x: number; readonly y: number };
    readonly end: { readonly x: number; readonly y: number };
    readonly startColor: Color; readonly endColor: Color;
    readonly stops?: readonly { readonly offset: number; readonly color: Color }[];
    readonly spread?: "pad" | "repeat" | "reflect" };
  readonly strokeRadialGradient?: PathRadialGradientPaint;
  readonly strokeConicGradient?: PathConicGradientPaint;
  readonly strokeTexture?: PathTexturePaint;
  readonly strokeWidth?: number; readonly viewBox?: { x: number; y: number;
    width: number; height: number }; readonly tolerance?: number;
  readonly sourceClip?: { x: number; y: number; width: number; height: number };
  readonly fillRule?: "nonzero" | "evenodd"; readonly lineCap?: "butt" | "round" | "square";
  readonly lineJoin?: "bevel" | "round" | "miter"; readonly style?: Style;
  readonly miterLimit?: number;
  readonly dash?: { readonly length: number; readonly gap: number; readonly offset?: number } |
    { readonly values: readonly number[]; readonly offset?: number };
}) {
  const resource = useMemo(() => canonicalPath(data), [data]);
  const path: PathData = { resourceId: resource.resourceId, segments: resource.segments,
    viewBox: viewBox ?? resource.bounds, fit: "contain",
    ...(sourceClip ? { sourceClip } : {}),
    ...(color ? { fill: color } : {}), ...(gradient ? { fillGradient: gradient } : {}),
    ...(radialGradient ? { fillRadialGradient: radialGradient } : {}),
    ...(conicGradient ? { fillConicGradient: conicGradient } : {}),
    ...(texture ? { fillTexture: texture } : {}),
    ...(strokeGradient && strokeWidth > 0 ? { strokeGradient, strokeWidth } : {}),
    ...(strokeRadialGradient && strokeWidth > 0 ? { strokeRadialGradient, strokeWidth } : {}),
    ...(strokeConicGradient && strokeWidth > 0 ? { strokeConicGradient, strokeWidth } : {}),
    ...(strokeTexture && strokeWidth > 0 ? { strokeTexture, strokeWidth } : {}),
    ...(strokeColor && strokeWidth > 0
      ? { stroke: strokeColor, strokeWidth } : {}),
    ...(tolerance !== undefined ? { tolerance } : {}), ...(fillRule ? { fillRule } : {}),
    ...(dash ? { dash } : {}), ...(miterLimit !== undefined ? { miterLimit } : {}),
    lineCap, lineJoin };
  return <mgfx-path path={path} style={style ?? {}} />;
}

export function Svg({ source, color, tolerance = 0.15, style }: {
  readonly source: string; readonly color?: Color; readonly tolerance?: number;
  readonly style?: Style;
}) {
  const currentColor = color ?? rgba(1, 1, 1);
  const document = useMemo(() => parseSvgVectorDocument(source, currentColor),
    [source, currentColor.red, currentColor.green, currentColor.blue, currentColor.alpha]);
  const renderLayer = (layer: SvgVectorLayer, index: number, includeFill: boolean,
    includeStroke: boolean, suffix = "") => layer.text
    ? <mgfx-vector-text key={`svg-layer-${index}${suffix}`} vectorText={{ ...layer.text,
      viewBox: document.viewBox, ...(layer.clip ? { sourceClip: layer.clip } : {}) }}
      style={{ position: "absolute", inset: all(0) }} />
    : layer.richText
    ? <mgfx-vector-rich-text key={`svg-layer-${index}${suffix}`} vectorRichText={{ ...layer.richText,
      viewBox: document.viewBox, ...(layer.clip ? { sourceClip: layer.clip } : {}) }}
      style={{ position: "absolute", inset: all(0) }} />
    : layer.image
    ? <mgfx-vector-image key={`svg-layer-${index}${suffix}`}
      textureResource={layer.image.texture}
      vectorImage={{ textureId: layer.image.texture.resourceId,
        sourceSize: { width: layer.image.texture.width, height: layer.image.texture.height },
        x: layer.image.x, y: layer.image.y, width: layer.image.width, height: layer.image.height,
        viewBox: document.viewBox, fit: layer.image.fit, sampling: layer.image.sampling,
        alignX: layer.image.alignX, alignY: layer.image.alignY,
        ...(layer.image.opacity !== undefined ? { opacity: layer.image.opacity } : {}),
        ...(layer.image.sourceTransform ? { sourceTransform: layer.image.sourceTransform } : {}),
        ...(layer.clip ? { sourceClip: layer.clip } : {}) }}
      style={{ position: "absolute", inset: all(0) }} />
    : <Path key={`svg-layer-${index}${suffix}`}
      data={layer.path!}
      viewBox={document.viewBox}
      {...(layer.clip ? { sourceClip: layer.clip } : {})}
      {...(includeFill && layer.fill ? { color: layer.fill } : {})}
      {...(includeFill && layer.fillGradient ? { gradient: layer.fillGradient } : {})}
      {...(includeFill && layer.fillRadialGradient
        ? { radialGradient: layer.fillRadialGradient } : {})}
      {...(includeStroke && layer.stroke
        ? { strokeColor: layer.stroke, strokeWidth: layer.strokeWidth } : {})}
      {...(includeStroke && layer.strokeGradient
        ? { strokeGradient: layer.strokeGradient, strokeWidth: layer.strokeWidth } : {})}
      {...(includeStroke && layer.strokeRadialGradient
        ? { strokeRadialGradient: layer.strokeRadialGradient, strokeWidth: layer.strokeWidth } : {})}
      {...(includeStroke && layer.dash ? { dash: layer.dash } : {})}
      {...(includeStroke && layer.miterLimit !== undefined ? { miterLimit: layer.miterLimit } : {})}
      fillRule={layer.fillRule} lineCap={layer.lineCap} lineJoin={layer.lineJoin}
      tolerance={tolerance} style={{ position: "absolute", inset: all(0) }} />;
  return <Stack style={style ?? {}}>{document.layers.flatMap((layer, index) =>
    layer.fillRadialGradient && (layer.strokeGradient || layer.strokeRadialGradient)
      ? [renderLayer(layer, index, true, false, "-fill"),
        renderLayer(layer, index, false, true, "-stroke")]
      : [renderLayer(layer, index, true, true)])}
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
    <mgfx-row {...handlers} style={{ preferredSize: { height: 48 }, padding: all(12),
      cornerRadius: 10, clip: true, mainAxisAlignment: "center",
      crossAxisAlignment: "center", ...style, background: color }}>
      <Text value={label} style={{ fontWeight: "bold", ...textStyle }} />
    </mgfx-row>
  );
}

export function Slider({ value, onChange, width = 360, step = 0.05 }: {
  readonly value: number; readonly onChange: (value: number) => void;
  readonly width?: number; readonly step?: number;
}) {
  const [hovered, setHovered] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [focused, setFocused] = useState(false);
  useNativeCursor("pointer", hovered || dragging);
  const clamped = Math.max(0, Math.min(1, value));
  const trackLeft = 10;
  const trackWidth = Math.max(1, width - trackLeft * 2);
  const updateAt = (point: Point) => onChange(Math.max(0,
    Math.min(1, (point.x - trackLeft) / trackWidth)));
  return <mgfx-stack style={{ preferredSize: { width, height: 44 }, cornerRadius: 12,
    background: hovered ? rgba(0.075, 0.105, 0.17) : rgba(0.05, 0.07, 0.12),
    borderWidth: focused ? 2 : 1,
    borderColor: focused ? rgba(0.38, 0.72, 1) : rgba(0.20, 0.28, 0.42) }}
    onHoverChange={setHovered} onFocusChange={setFocused}
    onPointerDown={(point) => { setDragging(true); updateAt(point); }}
    onPointerMove={(point) => { if (dragging) updateAt(point); }}
    onPointerUp={(point) => { updateAt(point); setDragging(false); }}
    onKeyDown={(key) => {
      if (key === Key.ArrowLeft || key === Key.ArrowDown) onChange(Math.max(0, clamped - step));
      if (key === Key.ArrowRight || key === Key.ArrowUp) onChange(Math.min(1, clamped + step));
    }}>
    <Box style={{ position: "absolute", inset: { top: 17, right: trackLeft,
      bottom: 17, left: trackLeft }, cornerRadius: 5, background: rgba(0.13, 0.17, 0.25) }} />
    <Box style={{ position: "absolute", inset: { top: 17, bottom: 17, left: trackLeft },
      preferredSize: { width: trackWidth * clamped }, cornerRadius: 5,
      backgroundGradient: { start: rgba(0.20, 0.82, 1),
        end: rgba(0.62, 0.28, 1), direction: "horizontal" } }} />
    <Circle style={{ position: "absolute", inset: { top: 8,
      left: trackLeft + trackWidth * clamped - 14 }, preferredSize: { width: 28, height: 28 },
      background: dragging ? rgba(0.94, 1, 1) : rgba(0.76, 0.94, 1),
      borderWidth: 2, borderColor: rgba(0.28, 0.66, 1),
      shadow: { color: rgba(0.18, 0.56, 1, 0.42), blur: 9, spread: 1 } }} />
  </mgfx-stack>;
}

export function Checkbox({ checked, onChange, label, disabled = false }: {
  readonly checked: boolean; readonly onChange: (checked: boolean) => void;
  readonly label: string; readonly disabled?: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [focused, setFocused] = useState(false);
  useNativeCursor("pointer", hovered && !disabled);
  const handlers = disabled ? {} : { onClick: () => onChange(!checked),
    onHoverChange: setHovered, onPressChange: setPressed, onFocusChange: setFocused };
  return <mgfx-row {...handlers} style={{ preferredSize: { height: 44 }, padding: all(6),
    gap: 12, cornerRadius: 9, crossAxisAlignment: "center",
    background: pressed ? rgba(0.06, 0.09, 0.15)
      : hovered ? rgba(0.09, 0.13, 0.21) : rgba(0.04, 0.055, 0.09),
    opacity: disabled ? 0.45 : 1 }}>
    <Stack style={{ preferredSize: { width: 30, height: 30 }, cornerRadius: 7,
      background: checked ? rgba(0.16, 0.68, 0.52) : rgba(0.08, 0.11, 0.17),
      borderWidth: focused ? 2.5 : 1.5,
      borderColor: focused ? rgba(0.48, 0.86, 1)
        : checked ? rgba(0.42, 1, 0.74) : rgba(0.30, 0.38, 0.52) }}>
      {checked ? <Path data="M5 15L11 21L25 7" viewBox={{ x: 0, y: 0, width: 30, height: 30 }}
        strokeColor={rgba(0.94, 1, 0.98)} strokeWidth={3} lineCap="round" lineJoin="round"
        style={{ position: "absolute", inset: all(3) }} /> : null}
    </Stack>
    <Text value={label} style={{ fontSize: 20, fontWeight: checked ? "semibold" : "regular",
      color: disabled ? rgba(0.46, 0.50, 0.58) : rgba(0.78, 0.84, 0.92) }} />
  </mgfx-row>;
}

function RadioOption({ selected, label, onSelect }: { readonly selected: boolean;
  readonly label: string; readonly onSelect: () => void }) {
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [focused, setFocused] = useState(false);
  useNativeCursor("pointer", hovered);
  return <mgfx-row onClick={onSelect} onHoverChange={setHovered} onPressChange={setPressed}
    onFocusChange={setFocused} style={{ preferredSize: { height: 44 }, padding: all(7),
      gap: 11, cornerRadius: 9, crossAxisAlignment: "center",
      background: pressed ? rgba(0.06, 0.09, 0.15)
        : hovered ? rgba(0.09, 0.13, 0.21) : rgba(0.04, 0.055, 0.09) }}>
    <Stack style={{ preferredSize: { width: 30, height: 30 }, cornerRadius: 15,
      background: rgba(0.035, 0.05, 0.08), borderWidth: focused ? 2.5 : 2,
      borderColor: focused ? rgba(0.48, 0.86, 1)
        : selected ? rgba(0.46, 0.96, 0.76) : rgba(0.30, 0.38, 0.52) }}>
      {selected ? <Row style={{ position: "absolute", inset: all(0),
        mainAxisAlignment: "center", crossAxisAlignment: "center" }}>
        <Circle style={{ preferredSize: { width: 12, height: 12 },
          background: rgba(0.32, 0.96, 0.70),
          shadow: { color: rgba(0.18, 0.78, 0.54, 0.34), blur: 5, spread: 0 } }} />
      </Row> : null}
    </Stack>
    <Text value={label} style={{ fontSize: 20, fontWeight: selected ? "semibold" : "regular",
      color: selected ? rgba(0.82, 1, 0.92) : rgba(0.70, 0.76, 0.86) }} />
  </mgfx-row>;
}

export function RadioGroup({ options, value, onChange }: {
  readonly options: readonly string[]; readonly value: number;
  readonly onChange: (index: number) => void;
}) {
  return <Row style={{ gap: 10, crossAxisAlignment: "stretch" }}>{options.map((label, index) =>
    <RadioOption key={label} label={label} selected={value === index}
      onSelect={() => onChange(index)} />)}</Row>;
}

export function ProgressBar({ value, height = 22 }: { readonly value: number;
  readonly height?: number }) {
  const clamped = Math.max(0, Math.min(1, value));
  return <Row style={{ preferredSize: { height }, cornerRadius: height / 2, clip: true,
    background: rgba(0.10, 0.13, 0.20), gap: 0 }}>
    <Box style={{ preferredSize: { height }, flexGrow: Math.max(0.001, clamped),
      backgroundGradient: { start: rgba(0.20, 0.82, 1),
        end: rgba(0.62, 0.28, 1), direction: "horizontal" } }} />
    <Box style={{ preferredSize: { height }, flexGrow: Math.max(0.001, 1 - clamped) }} />
  </Row>;
}

function StepperIconButton({ kind, disabled, onPress }: { readonly kind: "minus" | "plus";
  readonly disabled: boolean; readonly onPress: () => void }) {
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [focused, setFocused] = useState(false);
  useNativeCursor("pointer", hovered && !disabled);
  const handlers = disabled ? {} : { onClick: onPress, onHoverChange: setHovered,
    onPressChange: setPressed, onFocusChange: setFocused };
  const base = kind === "plus" ? rgba(0.14, 0.48, 0.40) : rgba(0.16, 0.24, 0.38);
  return <mgfx-stack {...handlers} style={{ preferredSize: { width: 48, height: 44 },
    cornerRadius: 8, opacity: disabled ? 0.45 : 1,
    background: pressed ? rgba(base.red * 0.72, base.green * 0.72, base.blue * 0.72)
      : hovered ? rgba(Math.min(1, base.red * 1.16), Math.min(1, base.green * 1.16),
        Math.min(1, base.blue * 1.16)) : base,
    borderWidth: focused ? 2 : 0,
    borderColor: focused ? rgba(0.48, 0.84, 1) : rgba(0, 0, 0, 0) }}>
    <Path data={kind === "plus" ? "M12 5V19M5 12H19" : "M5 12H19"}
      viewBox={{ x: 0, y: 0, width: 24, height: 24 }} strokeColor={rgba(0.92, 0.98, 1)}
      strokeWidth={2.6} lineCap="square"
      style={{ position: "absolute", inset: { top: 10, right: 12, bottom: 10, left: 12 } }} />
  </mgfx-stack>;
}

export function Stepper({ value, onChange, minimum = 0, maximum = 100, step = 1 }: {
  readonly value: number; readonly onChange: (value: number) => void;
  readonly minimum?: number; readonly maximum?: number; readonly step?: number;
}) {
  const [focused, setFocused] = useState(false);
  const clamped = Math.max(minimum, Math.min(maximum, value));
  const update = (next: number) => onChange(Math.max(minimum, Math.min(maximum, next)));
  return <mgfx-row style={{ preferredSize: { width: 280, height: 52 }, padding: all(4), gap: 8,
    cornerRadius: 12, background: rgba(0.045, 0.065, 0.105), borderWidth: focused ? 2 : 1,
    borderColor: focused ? rgba(0.38, 0.72, 1) : rgba(0.20, 0.28, 0.42),
    crossAxisAlignment: "stretch" }} onFocusChange={setFocused}
    onKeyDown={(key) => {
      if (key === Key.ArrowUp || key === Key.ArrowRight) update(clamped + step);
      if (key === Key.ArrowDown || key === Key.ArrowLeft) update(clamped - step);
    }}>
    <StepperIconButton kind="minus" disabled={clamped <= minimum}
      onPress={() => update(clamped - step)} />
    <Stack style={{ preferredSize: { height: 44 }, flexGrow: 1, padding: all(10),
      cornerRadius: 8, background: rgba(0.08, 0.105, 0.16) }}>
      <Text value={Number.isInteger(clamped) ? `${clamped}` : clamped.toFixed(2)}
        style={{ fontSize: 21, fontWeight: "bold", textAlign: "center",
          color: rgba(0.82, 0.92, 1) }} />
    </Stack>
    <StepperIconButton kind="plus" disabled={clamped >= maximum}
      onPress={() => update(clamped + step)} />
  </mgfx-row>;
}

function SelectOption({ label, selected, onSelect, onDismiss }: { readonly label: string;
  readonly selected: boolean; readonly onSelect: () => void; readonly onDismiss: () => void }) {
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);
  useNativeCursor("pointer", hovered);
  return <mgfx-row onClick={onSelect} onHoverChange={setHovered} onPressChange={setPressed}
    onKeyDown={(key) => { if (key === Key.Escape) onDismiss(); }} style={{
      preferredSize: { height: 44 }, padding: { top: 9, right: 12, bottom: 9, left: 12 },
      cornerRadius: 8, crossAxisAlignment: "center",
      background: pressed ? rgba(0.10, 0.22, 0.34)
        : selected ? rgba(0.14, 0.34, 0.52) : hovered ? rgba(0.10, 0.16, 0.25)
          : rgba(0.045, 0.065, 0.105) }}>
    <Text value={label} style={{ fontSize: 19, fontWeight: selected ? "semibold" : "regular",
      color: selected ? rgba(0.72, 0.94, 1) : rgba(0.72, 0.78, 0.88) }} />
  </mgfx-row>;
}

export function Select({ options, value, onChange, width = 300 }: {
  readonly options: readonly string[]; readonly value: number;
  readonly onChange: (index: number) => void; readonly width?: number;
}) {
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [focused, setFocused] = useState(false);
  useNativeCursor("pointer", hovered);
  const selected = Math.max(0, Math.min(options.length - 1, value));
  const select = (index: number) => { onChange(index); setOpen(false); };
  return <mgfx-stack onClick={() => setOpen((current) => !current)}
    onHoverChange={setHovered} onPressChange={setPressed} onFocusChange={setFocused}
    onKeyDown={(key) => {
      if (key === Key.Escape) setOpen(false);
      if (key === Key.ArrowDown && options.length > 0)
        onChange(Math.min(options.length - 1, selected + 1));
      if (key === Key.ArrowUp && options.length > 0) onChange(Math.max(0, selected - 1));
    }} style={{ preferredSize: { width, height: 48 }, zIndex: open ? 200 : 0 }}>
    <Row style={{ position: "absolute", inset: all(0), padding: all(12), gap: 12,
      cornerRadius: 10, mainAxisAlignment: "spaceBetween", crossAxisAlignment: "center",
      background: pressed ? rgba(0.07, 0.11, 0.18)
        : hovered || open ? rgba(0.10, 0.16, 0.25) : rgba(0.065, 0.09, 0.145),
      borderWidth: focused || open ? 2 : 1,
      borderColor: focused || open ? rgba(0.38, 0.72, 1) : rgba(0.22, 0.30, 0.44) }}>
      <Text value={options[selected] ?? "SELECT"} style={{ fontSize: 20,
        fontWeight: "semibold", color: rgba(0.80, 0.88, 0.96) }} />
      <Path data={open ? "M6 15L12 9L18 15" : "M6 9L12 15L18 9"}
        viewBox={{ x: 0, y: 0, width: 24, height: 24 }} strokeWidth={2.2}
        strokeColor={rgba(0.56, 0.82, 1)}
        style={{ preferredSize: { width: 24, height: 24 } }} />
    </Row>
    {open ? <Column style={{ position: "absolute", inset: { top: 54, right: 0, left: 0 },
      zIndex: 201, padding: all(6), gap: 4, cornerRadius: 12,
      crossAxisAlignment: "stretch", background: rgba(0.025, 0.04, 0.07, 0.99),
      borderWidth: 1.5, borderColor: rgba(0.28, 0.46, 0.70),
      shadow: { color: rgba(0, 0, 0, 0.55), blur: 16, spread: 1, offsetY: 6 } }}>
      {options.map((label, index) => <SelectOption key={label} label={label}
        selected={selected === index} onSelect={() => select(index)}
        onDismiss={() => setOpen(false)} />)}
    </Column> : null}
  </mgfx-stack>;
}

function TabOption({ label, active, onSelect, onPrevious, onNext }: {
  readonly label: string; readonly active: boolean; readonly onSelect: () => void;
  readonly onPrevious: () => void; readonly onNext: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [focused, setFocused] = useState(false);
  useNativeCursor("pointer", hovered);
  return <mgfx-stack onClick={onSelect} onHoverChange={setHovered} onPressChange={setPressed}
    onFocusChange={setFocused} onKeyDown={(key) => {
      if (key === Key.ArrowLeft || key === Key.ArrowUp) onPrevious();
      if (key === Key.ArrowRight || key === Key.ArrowDown) onNext();
    }} style={{ preferredSize: { height: 48 }, flexGrow: 1, cornerRadius: 9,
      background: pressed ? rgba(0.07, 0.12, 0.20)
        : active ? rgba(0.12, 0.24, 0.38) : hovered ? rgba(0.085, 0.13, 0.21)
          : rgba(0.045, 0.065, 0.105),
      borderWidth: focused ? 2 : 0,
      borderColor: focused ? rgba(0.46, 0.82, 1) : rgba(0, 0, 0, 0) }}>
    <Row style={{ position: "absolute", inset: all(0), mainAxisAlignment: "center",
      crossAxisAlignment: "center" }}>
      <Text value={label} style={{ fontSize: 19, fontWeight: active ? "bold" : "medium",
        color: active ? rgba(0.76, 0.94, 1) : rgba(0.58, 0.66, 0.78) }} />
    </Row>
    {active ? <Box style={{ position: "absolute", inset: { right: 14, bottom: 0, left: 14 },
      preferredSize: { height: 3 }, cornerRadius: 1.5,
      backgroundGradient: { start: rgba(0.24, 0.82, 1),
        end: rgba(0.58, 0.30, 1), direction: "horizontal" } }} /> : null}
  </mgfx-stack>;
}

export function Tabs({ options, value, onChange, width = 640 }: {
  readonly options: readonly string[]; readonly value: number;
  readonly onChange: (index: number) => void; readonly width?: number;
}) {
  const selected = Math.max(0, Math.min(options.length - 1, value));
  const selectRelative = (delta: number) => {
    if (options.length === 0) return;
    onChange((selected + delta + options.length) % options.length);
  };
  return <Row style={{ preferredSize: { width, height: 56 }, padding: all(4), gap: 6,
    cornerRadius: 12, crossAxisAlignment: "stretch",
    background: rgba(0.025, 0.04, 0.07), borderWidth: 1,
    borderColor: rgba(0.18, 0.27, 0.42) }}>{options.map((label, index) =>
    <TabOption key={label} label={label} active={selected === index}
      onSelect={() => onChange(index)} onPrevious={() => selectRelative(-1)}
      onNext={() => selectRelative(1)} />)}</Row>;
}

export function disclosureProgress(from: number, to: number, startedAt: number,
  now: number, duration = 260): number {
  const progress = Math.max(0, Math.min(1, (now - startedAt) / duration));
  const eased = progress * progress * (3 - 2 * progress);
  return from + (to - from) * eased;
}

export function Disclosure({ title, open, onChange, children, contentHeight = 96 }: {
  readonly title: string; readonly open: boolean; readonly onChange: (open: boolean) => void;
  readonly children?: ReactNode; readonly contentHeight?: number;
}) {
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [focused, setFocused] = useState(false);
  const time = useAnimationTime();
  const previousOpen = useRef(open);
  const transition = useRef({ from: open ? 1 : 0, to: open ? 1 : 0, startedAt: time });
  if (previousOpen.current !== open) {
    const current = disclosureProgress(transition.current.from, transition.current.to,
      transition.current.startedAt, time);
    transition.current = { from: current, to: open ? 1 : 0, startedAt: time };
    previousOpen.current = open;
  }
  const progress = disclosureProgress(transition.current.from, transition.current.to,
    transition.current.startedAt, time);
  useNativeCursor("pointer", hovered);
  return <Column style={{ preferredSize: { height: 52 + contentHeight * progress },
    cornerRadius: 12, clip: true, background: rgba(0.035, 0.052, 0.085),
    borderWidth: 1, borderColor: focused ? rgba(0.44, 0.80, 1) : rgba(0.20, 0.29, 0.44) }}>
    <mgfx-row onClick={() => onChange(!open)} onHoverChange={setHovered}
      onPressChange={setPressed} onFocusChange={setFocused}
      style={{ preferredSize: { height: 52 }, padding: all(13),
        mainAxisAlignment: "spaceBetween", crossAxisAlignment: "center",
        background: pressed ? rgba(0.07, 0.12, 0.20)
          : hovered ? rgba(0.09, 0.15, 0.24) : rgba(0.055, 0.08, 0.13) }}>
      <Text value={title} style={{ fontSize: 20, fontWeight: "semibold",
        color: rgba(0.76, 0.86, 0.96) }} />
      <Path data="M6 9L12 15L18 9" viewBox={{ x: 0, y: 0, width: 24, height: 24 }}
        strokeWidth={2.2} strokeColor={rgba(0.48, 0.82, 1)}
        style={{ preferredSize: { width: 24, height: 24 },
          transform: { rotation: progress * 180 } }} />
    </mgfx-row>
    <Column style={{ position: "absolute", inset: { top: 52, right: 0, left: 0 },
      preferredSize: { height: contentHeight }, padding: all(16), gap: 8,
      opacity: progress, transform: { translateY: (1 - progress) * -8 } }}>
      {children}
    </Column>
  </Column>;
}

export interface TextFieldProps {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly placeholder?: string;
  readonly maxLength?: number;
  readonly style?: Style;
  readonly textStyle?: TextStyle;
  readonly onKeyDown?: (key: Key, modifiers: number) => void;
}

export function TextField({ value, onChange, placeholder = "", maxLength = 256,
  style = {}, textStyle, onKeyDown }: TextFieldProps) {
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
        onKeyDown?.(key, modifiers);
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
