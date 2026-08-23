import { createContext, useContext, useLayoutEffect, type ReactNode } from "react";
import type { CursorShape, WindowChromeMode, WindowConfig, WindowMode, WindowState } from "@mgfx/demo-client/protocol";

export interface NativeWindowCommands {
  readonly setTitle: (title: string) => void;
  readonly configure: (config: WindowConfig) => void;
  readonly setState: (state: WindowState) => void;
  readonly setCursor: (cursor: CursorShape) => void;
  readonly writeClipboard: (text: string) => void;
  readonly readClipboard: () => Promise<string>;
  readonly setChrome: (mode: WindowChromeMode, draggableHeight: number) => void;
}

const noCommands: NativeWindowCommands = {
  setTitle: () => {}, configure: () => {}, setState: () => {}, setCursor: () => {},
  writeClipboard: () => {}, readClipboard: async () => "",
  setChrome: () => {},
};
const NativeWindowContext = createContext<NativeWindowCommands>(noCommands);

export function NativeWindowProvider({ commands, children }: {
  readonly commands: NativeWindowCommands;
  readonly children?: ReactNode;
}) {
  return <NativeWindowContext value={commands}>{children}</NativeWindowContext>;
}

export interface WindowProps {
  readonly title: string;
  readonly width: number;
  readonly height: number;
  readonly minimumWidth?: number;
  readonly minimumHeight?: number;
  readonly mode?: WindowMode;
  readonly resizable?: boolean;
  readonly chrome?: WindowChromeMode;
  readonly draggableHeight?: number;
  readonly children: ReactNode;
}

export function Window({ title, width, height, minimumWidth = 320,
  minimumHeight = 240, mode = "normal", resizable = true, chrome = "native",
  draggableHeight = 0, children }: WindowProps) {
  const commands = useContext(NativeWindowContext);
  useLayoutEffect(() => {
    commands.setTitle(title);
  }, [commands, title]);
  useLayoutEffect(() => {
    commands.configure({ width, height, minimumWidth, minimumHeight });
  }, [commands, width, height, minimumWidth, minimumHeight]);
  useLayoutEffect(() => {
    commands.setState({ mode, resizable });
  }, [commands, mode, resizable]);
  useLayoutEffect(() => {
    commands.setChrome(chrome, draggableHeight);
  }, [chrome, commands, draggableHeight]);
  return children;
}

export function useNativeCursor(cursor: CursorShape, active: boolean): void {
  const commands = useContext(NativeWindowContext);
  useLayoutEffect(() => {
    if (!active) return;
    commands.setCursor(cursor);
    return () => { commands.setCursor("arrow"); };
  }, [active, commands, cursor]);
}

export function useNativeClipboard(): Pick<NativeWindowCommands,
  "writeClipboard" | "readClipboard"> {
  const commands = useContext(NativeWindowContext);
  return { writeClipboard: commands.writeClipboard, readClipboard: commands.readClipboard };
}
