import { useState } from "react";
import type { AnimationClock, WindowChromeMetrics, WindowMode } from "@mgfx/demo-client/protocol";
import { Box, Button, Circle, Column, Image, Path, RichText, Row, Scroll, Stack, Svg, Text, TextField, all, rgba } from "./components.js";
import { Window, useNativeClipboard, useNativeCursor } from "./native-window.js";
import type { VectorIcon } from "./icon-pack.js";
import { Dialog, Router, useRouter } from "./navigation.js";
import { AnimationProvider, useAnimationTime } from "./animation.js";

export function DotGrid({ time }: { readonly time: number }) {
  const ink = rgba(0.55, 0.86, 0.68);
  const highlight = rgba(0.82, 1.0, 0.88);
  const activeDot = Math.floor(time / 140) % 16;
  const pattern = [false, true, false, true, false, false, true, false,
    true, false, false, false, false, true, false, true];
  const filledMask = pattern.reduce((mask, filled, index) =>
    filled ? mask | (1 << index) : mask, 0) >>> 0;
  return (
    <Box style={{ preferredSize: { width: 52, height: 52 },
      background: rgba(0.04, 0.12, 0.09), borderWidth: 3, borderColor: ink,
      backgroundDotGrid: { rows: 4, columns: 4, filledMask, activeIndex: activeDot,
        inset: 7, radius: 4, borderWidth: 2, fillColor: ink,
        ringColor: ink, highlightColor: highlight } }} />
  );
}

export function ConicBadge({ time }: { readonly time: number }) {
  return <Box style={{ preferredSize: { width: 52, height: 52 }, cornerRadius: 26,
    backgroundConicGradient: { start: rgba(0.15, 0.85, 1),
      middle: rgba(0.74, 0.2, 1), end: rgba(0.15, 0.85, 1), rotation: time / 20 },
    borderWidth: 2, borderColor: rgba(0.78, 0.95, 1, 0.9),
    shadow: { color: rgba(0.1, 0.65, 1, 0.35), blur: 10, spread: 1 } }} />;
}

export function GradientCircleBadge({ time }: { readonly time: number }) {
  const pulse = Math.sin(time / 420) * 0.08;
  return <Circle style={{ preferredSize: { width: 52, height: 52 },
    backgroundGradient: { start: rgba(0.12, 0.92, 0.66),
      end: rgba(0.58 + pulse, 0.20, 1), direction: "diagonal" },
    borderWidth: 2, borderColor: rgba(0.82, 1, 0.94, 0.9),
    shadow: { color: rgba(0.3, 0.45, 1, 0.3), blur: 10, spread: 1 } }} />;
}

export function WavePattern({ time }: { readonly time: number }) {
  return (
    <Box style={{ preferredSize: { height: 70 }, cornerRadius: 14,
      backgroundGradient: {
        start: rgba(0.055, 0.08, 0.16), end: rgba(0.12, 0.17, 0.34),
        direction: "diagonal",
      },
      backgroundWaveDots: { count: 24, inset: 12, minimumRadius: 3.5, maximumRadius: 15,
        phase: time / 240, frequency: 0.56, borderWidth: 1,
        troughStartColor: rgba(0.22, 0.36, 1), troughEndColor: rgba(0.16, 1, 0.62),
        crestStartColor: rgba(0.56, 0.36, 1), crestEndColor: rgba(0.16, 1, 0.82),
        borderColor: rgba(0.72, 0.94, 1, 0.65) } }} />
  );
}

export function DiagonalPattern({ time }: { readonly time: number }) {
  return (
    <Row style={{ preferredSize: { height: 92 }, padding: all(12), gap: 18,
      background: rgba(0.035, 0.045, 0.07), borderWidth: 1,
      borderColor: rgba(0.22, 0.28, 0.40), crossAxisAlignment: "center" }}>
      <Stack style={{ preferredSize: { width: 220 }, padding: all(8) }}>
        <Text value="DIAGONAL AREA PATTERN" style={{ fontSize: 22, fontWeight: "bold",
          color: rgba(0.82, 0.86, 0.94) }} />
      </Stack>
      <Box style={{ preferredSize: { height: 64 }, flexGrow: 1,
        backgroundGradient: {
          start: rgba(0.08, 0.09, 0.12), end: rgba(0.14, 0.10, 0.045),
          direction: "horizontal",
        },
        backgroundPattern: {
          color: rgba(1, 0.56, 0.10), stripeWidth: 9, gap: 10,
          direction: "forward", offset: -time / 18,
        },
        borderWidth: 2, borderColor: rgba(0.72, 0.76, 0.82) }} />
    </Row>
  );
}

