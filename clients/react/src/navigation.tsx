import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Key } from "@mgfx/demo-client/protocol";
import { Column, Path, Row, Text, TextField, all, rgba } from "./components.js";
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

export interface CommandItem {
  readonly id: string;
  readonly label: string;
  readonly detail: string;
  readonly keywords?: readonly string[];
}

export function filterCommands(items: readonly CommandItem[], query: string): readonly CommandItem[] {
  const tokens = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return items;
  return items.filter((item) => {
    const searchable = [item.label, item.detail, ...(item.keywords ?? [])]
      .join(" ").toLocaleLowerCase();
    return tokens.every((token) => searchable.includes(token));
  });
}

function CommandOption({ item, active, onSelect, onActivate }: {
  readonly item: CommandItem; readonly active: boolean; readonly onSelect: () => void;
  readonly onActivate: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);
  useNativeCursor("pointer", hovered);
  return <mgfx-row onClick={onSelect} onHoverChange={(value) => {
    setHovered(value); if (value) onActivate();
  }} onPressChange={setPressed} style={{ preferredSize: { height: 62 }, padding: all(12), gap: 14,
    cornerRadius: 10, crossAxisAlignment: "center",
    background: pressed ? rgba(0.10, 0.25, 0.38)
      : active ? rgba(0.12, 0.30, 0.46) : rgba(0.035, 0.052, 0.085) }}>
    <Column style={{ preferredSize: { width: 34, height: 34 }, cornerRadius: 9,
      mainAxisAlignment: "center", crossAxisAlignment: "center",
      background: active ? rgba(0.22, 0.58, 0.78) : rgba(0.10, 0.16, 0.25) }}>
      <Text value="›" style={{ fontSize: 27, color: rgba(0.78, 0.94, 1), textAlign: "center" }} />
    </Column>
    <Column style={{ flexGrow: 1, gap: 3 }}>
      <Text value={item.label} style={{ fontSize: 20, fontWeight: "semibold",
        color: active ? rgba(0.84, 0.96, 1) : rgba(0.76, 0.83, 0.92) }} />
      <Text value={item.detail} style={{ fontSize: 15, color: rgba(0.50, 0.60, 0.73) }} />
    </Column>
    {active ? <Text value="ENTER" style={{ fontSize: 14, fontWeight: "bold",
      color: rgba(0.42, 0.88, 0.76) }} /> : null}
  </mgfx-row>;
}

export function CommandPalette({ open, commands, onSelect, onDismiss }: {
  readonly open: boolean; readonly commands: readonly CommandItem[];
  readonly onSelect: (command: CommandItem) => void; readonly onDismiss: () => void;
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const results = filterCommands(commands, query);
  useEffect(() => { setActive(0); }, [query, open]);
  if (!open) return null;
  const choose = (item: CommandItem) => { onSelect(item); onDismiss(); setQuery(""); };
  return <mgfx-column onClick={onDismiss} style={{ position: "absolute", inset: all(0),
    zIndex: 2400, modal: true, background: rgba(0.004, 0.008, 0.018, 0.76),
    mainAxisAlignment: "center", crossAxisAlignment: "center" }}>
    <mgfx-column onClick={() => {}} style={{ preferredSize: { width: 680, height: 500 },
      padding: all(20), gap: 14, cornerRadius: 18, crossAxisAlignment: "stretch",
      background: rgba(0.025, 0.038, 0.068, 0.995), borderWidth: 2,
      borderColor: rgba(0.32, 0.62, 0.92),
      shadow: { color: rgba(0.08, 0.34, 0.72, 0.30), blur: 32, spread: 4, offsetY: 10 } }}>
      <Row style={{ mainAxisAlignment: "spaceBetween", crossAxisAlignment: "center" }}>
        <Column style={{ gap: 3 }}>
          <Text value="COMMAND PALETTE" style={{ fontSize: 27, fontWeight: "bold",
            color: rgba(0.78, 0.92, 1) }} />
          <Text value="SEARCH NATIVE ACTIONS" style={{ fontSize: 15,
            color: rgba(0.46, 0.68, 0.84) }} />
        </Column>
        <Text value="ESC" style={{ fontSize: 15, fontWeight: "bold",
          color: rgba(0.52, 0.62, 0.74) }} />
      </Row>
      <TextField value={query} onChange={setQuery} placeholder="Type a command…"
        style={{ preferredSize: { height: 54 }, background: rgba(0.055, 0.08, 0.13) }}
        textStyle={{ fontSize: 21 }} onKeyDown={(key) => {
          if (key === Key.Escape) onDismiss();
          if (key === Key.ArrowDown && results.length > 0)
            setActive((current) => (current + 1) % results.length);
          if (key === Key.ArrowUp && results.length > 0)
            setActive((current) => (current - 1 + results.length) % results.length);
          if (key === Key.Enter && results[active]) choose(results[active]!);
        }} />
      <Column style={{ gap: 6, flexGrow: 1, crossAxisAlignment: "stretch" }}>
        {results.slice(0, 5).map((item, index) => <CommandOption key={item.id} item={item}
          active={index === active} onActivate={() => setActive(index)}
          onSelect={() => choose(item)} />)}
        {results.length === 0 ? <Column style={{ flexGrow: 1, mainAxisAlignment: "center",
          crossAxisAlignment: "center", gap: 8 }}>
          <Text value="NO MATCHING COMMANDS" style={{ fontSize: 21, fontWeight: "semibold",
            color: rgba(0.58, 0.68, 0.80) }} />
          <Text value="TRY ROUTE, GRAPHICS, OR COMPONENT" style={{ fontSize: 16,
            color: rgba(0.38, 0.48, 0.62) }} />
        </Column> : null}
      </Column>
    </mgfx-column>
  </mgfx-column>;
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
