import type { NodeType } from "@/services";

export type Tool =
  | { kind: "select" }
  | { kind: "node"; type: NodeType }
  | { kind: "arrow" }
  | { kind: "sticky" }
  | { kind: "pen" };

export const SELECT_TOOL: Tool = { kind: "select" };