function ImagePreview({ time, sourceSize }: { readonly time: number;
  readonly sourceSize: { readonly width: number; readonly height: number } }) {
  const frame = Math.floor(time / 450) % 4;
  return (
    <Row style={{ preferredSize: { height: 126 }, padding: all(12), gap: 18,
      background: rgba(0.035, 0.045, 0.07), crossAxisAlignment: "center" }}>
      <Stack style={{ preferredSize: { width: 220 }, padding: all(8) }}>
        <Text value="TILED IMAGE / SVG" style={{ fontSize: 22, fontWeight: "bold",
          color: rgba(0.82, 0.86, 0.94) }} />
      </Stack>
      <Image textureId={1} tileWidth={120} tileHeight={68} tileOffsetX={time / 24}
        repeatX repeatY
        style={{ preferredSize: { height: 102 }, flexGrow: 1,
          background: rgba(0.015, 0.02, 0.03), cornerRadius: 16,
          borderWidth: 2, borderColor: rgba(0.2, 0.3, 0.45) }} />
      <Image textureId={1} sourceWidth={sourceSize.width} sourceHeight={sourceSize.height}
        nineSlice={{ source: { left: 40, top: 32, right: 40, bottom: 32 },
          destination: { left: 24, top: 20, right: 24, bottom: 20 } }}
        style={{ preferredSize: { width: 180, height: 102 }, cornerRadius: 12 }} />
      <Image textureId={1} sourceWidth={sourceSize.width} sourceHeight={sourceSize.height}
        sourceRect={{ x: frame * sourceSize.width / 4, y: 0,
          width: sourceSize.width / 4, height: sourceSize.height }} fit="cover"
        effects={{ saturation: 1.35, contrast: 1.12,
          brightness: 0.04, hueRotation: Math.sin(time / 900) * Math.PI,
          blur: 0.75 + (Math.sin(time / 700) + 1) * 0.6 }}
        style={{ preferredSize: { width: 102, height: 102 }, cornerRadius: 16,
          borderWidth: 2, borderColor: rgba(0.34, 0.92, 0.72) }} />
      <Path data="M50 2L62 18L82 18L82 38L98 50L82 62L82 82L62 82L50 98L38 82L18 82L18 62L2 50L18 38L18 18L38 18Z M50 32A18 18 0 1 1 49.9 32Z"
        viewBox={{ x: 0, y: 0, width: 100, height: 100 }} fillRule="evenodd"
        texture={{ textureId: 1, sourceRect: { x: 0, y: 0, width: 34, height: 34 },
          repeatX: true, repeatY: true, tint: rgba(0.8, 1, 0.9, 0.95) }}
        strokeColor={rgba(0.34, 0.92, 0.72)} strokeWidth={2}
        style={{ preferredSize: { width: 102, height: 102 } }} />
    </Row>
  );
}

function ServerVectorPath({ time }: { readonly time: number }) {
  const pulse = (Math.sin(time / 420) + 1) / 2;
  return (
    <Row style={{ preferredSize: { height: 94 }, padding: all(12), gap: 18,
      background: rgba(0.035, 0.045, 0.07), crossAxisAlignment: "center" }}>
      <Stack style={{ preferredSize: { width: 220 }, padding: all(8) }}>
        <Text value="SERVER PATH CACHE" style={{ fontSize: 22, fontWeight: "bold",
          color: rgba(0.82, 0.86, 0.94) }} />
      </Stack>
      <Path
        data="M18 4H302L316 18V82L302 96H18L4 82V18Z M28 20H292L300 28V72L292 80H28L20 72V28Z"
        viewBox={{ x: 0, y: 0, width: 320, height: 100 }} fillRule="evenodd"
        conicGradient={{ center: { x: 160, y: 50 }, rotation: (time / 900) % (Math.PI * 2),
          stops: [
            { offset: 0, color: rgba(0.10, 0.82, 1, 0.9) },
            { offset: 0.25, color: rgba(0.22, 0.95, 0.62, 0.86) },
            { offset: 0.5, color: rgba(0.72 + pulse * 0.16, 0.20, 1, 0.9) },
            { offset: 0.75, color: rgba(1, 0.36, 0.08, 0.9) },
            { offset: 1, color: rgba(0.10, 0.82, 1, 0.9) },
          ] }}
        strokeColor={rgba(1, 0.42 + pulse * 0.3, 0.06, 0.88)} strokeWidth={2.5}
        style={{ preferredSize: { height: 68 }, flexGrow: 1 }} />
    </Row>
  );
}

