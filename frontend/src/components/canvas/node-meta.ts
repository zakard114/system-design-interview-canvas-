import {
  Boxes,
  Database,
  Gauge,
  ListOrdered,
  Sparkles,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { NodeType } from "@/services";

export interface NodeMeta {
  type: NodeType;
  label: string;
  defaultLabel: string;
  icon: LucideIcon;
  colorVar: string;
}

export const NODE_TYPES: NodeMeta[] = [
  {
    type: "service",
    label: "Service",
    defaultLabel: "Service",
    icon: Boxes,
    colorVar: "var(--node-service)",
  },
  {
    type: "database",
    label: "Database",
    defaultLabel: "Postgres",
    icon: Database,
    colorVar: "var(--node-database)",
  },
  {
    type: "queue",
    label: "Queue",
    defaultLabel: "Kafka topic",
    icon: ListOrdered,
    colorVar: "var(--node-queue)",
  },
  {
    type: "cache",
    label: "Cache",
    defaultLabel: "Redis",
    icon: Zap,
    colorVar: "var(--node-cache)",
  },
  {
    type: "loadbalancer",
    label: "Load balancer",
    defaultLabel: "Load balancer",
    icon: Gauge,
    colorVar: "var(--node-loadbalancer)",
  },
  {
    type: "llm",
    label: "LLM / API",
    defaultLabel: "LLM call",
    icon: Sparkles,
    colorVar: "var(--node-llm)",
  },
];

export const nodeMeta = (type: NodeType): NodeMeta =>
  NODE_TYPES.find((n) => n.type === type) ?? NODE_TYPES[0]!;

export const NODE_W = 168;
export const NODE_H = 76;
export const CANVAS_W = 2600;
export const CANVAS_H = 1800;
