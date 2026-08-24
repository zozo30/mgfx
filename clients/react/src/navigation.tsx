import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Key } from "@mgfx/demo-client/protocol";
import { Column, Path, Row, Text, all, rgba } from "./components.js";
import { useNativeCursor } from "./native-window.js";
import { useAnimationTime } from "./animation.js";

export interface Navigator {
  readonly route: string;
  readonly canGoBack: boolean;
  readonly push: (route: string) => void;
  readonly replace: (route: string) => void;
  readonly back: () => void;
}

const NavigationContext = createContext<Navigator | undefined>(undefined);

export function Router({ initialRoute, routes, children }: {
  readonly initialRoute: string;
  readonly routes: Readonly<Record<string, ReactNode>>;
  readonly children?: ReactNode;
}) {
  if (!(initialRoute in routes)) throw new Error(`Unknown initial route ${initialRoute}`);
  const [history, setHistory] = useState([initialRoute]);
  const route = history.at(-1)!;
  const navigator = useMemo<Navigator>(() => ({
    route, canGoBack: history.length > 1,
    push: (next) => {
      if (!(next in routes)) throw new Error(`Unknown route ${next}`);
      setHistory((current) => [...current, next]);
    },
    replace: (next) => {
      if (!(next in routes)) throw new Error(`Unknown route ${next}`);
      setHistory((current) => [...current.slice(0, -1), next]);
    },
    back: () => setHistory((current) => current.length > 1 ? current.slice(0, -1) : current),
  }), [history.length, route, routes]);
  return <NavigationContext value={navigator}>{children ?? routes[route]}</NavigationContext>;
}

export function useRouter(): Navigator {
  const navigator = useContext(NavigationContext);
  if (!navigator) throw new Error("useRouter must be used inside Router");
  return navigator;
}

export interface MenuItem {
  readonly label: string;
  readonly detail?: string;
  readonly disabled?: boolean;
}

export function nextMenuIndex(items: readonly MenuItem[], current: number, delta: number): number {
  if (items.length === 0 || items.every((item) => item.disabled)) return -1;
  let next = current < 0 ? (delta < 0 ? 0 : items.length - 1) : current;
  for (let index = 0; index < items.length; index += 1) {
    next = (next + delta + items.length) % items.length;
    if (!items[next]!.disabled) return next;
  }
  return -1;
}

function MenuOption({ item, active, onSelect, onPrevious, onNext, onDismiss }: {
  readonly item: MenuItem; readonly active: boolean; readonly onSelect: () => void;
  readonly onPrevious: () => void; readonly onNext: () => void; readonly onDismiss: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);
  useNativeCursor("pointer", hovered && !item.disabled);
  const activate = () => { if (!item.disabled) onSelect(); };
  return <mgfx-row onClick={activate} onHoverChange={setHovered} onPressChange={setPressed}
    onKeyDown={(key) => {
      if (key === Key.Escape) onDismiss();
      if (key === Key.ArrowUp) onPrevious();
      if (key === Key.ArrowDown) onNext();
      if ((key === Key.Enter || key === Key.Space) && !item.disabled) onSelect();
    }} style={{ preferredSize: { height: item.detail ? 58 : 46 }, padding: all(10), gap: 11,
      cornerRadius: 9, crossAxisAlignment: "center", opacity: item.disabled ? 0.42 : 1,
      background: pressed ? rgba(0.08, 0.20, 0.31)
        : active ? rgba(0.12, 0.30, 0.46) : hovered ? rgba(0.08, 0.14, 0.23)
          : rgba(0.03, 0.045, 0.075) }}>
    <Column style={{ flexGrow: 1, gap: 3 }}>
      <Text value={item.label} style={{ fontSize: 19, fontWeight: active ? "bold" : "medium",
        color: active ? rgba(0.72, 0.94, 1) : rgba(0.76, 0.82, 0.91) }} />
      {item.detail ? <Text value={item.detail} style={{ fontSize: 15,
        color: rgba(0.48, 0.58, 0.72) }} /> : null}
    </Column>
    {active ? <Path data="M5 12L10 17L19 7" viewBox={{ x: 0, y: 0, width: 24, height: 24 }}
      strokeColor={rgba(0.42, 0.92, 0.78)} strokeWidth={2.4}
      style={{ preferredSize: { width: 24, height: 24 } }} /> : null}
  </mgfx-row>;
}

