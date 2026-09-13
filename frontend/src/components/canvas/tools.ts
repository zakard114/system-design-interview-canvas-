import type { NodeType } from "@/services";

export type Tool =
  | { kind: "select" }
  | { kind: "node"; type: NodeType }
  | { kind: "arrow" }
  | { kind: "sticky" }
  | { kind: "pen" }
  | { kind: "eraser" };

export const SELECT_TOOL: Tool = { kind: "select" };

/** Even visual steps — avoid a mid-scale jump. */
export const PEN_WIDTHS = [2, 2.5, 3, 3.5, 4] as const;
export const ERASER_SIZES = [8, 12, 16, 22] as const;
export const DEFAULT_PEN_WIDTH = 2.5;
export const DEFAULT_ERASER_SIZE = 12;
export const ARROW_LINE_STYLES = ["solid", "dashed", "dotted", "curved"] as const;
export type ArrowLineStyle = (typeof ARROW_LINE_STYLES)[number];
export const DEFAULT_ARROW_LINE_STYLE: ArrowLineStyle = "solid";

export function arrowPresetToEdgeProps(style: ArrowLineStyle): {
  lineStyle: "solid" | "dashed" | "dotted";
  pathStyle: "straight" | "curved";
} {
  if (style === "curved") return { lineStyle: "solid", pathStyle: "curved" };
  return { lineStyle: style, pathStyle: "straight" };
}
