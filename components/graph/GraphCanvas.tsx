"use client";

import { useMemo } from "react";

// Shared, visually-upgraded SVG rendering for both the global network page
// and the per-case network tab: curved edges instead of straight lines,
// radial-gradient node fills, a soft canvas dot-grid, and the brand display
// font on labels. Each page still owns its own data/zoom/pan/drag state —
// this component only renders what it's given, so neither page's
// interaction logic had to change to get the shared look.
export interface CanvasNode {
  id: string;
  x: number;
  y: number;
  radius: number;
  color: string;
  label: string;
  dimmed?: boolean;
  selected?: boolean;
  bold?: boolean;
  burner?: boolean;
  onPointerDown?: (e: React.PointerEvent) => void;
}
export interface CanvasEdge {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  width: number;
  opacity: number;
}

function curvedPath(x1: number, y1: number, x2: number, y2: number): string {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.max(Math.hypot(dx, dy), 1);
  // Perpendicular offset proportional to length, capped — long edges arc
  // gently, short ones barely at all, so the graph doesn't look "noodly".
  const bow = Math.min(len * 0.12, 26);
  const cx = mx + (-dy / len) * bow;
  const cy = my + (dx / len) * bow;
  return `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`;
}

function gradientId(color: string): string {
  return `node-fill-${color.replace("#", "")}`;
}

export function GraphCanvas({ nodes, edges }: { nodes: CanvasNode[]; edges: CanvasEdge[] }) {
  const uniqueColors = useMemo(() => [...new Set(nodes.map((n) => n.color))], [nodes]);

  return (
    <>
      <defs>
        <pattern id="graph-dot-grid" width="22" height="22" patternUnits="userSpaceOnUse">
          <circle cx="1.2" cy="1.2" r="1.2" className="fill-neutral-200/70 dark:fill-white/[0.06]" />
        </pattern>
        {uniqueColors.map((color) => (
          <radialGradient key={color} id={gradientId(color)} cx="35%" cy="30%" r="75%">
            <stop offset="0%" stopColor={color} stopOpacity={0.85} />
            <stop offset="100%" stopColor={color} stopOpacity={0.28} />
          </radialGradient>
        ))}
        <filter id="graph-node-glow" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="3.2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <rect x="0" y="0" width="1000" height="620" fill="url(#graph-dot-grid)" />

      {edges.map((e) => (
        <path
          key={e.id}
          d={curvedPath(e.x1, e.y1, e.x2, e.y2)}
          fill="none"
          stroke="#8b8b94"
          strokeWidth={e.width}
          strokeOpacity={e.opacity}
          strokeLinecap="round"
        />
      ))}

      {nodes.map((n) => (
        <g
          key={n.id}
          onPointerDown={n.onPointerDown}
          className="cursor-pointer"
          opacity={n.dimmed ? 0.35 : 1}
          style={{ transition: "opacity 180ms ease" }}
        >
          {n.selected && (
            <circle cx={n.x} cy={n.y} r={n.radius + 7} fill="none" stroke="#17152A" strokeWidth={1.5} strokeDasharray="4 3" />
          )}
          <circle
            cx={n.x}
            cy={n.y}
            r={n.radius}
            fill={`url(#${gradientId(n.color)})`}
            stroke={n.color}
            strokeWidth={1.6}
            filter={n.selected ? "url(#graph-node-glow)" : undefined}
          />
          {n.burner && (
            <circle cx={n.x} cy={n.y} r={n.radius + 3.5} fill="none" stroke="#dc2626" strokeWidth={1.4} strokeDasharray="3 2" />
          )}
          <text
            x={n.x}
            y={n.y - n.radius - 8}
            textAnchor="middle"
            fontFamily='"Alliance No.1", ui-sans-serif, sans-serif'
            fontSize={n.selected ? 12.5 : n.bold ? 11.5 : 10.5}
            fontWeight={n.selected || n.bold ? 700 : 500}
            fill="#3d3a49"
            className="pointer-events-none"
          >
            {n.label}
            {n.burner ? " ⚠" : ""}
          </text>
        </g>
      ))}
    </>
  );
}
