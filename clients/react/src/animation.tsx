import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { AnimationClock } from "@mgfx/demo-client/protocol";

const AnimationContext = createContext<AnimationClock | null>(null);

export function AnimationProvider({ clock, children }: {
  readonly clock: AnimationClock;
  readonly children: ReactNode;
}) {
  return <AnimationContext.Provider value={clock}>{children}</AnimationContext.Provider>;
}

export function useAnimationTime(enabled = true): number {
  const clock = useContext(AnimationContext);
  const [time, setTime] = useState(0);
  useEffect(() => {
    if (!clock || !enabled) return;
    let active = true;
    let cancel = () => {};
    const tick = (next: number) => {
      if (!active) return;
      setTime(next);
      cancel = clock.request(tick);
    };
    cancel = clock.request(tick);
    return () => { active = false; cancel(); };
  }, [clock, enabled]);
  return time;
}
