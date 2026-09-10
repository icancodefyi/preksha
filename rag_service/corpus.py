"""
Builds the text documents that get embedded and indexed into Qdrant.

This does NOT reimplement the graph/dossier/pattern-detection algorithms --
those already exist once, correctly, in the Next.js app (lib/graph/enrich.ts)
and are exposed over its normal REST API. This module just fetches that
already-computed data and turns it into retrieval-friendly text + a
whitespace-free source_id (used later for citation matching -- see
clients.CITATION_RE, which excludes brackets/whitespace from ids).

Same reasoning as scripts/indexToQdrant.ts (the TS version this replaces as
the live indexer) -- see that file's comments for the "why derived
summaries, not 10k raw CDR rows" rationale, which applies unchanged here.
"""
from dataclasses import dataclass

import httpx

from config import NEXT_APP_URL


@dataclass
class Doc:
    source_type: str
    source_id: str
    label: str
    text: str
    # Which case(s) this document belongs to. Empty/omitted case scoping at
    # query time means "visible everywhere"; a doc tagged with specific case
    # ids is only retrieved when chatting with one of those cases (or when
    # chatting globally, with no case filter at all). See CaseMap below for
    # which doc types get real scoping vs. stay global context.
    case_ids: list[str]


def _get(path: str):
    res = httpx.get(f"{NEXT_APP_URL}{path}", timeout=30)
    res.raise_for_status()
    return res.json()


@dataclass
class CaseMap:
    all_case_ids: list[str]
    fir_to_case: dict[str, str]
    suspect_to_case: dict[str, str]


def _build_case_map() -> CaseMap:
    cases = _get("/api/cases")
    all_ids = [c["id"] for c in cases]
    fir_to_case: dict[str, str] = {}
    suspect_to_case: dict[str, str] = {}
    for c in cases:
        detail = _get(f"/api/cases/{c['id']}")
        for f in detail["firs"]:
            fir_to_case[f["fir_no"]] = c["id"]
        for key in detail["suspectKeys"]:
            suspect_to_case[key] = c["id"]
    return CaseMap(all_case_ids=all_ids, fir_to_case=fir_to_case, suspect_to_case=suspect_to_case)


def _fir_docs(cases: CaseMap) -> list[Doc]:
    docs = []
    for row in _get("/api/firs"):
        detail = _get(f"/api/firs/{row['idx']}")["fir"]
        accused = ", ".join(a["name"] or a["alias"] for a in detail["accused"] if a["name"] or a["alias"])
        text = "\n".join(
            filter(
                None,
                [
                    f"FIR {detail['fir_no']} -- {detail['title']} ({detail['category']}, {detail['year']})",
                    f"Police station: {detail['police_station']}, {detail['district']}, {detail['state']}",
                    f"Sections: {', '.join(detail['sections'])}",
                    f"Complainant: {detail['complainant']['name']}",
                    f"Accused: {accused}" if accused else "",
                    f"Narrative: {detail['narrative']}",
                ],
            )
        )
        case_id = cases.fir_to_case.get(detail["fir_no"])
        docs.append(Doc("fir", detail["fir_no"], f"FIR {detail['fir_no']} -- {detail['title']}", text, [case_id] if case_id else []))
    return docs


def _discovery_docs(cases: CaseMap) -> list[Doc]:
    docs = []
    for key, entry in _get("/api/discoveries").items():
        text = "\n".join(f"{k}: {', '.join(v) if isinstance(v, list) else v}" for k, v in entry.items())
        # Findings usually span multiple FIRs/cases (e.g. "kingpin" cites
        # FIRs across both current cases) -- kept as global context rather
        # than guessing a single owning case from a partial fir list.
        docs.append(Doc("discovery", key, f"Finding: {key.replace('_', ' ')}", text, cases.all_case_ids))
    return docs


def _suspect_profile_docs(cases: CaseMap) -> list[Doc]:
    docs = []
    for row in _get("/api/suspects"):
        d = _get(f"/api/suspects/{row['key']}")
        alias_part = f' (alias "{d["alias"]}")' if d.get("alias") else ""
        phone2_part = f", secondary {d['phone2']}" if d.get("phone2") else ""
        parts = [
            f"{d['name']}{alias_part} -- {d['role']}, {d['cluster']} cluster, based in {d['city']}.",
            f"Phone: {d['phone']}{phone2_part}.",
        ]
        if d.get("topContacts"):
            parts.append("Top CDR contacts: " + ", ".join(f"{c['name']} ({c['calls']} calls)" for c in d["topContacts"]) + ".")
        money = d.get("money", {})
        if money.get("txns"):
            parts.append(
                f"Financial activity: Rs {round(money['inflow']):,} inflow, Rs {round(money['outflow']):,} outflow across {money['txns']} transactions."
            )
        if d.get("bankAccounts"):
            parts.append("Bank accounts: " + ", ".join(f"{b['bank']} {b['acct']}" for b in d["bankAccounts"]) + ".")
        if d.get("firs"):
            parts.append("Linked FIRs: " + "; ".join(f"{f['fir_no']} ({f['title']})" for f in d["firs"]) + ".")
        if d.get("metrics"):
            parts.append(f"Network metrics: betweenness {d['metrics']['betweenness']}, pagerank {d['metrics']['pagerank']}.")
        case_id = cases.suspect_to_case.get(row["key"])
        docs.append(Doc("suspect_profile", row["key"], f"Profile: {d['name']}", "\n".join(parts), [case_id] if case_id else []))
    return docs


