import { useEffect, useState } from "react";
import type { AnimationClock, WindowChromeMetrics, WindowMode } from "@mgfx/demo-client/protocol";
import { Box, Button, Circle, Column, Image, Row, Stack, Text, TextField, all, rgba } from "./components.js";
import { Window, useNativeClipboard } from "./native-window.js";

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
        <Text value="DIAGONAL AREA PATTERN" style={{ fontSize: 14,
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

export function App({ animationClock, chromeMetrics }: {
  readonly animationClock: AnimationClock;
  readonly chromeMetrics: WindowChromeMetrics;
}) {
  const [selected, setSelected] = useState(0);
  const [value, setValue] = useState("");
  const [mode, setMode] = useState<WindowMode>("normal");
  const animationTime = useAnimationTime(animationClock);
  const clipboard = useNativeClipboard();
  const cards = [
    ["REACT", rgba(0.95, 0.24, 0.2), rgba(1, 0.52, 0.2)],
    ["HOOKS", rgba(0.16, 0.78, 0.42), rgba(0.45, 1, 0.58)],
    ["MGFX", rgba(0.24, 0.48, 1), rgba(0.48, 0.72, 1)],
  ] as const;
  return (
    <Window title="MGFX React Native Window" width={1100} height={700}
      minimumWidth={720} minimumHeight={520} mode={mode}
      chrome="overlay" draggableHeight={Math.max(82, chromeMetrics.titleBarHeight + 26)}>
    <Column style={{ padding: { top: 14, right: 20, bottom: 20, left: 20 }, gap: 16,
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
        <Text value="MGFX REACT" style={{ fontSize: 24 }} />
        <Row style={{ gap: 10, crossAxisAlignment: "center" }}>
          <Image textureId={1} style={{ preferredSize: { width: 52, height: 52 },
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
            textStyle={{ fontSize: 18, color: rgba(0.04, 0.05, 0.08) }} />
        ))}
      </Row>
      <TextField value={value} onChange={setValue} placeholder="TYPE INTO REACT" maxLength={28}
        textStyle={{ fontSize: 16 }} />
      <WavePattern time={animationTime} />
      <DiagonalPattern time={animationTime} />
      <Row style={{ gap: 12, crossAxisAlignment: "stretch" }}>
        <Stack style={{ preferredSize: { height: 48 }, padding: all(14), cornerRadius: 10,
          background: rgba(0.30, 0.32, 0.42), flexGrow: 1 }}>
          <Text value={`STATE CARD ${selected + 1}`} style={{ fontSize: 14 }} />
        </Stack>
        <Button label="COPY" disabled={!value} onPress={() => clipboard.writeClipboard(value)}
          background={rgba(0.20, 0.48, 0.52)}
          style={{ preferredSize: { width: 110, height: 48 } }} />
        <Button label="PASTE" onPress={() => {
          void clipboard.readClipboard().then((text) => setValue([...text].slice(0, 28).join("")));
        }} background={rgba(0.24, 0.44, 0.68)}
          style={{ preferredSize: { width: 110, height: 48 } }} />
        <Button label={mode === "fullscreen" ? "EXIT FULLSCREEN" : "FULLSCREEN"}
          onPress={() => setMode((value) => value === "fullscreen" ? "normal" : "fullscreen")}
          background={rgba(0.36, 0.22, 0.78)}
          style={{ preferredSize: { width: 190, height: 48 } }} />
      </Row>
    </Column>
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