function IconGallery({ icons, time }: { readonly icons: readonly VectorIcon[];
  readonly time: number }) {
  const pulse = (Math.sin(time / 420) + 1) / 2;
  return (
    <Row style={{ preferredSize: { height: 112 }, padding: all(12), gap: 18,
      background: rgba(0.035, 0.045, 0.07), crossAxisAlignment: "center" }}>
      <Stack style={{ preferredSize: { width: 220 }, padding: all(8) }}>
        <Text value="LUCIDE VECTOR STROKES" style={{ fontSize: 22, fontWeight: "bold",
          color: rgba(0.82, 0.86, 0.94) }} />
      </Stack>
      <Row style={{ gap: 22, flexGrow: 1, mainAxisAlignment: "center",
        crossAxisAlignment: "center" }}>
        {icons.map((icon, index) => <Path key={icon.name} data={icon.path}
          viewBox={{ x: 0, y: 0, width: 24, height: 24 }} tolerance={0.12}
          strokeWidth={2} lineCap="round" lineJoin="round"
          strokeColor={rgba(0.24 + index * 0.14, 0.72 + pulse * 0.18, 1 - index * 0.12)}
          style={{ preferredSize: { width: 76, height: 76 }, transform: {
            rotation: Math.sin(time / 520 + index * 0.8) * 7,
            scaleX: 0.94 + pulse * 0.08, scaleY: 0.94 + pulse * 0.08,
          }, opacity: 0.72 + pulse * 0.28 }} />)}
      </Row>
    </Row>
  );
}

const vectorDocument = `<svg viewBox="0 0 160 72" fill="none">
  <style>
    .content { clip-path: url(#contentWindow); }
    .signal { stroke: url(#signal); stroke-width: 4; stroke-dasharray: 7 4 2 4;
      stroke-dashoffset: 2; stroke-linecap: square; stroke-linejoin: miter;
      stroke-miterlimit: 6; }
    .native-label { fill: #d8fff0; font-family: rounded; font-size: 7;
      font-weight: 600; letter-spacing: 0.45; text-anchor: middle; }
    .native-accent { fill: #ff8a1e; font-family: serif; font-size: 9;
      font-style: italic; font-weight: 700; }
    .native-decoration { fill: #07111f; stroke: #58e6b5; stroke-width: 0.7;
      font-size: 7; baseline-shift: super; text-decoration: underline; }
    .outline-label { fill: url(#radialText);
      font-family: rounded; font-size: 8; font-weight: 700; }
  </style>
  <defs>
    <linearGradient id="panel" gradientUnits="userSpaceOnUse" x1="5" y1="5" x2="80" y2="36"
      spreadMethod="reflect">
      <stop offset="0%" stop-color="#07111f"/>
      <stop offset="48%" stop-color="#4b28d7"/>
      <stop offset="100%" stop-color="#183b69"/>
    </linearGradient>
    <linearGradient id="signalPalette">
      <stop offset="0%" stop-color="#ff8a1e"/>
      <stop offset="100%" stop-color="#ffe75a"/>
    </linearGradient>
    <linearGradient id="signal" href="#signalPalette" gradientUnits="userSpaceOnUse"
      x1="78" y1="24" x2="131" y2="42"/>
    <radialGradient id="radialText" fx="35%" fy="32%" fr="5%" spreadMethod="reflect">
      <stop offset="0" stop-color="#ffffff"/><stop offset="0.45" stop-color="#58e6b5"/>
      <stop offset="1" stop-color="#4cc9ff"/></radialGradient>
    <symbol id="signalGlyph" viewBox="0 0 53 24">
      <polyline points="0,21 11,3 21,21 32,3 43,21 53,3"/>
    </symbol>
    <clipPath id="contentWindow"><rect x="3" y="3" width="146" height="58"/></clipPath>
          <radialGradient id="orb" r="25%" fx="38%" fy="35%" fr="6%" spreadMethod="reflect">
            <stop offset="0" stop-color="#d8fff0"/>
            <stop offset="0.48" stop-color="#58e6b5"/>
            <stop offset="1" stop-color="#16c784"/></radialGradient>
  </defs>
  <g transform="translate(4 4)">
    <rect x="1" y="1" width="150" height="62" rx="12" fill="url(#panel)"
      stroke="currentColor" stroke-width="2"/>
    <g class="content">
    <circle cx="34" cy="32" r="17" fill="url(#orb)" stroke="url(#orb)" stroke-width="3"
      stroke-dasharray="5 3" stroke-dashoffset="1"/>
    <image href="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzMiIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDMyIDI0Ij48cmVjdCB3aWR0aD0iMzIiIGhlaWdodD0iMjQiIHJ4PSI0IiBmaWxsPSIjMDgxMzFjIi8+PHBhdGggZD0iTTQgMThMMTAgN0wxNSAxNUwyMSA1TDI4IDE4WiIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjNThlNmI1IiBzdHJva2Utd2lkdGg9IjIiLz48Y2lyY2xlIGN4PSIyNSIgY3k9IjciIHI9IjMiIGZpbGw9IiNmZjhhMWUiLz48L3N2Zz4="
      x="47" y="7" width="16" height="12" preserveAspectRatio="xMidYMid meet"/>
    <text class="outline-label" x="68" y="14">CORETEXT</text>
    <path d="M70 15H137L125 49H70Z" fill="#101827" stroke="#ff8a1e" stroke-width="2"/>
    <use class="signal" href="#signalGlyph" x="78" y="24" width="53" height="18"
      preserveAspectRatio="xMidYMid slice"/>
    <text class="native-label" x="104" y="59" transform="rotate(-4 104 59)"><tspan x="104" y="59">NATIVE </tspan><tspan class="native-accent"><tspan class="native-decoration">SVG</tspan></tspan> TEXT</text>
    </g>
  </g>
</svg>`;