export function Menu({ open, items, activeIndex, onActiveChange, onSelect, onDismiss,
  top, right, width = 310 }: {
  readonly open: boolean; readonly items: readonly MenuItem[]; readonly activeIndex: number;
  readonly onActiveChange: (index: number) => void; readonly onSelect: (index: number) => void;
  readonly onDismiss: () => void; readonly top: number; readonly right: number;
  readonly width?: number;
}) {
  if (!open) return null;
  const move = (delta: number) => {
    const next = nextMenuIndex(items, activeIndex, delta);
    if (next >= 0) onActiveChange(next);
  };
  return <mgfx-stack onClick={onDismiss} style={{ position: "absolute", inset: all(0),
    zIndex: 1800, modal: true }}>
    <mgfx-column onClick={() => {}} style={{ position: "absolute", inset: { top, right },
      preferredSize: { width }, padding: all(7), gap: 4, cornerRadius: 14,
      background: rgba(0.018, 0.028, 0.052, 0.99), borderWidth: 1.5,
      borderColor: rgba(0.28, 0.50, 0.76),
      shadow: { color: rgba(0, 0, 0, 0.62), blur: 22, spread: 2, offsetY: 8 } }}>
      {items.map((item, index) => <MenuOption key={item.label} item={item}
        active={index === activeIndex} onSelect={() => { onSelect(index); onDismiss(); }}
        onPrevious={() => move(-1)} onNext={() => move(1)} onDismiss={onDismiss} />)}
    </mgfx-column>
  </mgfx-stack>;
}

export function Dialog({ open, title, onDismiss, children, width = 520,
  zIndex = 1000 }: {
  readonly open: boolean;
  readonly title: string;
  readonly onDismiss: () => void;
  readonly children?: ReactNode;
  readonly width?: number;
  readonly zIndex?: number;
}) {
  if (!open) return null;
  return (
    <mgfx-column onClick={onDismiss} style={{ position: "absolute",
      inset: all(0), zIndex, modal: true, background: rgba(0.005, 0.008, 0.015, 0.72),
      mainAxisAlignment: "center", crossAxisAlignment: "center" }}>
      <mgfx-column onClick={() => {}} style={{ preferredSize: { width }, padding: all(24), gap: 18,
        cornerRadius: 18, background: rgba(0.055, 0.07, 0.12, 0.98),
        borderWidth: 2, borderColor: rgba(0.42, 0.62, 1, 0.8) }}>
        <Text value={title} style={{ fontSize: 28, fontWeight: "bold",
          color: rgba(0.82, 0.91, 1) }} />
        {children}
      </mgfx-column>
    </mgfx-column>
  );
}

export function toastAnimation(age: number, duration: number): {
  readonly opacity: number; readonly translateY: number } {
  const enter = Math.max(0, Math.min(1, age / 220));
  const exit = Math.max(0, Math.min(1, (duration - age) / 240));
  const opacity = Math.min(enter, exit);
  const eased = 1 - Math.pow(1 - enter, 3);
  return { opacity, translateY: (1 - eased) * 22 };
}

export function Toast({ open, message, onDismiss, variant = "info", duration = 3200 }: {
  readonly open: boolean; readonly message: string; readonly onDismiss: () => void;
  readonly variant?: "info" | "success" | "error"; readonly duration?: number;
}) {
  const time = useAnimationTime();
  const previousOpen = useRef(open);
  const openedAt = useRef(time);
  if (open && !previousOpen.current) openedAt.current = time;
  if (!open) openedAt.current = time;
  previousOpen.current = open;
  const age = Math.max(0, time - openedAt.current);
  useEffect(() => {
    if (open && age >= duration) onDismiss();
  }, [age, duration, onDismiss, open]);
  if (!open) return null;
  const presentation = toastAnimation(age, duration);
  const accent = variant === "success" ? rgba(0.24, 0.92, 0.62)
    : variant === "error" ? rgba(1, 0.34, 0.32) : rgba(0.32, 0.72, 1);
  const title = variant === "success" ? "SUCCESS" : variant === "error" ? "ERROR" : "INFO";
  return <mgfx-row onClick={onDismiss} style={{ position: "absolute",
    inset: { right: 28, bottom: 28 }, preferredSize: { width: 390, height: 72 },
    zIndex: 2200, opacity: presentation.opacity,
    transform: { translateY: presentation.translateY }, padding: all(12), gap: 13,
    cornerRadius: 14, crossAxisAlignment: "center",
    background: rgba(0.025, 0.04, 0.07, 0.98), borderWidth: 1.5, borderColor: accent,
    shadow: { color: rgba(0, 0, 0, 0.58), blur: 20, spread: 2, offsetY: 7 } }}>
    <Column style={{ preferredSize: { width: 6, height: 44 }, cornerRadius: 3,
      background: accent }} />
    <Column style={{ gap: 4, flexGrow: 1 }}>
      <Text value={title} style={{ fontSize: 17, fontWeight: "bold", color: accent }} />
      <Text value={message} style={{ fontSize: 19, color: rgba(0.80, 0.86, 0.94) }} />
    </Column>
    <Text value="×" style={{ fontSize: 24, color: rgba(0.52, 0.60, 0.72) }} />
  </mgfx-row>;
}
