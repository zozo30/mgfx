import { useState, type ReactNode } from "react";
import { Key, type Color } from "@mgfx/demo-client/protocol";
import type { Style, TextStyle } from "@mgfx/demo-client/ui";
import { useNativeClipboard, useNativeCursor } from "./native-window.js";

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
export const Image = ({ textureId, style }: {
  readonly textureId: number; readonly style?: Style;
}) => <mgfx-box style={{ ...style, backgroundImage: { textureId } }} />;

export function Text({ value, style }: {
  readonly value: string;
  readonly style?: TextStyle;
}) {
  return <mgfx-text value={value} textStyle={style ?? {}} />;
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
    <mgfx-stack {...handlers} style={{ preferredSize: { height: 48 }, padding: all(14),
      cornerRadius: 10, clip: true, ...style, background: color }}>
      <Text value={label} style={textStyle ?? {}} />
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
  const clipboard = useNativeClipboard();
  useNativeCursor("text", hovered);
  const displayed = value || placeholder;
  const color = value ? textStyle?.color ?? rgba(1, 1, 1) : rgba(0.55, 0.60, 0.70);
  return (
    <mgfx-stack style={{ preferredSize: { height: 48 }, padding: all(14), cornerRadius: 10,
      clip: true, background: focused ? rgba(0.16, 0.28, 0.52) : rgba(0.12, 0.14, 0.21),
      borderWidth: focused ? 2 : 1,
      borderColor: focused ? rgba(0.38, 0.62, 1) : rgba(0.24, 0.28, 0.38), ...style }}
      onHoverChange={setHovered}
      onFocusChange={setFocused}
      onTextInput={(text) => onChange([...value, ...text].slice(0, maxLength).join(""))}
      onKeyDown={(key) => {
        if (key === Key.Backspace && value.length > 0) {
          onChange([...value].slice(0, -1).join(""));
        } else if (key === Key.Copy) {
          clipboard.writeClipboard(value);
        } else if (key === Key.Cut) {
          clipboard.writeClipboard(value);
          onChange("");
        } else if (key === Key.Paste) {
          void clipboard.readClipboard().then((text) => {
            onChange([...value, ...text].slice(0, maxLength).join(""));
          });
        }
      }}>
      <Text value={displayed} style={{ ...textStyle, color }} />
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