function SvgDocumentPreview({ time }: { readonly time: number }) {
  const pulse = (Math.sin(time / 480) + 1) / 2;
  return <Row style={{ preferredSize: { height: 112 }, padding: all(12), gap: 18,
    background: rgba(0.035, 0.045, 0.07), crossAxisAlignment: "center" }}>
    <Stack style={{ preferredSize: { width: 220 }, padding: all(8) }}>
      <Text value="SVG DOCUMENT → PATHS" style={{ fontSize: 22, fontWeight: "bold",
        color: rgba(0.82, 0.86, 0.94) }} />
    </Stack>
    <Svg source={vectorDocument} color={rgba(0.30 + pulse * 0.3, 0.78, 1)}
      style={{ preferredSize: { width: 320, height: 88 }, flexGrow: 1 }} />
  </Row>;
}

interface AppProps {
  readonly animationClock: AnimationClock;
  readonly chromeMetrics: WindowChromeMetrics;
  readonly headerImageSize: { readonly width: number; readonly height: number };
  readonly vectorIcons: readonly VectorIcon[];
  readonly customFontResourceId: number | undefined;
}

export function App(props: AppProps) {
  return <AnimationProvider clock={props.animationClock}><Router initialRoute="dashboard" routes={{
    dashboard: null,
    graphics: null,
  }}><AppShell {...props} /></Router></AnimationProvider>;
}

const collapsedDrawerWidth = 76;
const expandedDrawerWidth = 248;
const drawerAnimationDuration = 240;

export function animatedDrawerWidth(from: number, to: number, startedAt: number,
  now: number): number {
  const progress = Math.max(0, Math.min(1, (now - startedAt) / drawerAnimationDuration));
  const eased = 1 - Math.pow(1 - progress, 3);
  return from + (to - from) * eased;
}

function DrawerIcon({ icon, fallback, color }: { readonly icon: VectorIcon | undefined;
  readonly fallback: string; readonly color: ReturnType<typeof rgba> }) {
  return <Path data={icon?.path ?? fallback}
    viewBox={{ x: 0, y: 0, width: 24, height: 24 }} strokeColor={color}
    strokeWidth={2.2} lineCap="round" lineJoin="round"
    style={{ preferredSize: { width: 30, height: 30 } }} />;
}

