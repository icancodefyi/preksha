// Case derivation — computed at module load from whatever `firs` currently
// contains, NOT a hand-authored list. The user will edit/replace the FIR
// data; this must keep working without a code change when that happens
// (see docs discussion: "cases" = connected components over each FIR's
// existing `related_firs` links, not a hardcoded grouping).
import { firs, networkMembers, memberByPhone } from "@/lib/data/seed";
import type { FIRRecord } from "@/lib/data/types";

export interface CaseSummary {
  id: string;
  title: string;
  categories: string[];
  firCount: number;
  suspectCount: number;
  dateRange: { first: string; last: string };
}

export interface CaseDetail extends CaseSummary {
  firs: FIRRecord[];
  suspectKeys: string[];
}

function deriveSuspectKeys(caseFirs: FIRRecord[]): string[] {
  const keys = new Set<string>();
  for (const f of caseFirs) {
    for (const phone of f.entities?.phones ?? []) {
      const m = memberByPhone(phone);
      if (m) keys.add(m.key);
    }
    // Fallback: match accused/complainant names directly against known
    // members when a FIR mentions someone by name but not by phone.
    const names = [f.complainant?.name, ...f.accused.map((a) => a.name)].filter(Boolean) as string[];
    for (const name of names) {
      const m = networkMembers.find((nm) => nm.name === name);
      if (m) keys.add(m.key);
    }
  }
  return [...keys];
}

function titleFor(caseFirs: FIRRecord[]): string {
  const categories = [...new Set(caseFirs.map((f) => f.category))];
  const label = categories
    .slice(0, 3)
    .map((c) => c.replace(/-/g, " "))
    .join(" / ");
  return caseFirs.length > 1 ? `${label} network` : caseFirs[0].title;
}

/**
 * Connected components of FIRs via `related_firs`. Union-find, not a
 * visited-set walk — `related_firs` isn't always declared symmetrically in
 * the data (FIR A can list B without B listing A back), and a simple
 * DFS/BFS silently drops the asymmetric side into its own singleton
 * component instead of merging it. Union-find is correct regardless of
 * which direction a relation happens to be recorded in.
 */
function connectedComponents(): FIRRecord[][] {
  const byIdx = new Map(firs.map((f) => [f.idx, f]));
  const parent = new Map<number, number>(firs.map((f) => [f.idx, f.idx]));

  function find(x: number): number {
    while (parent.get(x) !== x) {
      parent.set(x, parent.get(parent.get(x)!)!); // path compression
      x = parent.get(x)!;
    }
    return x;
  }
  function union(a: number, b: number) {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  }

  for (const f of firs) {
    for (const rel of f.related_firs) {
      if (byIdx.has(rel)) union(f.idx, rel);
    }
  }

  const groups = new Map<number, FIRRecord[]>();
  for (const f of firs) {
    const root = find(f.idx);
    const group = groups.get(root) ?? [];
    group.push(f);
    groups.set(root, group);
  }
  return [...groups.values()].map((g) => g.sort((a, b) => a.idx - b.idx));
}

function buildCases(): CaseDetail[] {
  return connectedComponents().map((caseFirs) => {
    const dates = caseFirs.map((f) => f.incident_date).sort();
    const suspectKeys = deriveSuspectKeys(caseFirs);
    return {
      id: `case-${caseFirs[0].idx}`,
      title: titleFor(caseFirs),
      categories: [...new Set(caseFirs.map((f) => f.category))],
      firCount: caseFirs.length,
      suspectCount: suspectKeys.length,
      dateRange: { first: dates[0], last: dates[dates.length - 1] },
      firs: caseFirs,
      suspectKeys,
    };
  });
}

// Computed once per process — cheap (9 FIRs today) and always consistent
// with whatever's currently in lib/data/raw/firs.json.
const CASES = buildCases();

export function listCases(): CaseSummary[] {
  return CASES.map((c) => ({
    id: c.id,
    title: c.title,
    categories: c.categories,
    firCount: c.firCount,
    suspectCount: c.suspectCount,
    dateRange: c.dateRange,
  }));
}

export function getCase(id: string): CaseDetail | undefined {
  return CASES.find((c) => c.id === id);
}
