import type { MeshData, PathData, Style, TextStyle } from "@mgfx/demo-client/ui";
import type { Key } from "@mgfx/demo-client/protocol";
import type { Key as ReactKey, ReactNode } from "react";

export interface MGFXProps {
  readonly key?: ReactKey | null;
  readonly children?: ReactNode;
  readonly style?: Style;
  readonly value?: string;
  readonly textStyle?: TextStyle;
  readonly offsetY?: number;
  readonly onClick?: () => void;
  readonly onHoverChange?: (hovered: boolean) => void;
  readonly onPressChange?: (pressed: boolean) => void;
  readonly onFocusChange?: (focused: boolean) => void;
  readonly onScroll?: (deltaX: number, deltaY: number) => void;
  readonly onKeyDown?: (key: Key) => void;
  readonly onTextInput?: (text: string) => void;
  readonly mesh?: MeshData;
  readonly path?: PathData;
}

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "mgfx-box": MGFXProps;
      "mgfx-row": MGFXProps;
      "mgfx-column": MGFXProps;
      "mgfx-stack": MGFXProps;
      "mgfx-circle": MGFXProps;
      "mgfx-text": MGFXProps;
      "mgfx-scroll": MGFXProps;
      "mgfx-mesh": MGFXProps;
      "mgfx-path": MGFXProps;
    }
  }
}