function DrawerToggle({ expanded, showLabels, labelOpacity, onPress }: {
  readonly expanded: boolean; readonly showLabels: boolean; readonly labelOpacity: number;
  readonly onPress: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);
  useNativeCursor("pointer", hovered);
  return <mgfx-row onClick={onPress} onHoverChange={setHovered} onPressChange={setPressed}
    style={{ preferredSize: { height: 48 },
      padding: { top: 9, right: 9, bottom: 9, left: 14 }, gap: 14, cornerRadius: 10,
      background: pressed ? rgba(0.07, 0.10, 0.18)
        : hovered ? rgba(0.15, 0.22, 0.36) : rgba(0.11, 0.16, 0.27),
      crossAxisAlignment: "center", mainAxisAlignment: "start" }}>
    <Path data={expanded ? "M15 5L8 12L15 19" : "M9 5L16 12L9 19"}
      viewBox={{ x: 0, y: 0, width: 24, height: 24 }}
      strokeColor={rgba(0.70, 0.88, 1)} strokeWidth={2.5}
      style={{ preferredSize: { width: 28, height: 28 } }} />
    {showLabels ? <Stack style={{ opacity: labelOpacity }}><Text value="COLLAPSE"
      style={{ fontSize: 18, fontWeight: "semibold", color: rgba(0.70, 0.88, 1) }} />
    </Stack> : null}
  </mgfx-row>;
}

function DrawerItem({ active, label, icon, fallback, showLabel, labelOpacity, onPress }: {
  readonly active: boolean; readonly label: string; readonly icon: VectorIcon | undefined;
  readonly fallback: string; readonly showLabel: boolean; readonly labelOpacity: number;
  readonly onPress: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);
  useNativeCursor("pointer", hovered);
  const background = active
    ? pressed ? rgba(0.12, 0.25, 0.56) : hovered ? rgba(0.23, 0.42, 0.84) : rgba(0.18, 0.34, 0.72)
    : pressed ? rgba(0.035, 0.05, 0.085) : hovered ? rgba(0.09, 0.13, 0.21) : rgba(0.055, 0.075, 0.12);
  return <mgfx-stack onClick={onPress} onHoverChange={setHovered} onPressChange={setPressed}
    style={{ preferredSize: { height: 58 }, cornerRadius: 12, background,
      borderWidth: active ? 1.5 : 0,
      borderColor: active ? rgba(0.36, 0.76, 1) : rgba(0, 0, 0, 0),
      ...(active ? { shadow: { color: rgba(0.12, 0.48, 1, 0.24),
        blur: 9, spread: 0 } } : {}) }}>
    <Row style={{ position: "absolute", inset: all(0),
      padding: { top: 12, right: 12, bottom: 12, left: 13 }, gap: 16,
      crossAxisAlignment: "center", mainAxisAlignment: "start" }}>
      <DrawerIcon icon={icon} fallback={fallback}
        color={active ? rgba(0.78, 0.96, 1) : hovered
          ? rgba(0.72, 0.84, 0.98) : rgba(0.55, 0.66, 0.80)} />
      {showLabel ? <Stack style={{ opacity: labelOpacity }}><Text value={label} style={{ fontSize: 21,
        fontWeight: active ? "bold" : "medium",
        color: active ? rgba(0.92, 0.98, 1) : rgba(0.66, 0.74, 0.86) }} />
      </Stack> : null}
    </Row>
    {active ? <Box style={{ position: "absolute", inset: { top: 12, bottom: 12, left: 0 },
      preferredSize: { width: 4 }, cornerRadius: 2, background: rgba(0.48, 0.88, 1) }} /> : null}
  </mgfx-stack>;
}

