import { useEffect, useState } from "react";
import type { AnimationClock, WindowChromeMetrics, WindowMode } from "@mgfx/demo-client/protocol";
import { Box, Button, Circle, Column, Image, Path, Row, Stack, Text, TextField, all, rgba } from "./components.js";
import { Window, useNativeClipboard } from "./native-window.js";
import type { VectorIcon } from "./icon-pack.js";
import { Dialog, Router, useRouter } from "./navigation.js";

export function DotGrid({ time }: { readonly time: number }) {
  const ink = rgba(0.55, 0.86, 0.68);
  const highlight = rgba(0.82, 1.0, 0.88);
  const activeDot = Math.floor(time / 140) % 16;
  const pattern = [false, true, false, true, false, false, true, false,
    true, false, false, false, false, true, false, true];
  return (
    <Column style={{ preferredSize: { width: 52, height: 52 }, padding: all(5), gap: 3,
      background: rgba(0.04, 0.12, 0.09), borderWidth: 3, borderColor: ink,
      mainAxisAlignment: "center", crossAxisAlignment: "stretch", clip: true }}>
      {Array.from({ length: 4 }, (_, rowIndex) => (
        <Row key={`dot-row-${rowIndex}`}
          style={{ mainAxisAlignment: "spaceBetween", crossAxisAlignment: "center" }}>
          {Array.from({ length: 4 }, (_, columnIndex) => {
            const filled = pattern[rowIndex * 4 + columnIndex]!;
            const highlighted = rowIndex * 4 + columnIndex === activeDot;
            return <Circle key={`dot-${rowIndex}-${columnIndex}`} style={{
              preferredSize: { width: 8, height: 8 },
              background: highlighted ? highlight : filled ? ink : rgba(0, 0, 0, 0),
              borderWidth: highlighted || filled ? 0 : 2, borderColor: ink,
            }} />;
          })}
        </Row>
      ))}
    </Column>
  );
}

export function WavePattern({ time }: { readonly time: number }) {
  return (
    <Row style={{ preferredSize: { height: 70 }, padding: all(12), gap: 10,
      cornerRadius: 14, clip: true,
      backgroundGradient: {
        start: rgba(0.055, 0.08, 0.16), end: rgba(0.12, 0.17, 0.34),
        direction: "diagonal",
      },
      crossAxisAlignment: "center", mainAxisAlignment: "spaceBetween" }}>
      {Array.from({ length: 24 }, (_, index) => {
        const phase = time / 240 + index * 0.56;
        const wave = (Math.sin(phase) + 1) / 2;
        const size = 7 + wave * 23;
        return <Circle key={`wave-${index}`} style={{
          preferredSize: { width: size, height: size },
          backgroundGradient: {
            start: rgba(0.22 + wave * 0.34, 0.36, 1),
            end: rgba(0.16, 1, 0.62 + wave * 0.2), direction: "diagonal",
          },
          borderWidth: 1, borderColor: rgba(0.72, 0.94, 1, 0.65),
        }} />;
      })}
    </Row>
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
          direction: "forward", offset: time / 18,
        },
        borderWidth: 2, borderColor: rgba(0.72, 0.76, 0.82) }} />
    </Row>
  );
}

function ImagePreview({ sourceSize }: {
  readonly sourceSize: { readonly width: number; readonly height: number };
}) {
  return (
    <Row style={{ preferredSize: { height: 126 }, padding: all(12), gap: 18,
      background: rgba(0.035, 0.045, 0.07), crossAxisAlignment: "center" }}>
      <Stack style={{ preferredSize: { width: 220 }, padding: all(8) }}>
        <Text value="PERSISTENT IMAGE / SVG" style={{ fontSize: 22, fontWeight: "bold",
          color: rgba(0.82, 0.86, 0.94) }} />
      </Stack>
      <Image textureId={1} sourceWidth={sourceSize.width} sourceHeight={sourceSize.height}
        fit="contain" style={{ preferredSize: { height: 102 }, flexGrow: 1,
          background: rgba(0.015, 0.02, 0.03) }} />
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
        gradient={{ start: { x: 4, y: 50 }, end: { x: 316, y: 50 },
          startColor: rgba(0.04, 0.32 + pulse * 0.2, 0.44 + pulse * 0.18,
            0.48 + pulse * 0.28),
          endColor: rgba(0.54 + pulse * 0.18, 0.18, 0.92, 0.82) }}
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
          style={{ preferredSize: { width: 76, height: 76 } }} />)}
      </Row>
    </Row>
  );
}

interface AppProps {
  readonly animationClock: AnimationClock;
  readonly chromeMetrics: WindowChromeMetrics;
  readonly headerImageSize: { readonly width: number; readonly height: number };
  readonly vectorIcons: readonly VectorIcon[];
}

export function App(props: AppProps) {
  return <Router initialRoute="dashboard" routes={{
    dashboard: <Dashboard {...props} />,
    graphics: <GraphicsRoute {...props} />,
  }} />;
}