def _pattern_alert_docs(cases: CaseMap) -> list[Doc]:
    docs = []
    for i, a in enumerate(_get("/api/alerts")):
        text = "\n".join(
            filter(None, [f"{a['title']} ({a['severity']} severity)", a["detail"], f"Evidence: {'; '.join(a['evidence'])}" if a["evidence"] else ""])
        )
        # source_id must be whitespace-free -- matched later as a bracketed
        # citation token (clients.CITATION_RE excludes whitespace).
        # Alerts aren't cleanly attributable to one case (evidence can span
        # FIR numbers from either case) -- kept as global context.
        docs.append(Doc("pattern_alert", f"alert_{a['type']}_{i}", f"Alert: {a['title']}", text, cases.all_case_ids))
    return docs


def _tower_colocation_docs(cases: CaseMap) -> list[Doc]:
    payload = _get("/api/towers")
    dump, towers = payload["towerDump"], payload["towers"]
    tower_by_id = {t["cell_id"]: t for t in towers}

    # "Identified" here means the phone belongs to a tracked suspect (from
    # /api/suspects) -- a simplification vs. the TS indexer, which also
    # checked the raw subscriber master for known-but-untracked numbers.
    # That endpoint isn't exposed over HTTP; this is an accepted, noted
    # scope reduction, not a silent gap.
    suspects_by_phone = {s["phone"]: s["name"] for s in _get("/api/suspects")}

    by_cell: dict[str, list[dict]] = {}
    for row in dump:
        by_cell.setdefault(row["cell_id"], []).append(row)

    docs = []
    for cell_id, rows in by_cell.items():
        tower = tower_by_id.get(cell_id)
        phones = {r["phone"] for r in rows}
        identified = sorted(suspects_by_phone[p] for p in phones if p in suspects_by_phone)
        unidentified = sorted(p for p in phones if p not in suspects_by_phone)
        times = sorted(r["timestamp"] for r in rows)
        tower_part = f" ({tower['landmark']}, {tower['city']})" if tower else ""
        text = "\n".join(
            filter(
                None,
                [
                    f"Tower {cell_id}{tower_part} -- {len(rows)} device pings, {len(phones)} distinct phones, {times[0]} to {times[-1]}.",
                    f"Event tag: {rows[0].get('event') or 'none'}.",
                    f"Identified network members present: {', '.join(identified)}." if identified else "",
                    f"Unidentified devices with no subscriber record (possible burner SIMs): {', '.join(unidentified)}." if unidentified else "",
                ],
            )
        )
        # Tower events aren't cross-referenced to a specific case's FIRs here
        # (would need per-case time-window matching) -- kept as global
        # context, same tradeoff as pattern alerts above.
        docs.append(Doc("tower_colocation", f"tower_{cell_id}", f"Co-location: {cell_id}", text, cases.all_case_ids))
    return docs


def _money_flow_doc(cases: CaseMap) -> list[Doc]:
    mf = _get("/api/money")
    top_flows = mf["edges"][:15]
    if not top_flows:
        return []
    lines = ["Money flow graph -- largest fund transfers between entities in the network:"]
    lines += [f"{e['from']} -> {e['to']}: Rs {round(e['amount']):,} across {e['txns']} transaction(s)" for e in top_flows]
    lines.append("")
    lines.append(
        "Entities by total volume: "
        + ", ".join(f"{n['name']} ({n['role']}, in Rs {round(n['inflow']):,} / out Rs {round(n['outflow']):,})" for n in mf["nodes"][:10])
    )
    return [Doc("money_flow", "money_flow_graph", "Money flow graph summary", "\n".join(lines), cases.all_case_ids)]


def build_corpus() -> list[Doc]:
    cases = _build_case_map()
    return (
        _fir_docs(cases)
        + _discovery_docs(cases)
        + _suspect_profile_docs(cases)
        + _pattern_alert_docs(cases)
        + _tower_colocation_docs(cases)
        + _money_flow_doc(cases)
    )