function NavigationDrawer({ width, expanded, onToggle, icons }: {
  readonly width: number; readonly expanded: boolean; readonly onToggle: () => void;
  readonly icons: readonly VectorIcon[];
}) {
  const router = useRouter();
  const labelOpacity = Math.max(0, Math.min(1, (width - 104) / 76));
  const showLabels = labelOpacity > 0.01;
  const items = [
    { route: "dashboard", label: "HOME", icon: icons.find((item) => item.name === "grid") ?? icons[3],
      fallback: "M4 4H10V10H4ZM14 4H20V10H14ZM4 14H10V20H4ZM14 14H20V20H14Z" },
    { route: "graphics", label: "GRAPHICS", icon: icons.find((item) => item.name === "activity") ?? icons[0],
      fallback: "M3 12H7L10 5L14 19L17 12H21" },
  ] as const;
  return <Column style={{ position: "absolute", inset: { top: 100, bottom: 20, left: 20 },
    preferredSize: { width }, zIndex: 30, padding: all(10), gap: 10, cornerRadius: 16,
    crossAxisAlignment: "stretch",
    background: rgba(0.035, 0.052, 0.085, 0.98), borderWidth: 1,
    borderColor: rgba(0.22, 0.34, 0.56, 0.9),
    shadow: { color: rgba(0, 0, 0, 0.42), blur: 18, spread: 1, offsetX: 4 } }}>
    <DrawerToggle expanded={expanded} showLabels={showLabels} labelOpacity={labelOpacity}
      onPress={onToggle} />
    {items.map((item) => {
      const active = router.route === item.route;
      return <DrawerItem key={item.route} active={active} label={item.label} icon={item.icon}
        fallback={item.fallback} showLabel={showLabels} labelOpacity={labelOpacity}
        onPress={() => router.replace(item.route)} />;
    })}
  </Column>;
}

function AppShell(props: AppProps) {
  const { chromeMetrics, headerImageSize, customFontResourceId, vectorIcons } = props;
  const [mode, setMode] = useState<WindowMode>("normal");
  const [expanded, setExpanded] = useState(false);
  const [drawerTransition, setDrawerTransition] = useState({ from: collapsedDrawerWidth,
    to: collapsedDrawerWidth, startedAt: 0 });
  const animationTime = useAnimationTime();
  const router = useRouter();
  const drawerWidth = animatedDrawerWidth(drawerTransition.from, drawerTransition.to,
    drawerTransition.startedAt, animationTime);
  const contentLeft = 20 + drawerWidth + 16;
  const contentTop = 100;
  const toggleDrawer = () => {
    const nextExpanded = !expanded;
    setDrawerTransition({ from: drawerWidth,
      to: nextExpanded ? expandedDrawerWidth : collapsedDrawerWidth,
      startedAt: animationTime });
    setExpanded(nextExpanded);
  };
  return <Window title={`MGFX ${router.route === "dashboard" ? "Home" : "Graphics"}`}
    width={1100} height={700} minimumWidth={720} minimumHeight={520} mode={mode}
    chrome="overlay" draggableHeight={Math.max(82, chromeMetrics.titleBarHeight + 26)}>
    <Stack>
      <Column style={{ position: "absolute", inset: all(0),
        background: rgba(0.012, 0.018, 0.03),
        backgroundGrid: { spacing: 28, minorWidth: 0.8, majorWidth: 1.4, majorEvery: 5,
          offsetX: animationTime / 180, offsetY: animationTime / 260,
          minorColor: rgba(0.16, 0.28, 0.48, 0.14),
          majorColor: rgba(0.18, 0.48, 0.72, 0.22) } }} />
      <Row style={{ position: "absolute", inset: { top: 14, right: 20, left: 20 },
        preferredSize: { height: 72 }, zIndex: 40,
        padding: { top: 10, right: 14, bottom: 10,
          left: Math.max(82, chromeMetrics.leadingInset - 20) }, cornerRadius: 14,
        backgroundGradient: {
          start: rgba(0.31 + Math.sin(animationTime / 900) * 0.05, 0.13, 0.86),
          end: rgba(0.12, 0.48 + Math.cos(animationTime / 1100) * 0.06, 0.96),
          direction: "horizontal" }, mainAxisAlignment: "spaceBetween",
        crossAxisAlignment: "center" }}>
        <Text value={`MGFX React · ${router.route === "dashboard" ? "Home" : "Graphics"}`}
          style={{ fontSize: 30, fontFamily: "system", fontWeight: "semibold",
            letterSpacing: 0.5,
            ...(customFontResourceId === undefined ? {} : { fontResourceId: customFontResourceId }),
            color: rgba(0.9, 0.96, 1) }} />
        <Row style={{ gap: 10, crossAxisAlignment: "center" }}>
          <GradientCircleBadge time={animationTime} />
          <ConicBadge time={animationTime} />
          <Image textureId={1} sourceWidth={headerImageSize.width}
            sourceHeight={headerImageSize.height} fit="cover"
            style={{ preferredSize: { width: 52, height: 52 }, cornerRadius: 12,
              borderWidth: 2, borderColor: rgba(0.75, 0.92, 1) }} />
          <DotGrid time={animationTime} />
        </Row>
      </Row>
      {router.route === "dashboard"
        ? <Dashboard {...props} contentLeft={contentLeft} contentTop={contentTop}
            mode={mode} setMode={setMode} />
        : <GraphicsRoute {...props} contentLeft={contentLeft} contentTop={contentTop} />}
      <NavigationDrawer width={drawerWidth} expanded={expanded} onToggle={toggleDrawer}
        icons={vectorIcons} />
    </Stack>
  </Window>;
}