function Dashboard({ animationClock, chromeMetrics, headerImageSize, vectorIcons }: AppProps) {
  const [selected, setSelected] = useState(0);
  const [value, setValue] = useState("");
  const [mode, setMode] = useState<WindowMode>("normal");
  const [dialogOpen, setDialogOpen] = useState(false);
  const animationTime = useAnimationTime(animationClock);
  const clipboard = useNativeClipboard();
  const router = useRouter();
  const cards = [
    ["REACT", rgba(0.95, 0.24, 0.2), rgba(1, 0.52, 0.2)],
    ["HOOKS", rgba(0.16, 0.78, 0.42), rgba(0.45, 1, 0.58)],
    ["MGFX", rgba(0.24, 0.48, 1), rgba(0.48, 0.72, 1)],
  ] as const;
  return (
    <Window title="MGFX React Native Window" width={1100} height={700}
      minimumWidth={720} minimumHeight={520} mode={mode}
      chrome="overlay" draggableHeight={Math.max(82, chromeMetrics.titleBarHeight + 26)}>
    <Stack>
    <Column style={{ position: "absolute", inset: all(0),
      padding: { top: 14, right: 20, bottom: 20, left: 20 }, gap: 16,
      crossAxisAlignment: "stretch" }}>
      <Row style={{ preferredSize: { height: 72 },
        padding: { top: 14, right: 14, bottom: 14,
          left: Math.max(82, chromeMetrics.leadingInset - 20) }, cornerRadius: 14,
        backgroundGradient: {
          start: rgba(0.31 + Math.sin(animationTime / 900) * 0.05, 0.13, 0.86),
          end: rgba(0.12, 0.48 + Math.cos(animationTime / 1100) * 0.06, 0.96),
          direction: "horizontal",
        },
        mainAxisAlignment: "spaceBetween",
        crossAxisAlignment: "center" }}>
        <Text value="MGFX React" style={{ fontSize: 32, fontFamily: "system", fontWeight: "bold",
          color: rgba(0.9, 0.96, 1) }} />
        <Row style={{ gap: 10, crossAxisAlignment: "center" }}>
          <Image textureId={1} sourceWidth={headerImageSize.width}
            sourceHeight={headerImageSize.height} fit="cover"
            style={{ preferredSize: { width: 52, height: 52 },
            borderWidth: 2, borderColor: rgba(0.75, 0.92, 1) }} />
          <DotGrid time={animationTime} />
        </Row>
      </Row>
      <Row style={{ gap: 16, crossAxisAlignment: "stretch" }}>
        {cards.map(([label, normal, active], index) => (
          <Button key={label} label={label} background={normal} activeBackground={active}
            active={selected === index} onPress={() => setSelected(index)}
            style={{ preferredSize: { width: 128, height: 116 }, flexGrow: 1,
              padding: all(18), cornerRadius: 14 }}
            textStyle={{ fontSize: 26, color: rgba(0.04, 0.05, 0.08) }} />
        ))}
      </Row>
      <TextField value={value} onChange={setValue} placeholder="TYPE INTO REACT" maxLength={28}
        textStyle={{ fontSize: 22 }} />
      <WavePattern time={animationTime} />
      <DiagonalPattern time={animationTime} />
      <ImagePreview sourceSize={headerImageSize} />
      <ServerVectorPath time={animationTime} />
      <IconGallery icons={vectorIcons} time={animationTime} />
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
    </Stack>
    </Window>
  );
}

function GraphicsRoute({ animationClock, chromeMetrics, vectorIcons }: AppProps) {
  const router = useRouter();
  const animationTime = useAnimationTime(animationClock);
  const draggableHeight = Math.max(82, chromeMetrics.titleBarHeight + 26);
  return (
    <Window title="MGFX Graphics Route" width={1100} height={700}
      minimumWidth={720} minimumHeight={520} chrome="overlay"
      draggableHeight={draggableHeight}>
      <Stack>
        <Column style={{ position: "absolute", inset: all(0),
          padding: { top: draggableHeight + 14, right: 28, bottom: 28, left: 28 }, gap: 22,
          crossAxisAlignment: "stretch" }}>
          <Row style={{ preferredSize: { height: 70 }, padding: all(16), cornerRadius: 14,
            backgroundGradient: { start: rgba(0.08, 0.46, 0.36),
              end: rgba(0.28, 0.12, 0.68), direction: "horizontal" },
            mainAxisAlignment: "spaceBetween", crossAxisAlignment: "center" }}>
            <Text value="Graphics Route — native glyph outlines" style={{ fontSize: 32,
              fontWeight: "bold",
              fontFamily: "system", color: rgba(0.9, 1, 0.97) }} />
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
              style={{ fontSize: 26, lineHeight: 32, fontFamily: "system", wrap: true,
                textAlign: "center",
                color: rgba(0.62, 0.88, 1) }} />
          </Row>
          <Column style={{ padding: all(22), gap: 12, cornerRadius: 16,
            background: rgba(0.055, 0.07, 0.11), borderWidth: 1,
            borderColor: rgba(0.22, 0.30, 0.46) }}>
            <Text value="HISTORY ROUTER" style={{ fontSize: 26, fontWeight: "bold",
              color: rgba(0.62, 0.88, 1) }} />
            <Text value="THIS SCREEN REPLACED THE ACTIVE REACT SUBTREE"
              style={{ fontSize: 22, color: rgba(0.68, 0.72, 0.82) }} />
            <Text value={`ROUTE ${router.route}  BACK ${router.canGoBack ? "READY" : "EMPTY"}`}
              style={{ fontSize: 22, color: rgba(0.42, 0.92, 0.68) }} />
          </Column>
        </Column>
      </Stack>
    </Window>
  );
}

function useAnimationTime(clock: AnimationClock): number {
  const [time, setTime] = useState(0);
  useEffect(() => {
    let active = true;
    let cancel = () => {};
    const tick = (next: number) => {
      if (!active) return;
      setTime(next);
      cancel = clock.request(tick);
    };
    cancel = clock.request(tick);
    return () => { active = false; cancel(); };
  }, [clock]);
  return time;
}
