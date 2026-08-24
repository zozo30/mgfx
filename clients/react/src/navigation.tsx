import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { Text, all, rgba } from "./components.js";

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