function Dashboard({ headerImageSize, contentLeft, contentTop, mode, setMode }: AppProps & {
  readonly contentLeft: number; readonly contentTop: number; readonly mode: WindowMode;
  readonly setMode: (update: WindowMode | ((value: WindowMode) => WindowMode)) => void;
}) {
  const [selected, setSelected] = useState(0);
  const [value, setValue] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const animationTime = useAnimationTime();
  const clipboard = useNativeClipboard();
  const router = useRouter();
  const cards = [
    ["REACT", rgba(0.95, 0.24, 0.2), rgba(1, 0.52, 0.2)],
    ["HOOKS", rgba(0.16, 0.78, 0.42), rgba(0.45, 1, 0.58)],
    ["MGFX", rgba(0.24, 0.48, 1), rgba(0.48, 0.72, 1)],
  ] as const;
  return (
    <>
    <Scroll style={{ position: "absolute", inset: all(0) }}>
    <Column style={{ padding: { top: contentTop, right: 20, bottom: 20, left: contentLeft },
      gap: 16, crossAxisAlignment: "stretch" }}>
      <Row style={{ gap: 16, crossAxisAlignment: "stretch" }}>
        {cards.map(([label, normal, active], index) => (
          <Button key={label} label={label} background={normal} activeBackground={active}
            active={selected === index} onPress={() => setSelected(index)}
            style={{ preferredSize: { width: 128, height: 116 }, flexGrow: 1,
              padding: all(18), cornerRadius: 14,
              backgroundRadialGradient: { inner: selected === index ? active : normal,
                outer: normal, centerX: 0.18, centerY: 0.12, radius: 240 },
              shadow: { color: rgba(0, 0, 0, selected === index ? 0.66 : 0.42),
                blur: selected === index ? 20 : 12, spread: selected === index ? 2 : 0,
                offsetY: 7 } }}
            textStyle={{ fontSize: 26, color: rgba(0.04, 0.05, 0.08) }} />
        ))}
      </Row>
      <TextField value={value} onChange={setValue} placeholder="TYPE INTO REACT" maxLength={28}
        textStyle={{ fontSize: 22 }} />
      <WavePattern time={animationTime} />
      <DiagonalPattern time={animationTime} />
      <ImagePreview time={animationTime} sourceSize={headerImageSize} />
      <ServerVectorPath time={animationTime} />
      <SvgDocumentPreview time={animationTime} />
      <Row style={{ gap: 12, crossAxisAlignment: "stretch" }}>
        <Stack style={{ preferredSize: { height: 48 }, padding: all(14), cornerRadius: 10,
          background: rgba(0.30, 0.32, 0.42), flexGrow: 1 }}>
          <Text value={`STATE CARD ${selected + 1}`} style={{ fontSize: 22 }} />
        </Stack>
        <Button label="COPY" disabled={!value} onPress={() => clipboard.writeClipboard(value)}
          background={rgba(0.20, 0.48, 0.52)}
          style={{ preferredSize: { width: 110, height: 48 } }} />
        <Button label="PASTE" onPress={() => {
          void clipboard.readClipboard().then((text) => setValue([...text].slice(0, 28).join("")));
        }} background={rgba(0.24, 0.44, 0.68)}
          style={{ preferredSize: { width: 110, height: 48 } }} />
        <Button label="DETAILS" onPress={() => router.push("graphics")}
          background={rgba(0.14, 0.54, 0.42)}
          style={{ preferredSize: { width: 110, height: 48 } }} />
        <Button label="DIALOG" onPress={() => setDialogOpen(true)}
          background={rgba(0.56, 0.30, 0.66)}
          style={{ preferredSize: { width: 110, height: 48 } }} />
        <Button label={mode === "fullscreen" ? "EXIT FULLSCREEN" : "FULLSCREEN"}
          onPress={() => setMode((value) => value === "fullscreen" ? "normal" : "fullscreen")}
          background={rgba(0.36, 0.22, 0.78)}
          style={{ preferredSize: { width: 190, height: 48 } }} />
      </Row>
    </Column>
    </Scroll>
    <Dialog open={dialogOpen} title="MODAL LAYER 1000" onDismiss={() => setDialogOpen(false)}>
      <Text value="ROUTE INPUT IS ISOLATED BEHIND THIS LAYER"
        style={{ fontSize: 22, color: rgba(0.68, 0.74, 0.86) }} />
      <Row style={{ gap: 12, crossAxisAlignment: "stretch" }}>
        <Button label="CLOSE" onPress={() => setDialogOpen(false)}
          style={{ preferredSize: { width: 150 } }} />
        <Button label="OPEN DETAILS" onPress={() => {
          setDialogOpen(false); router.push("graphics");
        }} background={rgba(0.16, 0.62, 0.48)} style={{ flexGrow: 1 }} />
      </Row>
    </Dialog>
    </>
  );
}

