import type { MeshData, PathData, Point, RichTextSpan, Style, TextStyle,
  VectorImageData, VectorRichTextData, VectorTextData } from "@mgfx/demo-client/ui";
import type { EmbeddedTexture } from "./embedded-texture.js";
import type { Key } from "@mgfx/demo-client/protocol";
import type { Key as ReactKey, ReactNode } from "react";

export interface MGFXProps {
  readonly key?: ReactKey | null;
  readonly children?: ReactNode;
  readonly style?: Style;
  readonly value?: string;
  readonly textStyle?: TextStyle;
  readonly offsetY?: number;
  readonly autoFocus?: boolean;
  readonly onClick?: () => void;
  readonly onHoverChange?: (hovered: boolean) => void;
  readonly onPressChange?: (pressed: boolean) => void;
  readonly onFocusChange?: (focused: boolean) => void;
  readonly onPointerDown?: (point: Point) => void;
  readonly onPointerMove?: (point: Point) => void;
  readonly onPointerUp?: (point: Point) => void;
  readonly onScroll?: (deltaX: number, deltaY: number) => void;
  readonly onKeyDown?: (key: Key, modifiers: number) => void;
  readonly onTextInput?: (text: string) => void;
  readonly mesh?: MeshData;
  readonly path?: PathData;
  readonly vectorText?: VectorTextData;
  readonly vectorRichText?: VectorRichTextData;
  readonly vectorImage?: VectorImageData;
  readonly textureResource?: EmbeddedTexture;
  readonly richTextSpans?: readonly RichTextSpan[];
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
      "mgfx-rich-text": MGFXProps;
      "mgfx-scroll": MGFXProps;
      "mgfx-mesh": MGFXProps;
      "mgfx-path": MGFXProps;
      "mgfx-vector-text": MGFXProps;
      "mgfx-vector-rich-text": MGFXProps;
      "mgfx-vector-image": MGFXProps;
    }
  }
}
