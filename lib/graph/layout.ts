// Force-directed layout — extracted from app/network/page.tsx so the
// per-case network tab (app/cases/[caseId]/page.tsx) can reuse the same
// tuned physics instead of a second, drifting copy.
export interface LayoutNode {
  id: string;
}
export interface LayoutEdge {
  source: string;
  target: string;
}

export const LAYOUT_W = 1000;
export const LAYOUT_H = 620;

export function forceLayout(nodes: LayoutNode[], edges: LayoutEdge[]): Map<string, { x: number; y: number }> {
  const W = LAYOUT_W;
  const H = LAYOUT_H;
  const pos = new Map<string, { x: number; y: number }>();
  const vel = new Map<string, { x: number; y: number }>();
  nodes.forEach((n, i) => {
    const a = (i / nodes.length) * Math.PI * 2;
    const r = 150 + (i % 4) * 34;
    pos.set(n.id, { x: W / 2 + Math.cos(a) * r, y: H / 2 + Math.sin(a) * r });
    vel.set(n.id, { x: 0, y: 0 });
  });

  const REST = 118;
  const REP = 4600;
  const DAMP = 0.86;
  const MAXV = 3.4;

  for (let iter = 0; iter < 240; iter++) {
    const force = new Map<string, { x: number; y: number }>();
    for (const n of nodes) force.set(n.id, { x: 0, y: 0 });

    // Repulsion
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = pos.get(nodes[i].id)!;
        const b = pos.get(nodes[j].id)!;
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const d2 = Math.max(dx * dx + dy * dy, 1);
        const d = Math.sqrt(d2);
        const f = REP / d2;
        const fx = (dx / d) * f;
        const fy = (dy / d) * f;
        force.get(nodes[i].id)!.x += fx;
        force.get(nodes[i].id)!.y += fy;
        force.get(nodes[j].id)!.x -= fx;
        force.get(nodes[j].id)!.y -= fy;
      }
    }

    // Springs
    for (const e of edges) {
      const a = pos.get(e.source)!;
      const b = pos.get(e.target)!;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
      const f = (d - REST) * 0.045;
      const fx = (dx / d) * f;
      const fy = (dy / d) * f;
      force.get(e.source)!.x += fx;
      force.get(e.source)!.y += fy;
      force.get(e.target)!.x -= fx;
      force.get(e.target)!.y -= fy;
    }

    // Center pull + integrate
    for (const n of nodes) {
      const p = pos.get(n.id)!;
      const v = vel.get(n.id)!;
      const f = force.get(n.id)!;
      v.x = (v.x + f.x + (W / 2 - p.x) * 0.02) * DAMP;
      v.y = (v.y + f.y + (H / 2 - p.y) * 0.02) * DAMP;
      const sp = Math.sqrt(v.x * v.x + v.y * v.y);
      if (sp > MAXV) {
        v.x = (v.x / sp) * MAXV;
        v.y = (v.y / sp) * MAXV;
      }
      p.x += v.x;
      p.y += v.y;
    }
  }
  return pos;
}