function GraphicsRoute({ vectorIcons, customFontResourceId, contentLeft, contentTop }: AppProps & {
  readonly contentLeft: number; readonly contentTop: number;
}) {
  const router = useRouter();
  const animationTime = useAnimationTime();
  return (
      <Scroll style={{ position: "absolute", inset: all(0) }}>
      <Column style={{ padding: { top: contentTop, right: 20, bottom: 20, left: contentLeft },
        gap: 22, crossAxisAlignment: "stretch" }}>
          <Row style={{ preferredSize: { height: 70 }, padding: all(16), cornerRadius: 14,
            backgroundGradient: { start: rgba(0.08, 0.46, 0.36),
              end: rgba(0.28, 0.12, 0.68), direction: "horizontal" },
            mainAxisAlignment: "spaceBetween", crossAxisAlignment: "center" }}>
            <Text value="Graphics Route — native glyph outlines" style={{ fontSize: 32,
              fontWeight: "bold",
              fontFamily: "rounded", color: rgba(0.9, 1, 0.97) }} />
            <Button label="BACK" onPress={router.back} background={rgba(0.08, 0.12, 0.20)}
              style={{ preferredSize: { width: 120, height: 42 } }} />
          </Row>
          <ServerVectorPath time={animationTime} />
          <IconGallery icons={vectorIcons} time={animationTime} />
          <Row style={{ preferredSize: { height: 92 }, padding: all(16), cornerRadius: 12,
            background: rgba(0.045, 0.065, 0.10), crossAxisAlignment: "center" }}>
            <Text value={"CoreText shaping: Árvíztűrő — Ω → MGFX. Exact native " +
              "metrics wrap this sentence in the language-neutral layout engine before compact " +
              "DrawText commands reach Metal."}
              style={{ fontSize: 26, lineHeight: 32, fontFamily: "serif", wrap: true,
                fontStyle: "italic",
                textAlign: "center",
                color: rgba(0.62, 0.88, 1) }} />
          </Row>
          <Column style={{ padding: all(22), gap: 12, cornerRadius: 16,
            background: rgba(0.055, 0.07, 0.11), borderWidth: 1,
            borderColor: rgba(0.22, 0.30, 0.46) }}>
            <RichText style={{ fontSize: 26, lineHeight: 34, wrap: true,
              textAlign: "center" }} spans={[
              { value: "RICH ", style: { fontWeight: "bold", color: rgba(0.62, 0.88, 1) } },
              { value: "TEXT ", style: { fontFamily: "serif", fontStyle: "italic",
                color: rgba(0.95, 0.62, 0.35) } },
              { value: "RUNS WRAP WITH EXACT NATIVE METRICS", style: {
                fontFamily: "system", fontWeight: "semibold",
                textDecoration: "underline", color: rgba(0.42, 0.92, 0.68),
                ...(customFontResourceId === undefined ? {} :
                  { fontResourceId: customFontResourceId }) } },
            ]} />
            <Text value="THIS SCREEN REPLACED THE ACTIVE REACT SUBTREE"
              style={{ fontSize: 22, color: rgba(0.68, 0.72, 0.82) }} />
            <Text value={`ROUTE ${router.route}  BACK ${router.canGoBack ? "READY" : "EMPTY"}`}
              style={{ fontSize: 22, color: rgba(0.42, 0.92, 0.68) }} />
          </Column>
      </Column>
      </Scroll>
  );
}
