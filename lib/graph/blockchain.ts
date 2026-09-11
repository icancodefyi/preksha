// Evidence anchoring — the SHA-256 chain root is "anchored" to a permissioned
// blockchain ledger so integrity + a timestamp are independently provable,
// not just self-attested by the analysing system.
//
// For the demo this anchoring is deterministic and simulated (derived from the
// real chain root) rather than broadcasting to a live network — a real
// permissioned chain (Hyperledger Fabric / Polygon edge) would take the same
// root and return a real transaction hash + block reference. The data flow and
// the certificate structure are identical either way; only the transport of
// the transaction differs.
import { createHash } from "node:crypto";
import { evidenceChain } from "./enrich";

export interface AnchorRecord {
  network: string;
  txHash: string;
  blockNumber: number;
  blockHash: string;
  anchoredAt: string;
  root: string;
}

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

export function anchorEvidence(): AnchorRecord {
  const { root } = evidenceChain();
  const txHash = "0x" + sha(`preksha:anchor:${root}`);
  const blockHash = "0x" + sha(`preksha:block:${root}`);
  const blockNumber = (parseInt(root.slice(0, 8), 16) % 9_000_000) + 1_000_000;
  return {
    network: "Preksha Evidence Ledger (permissioned blockchain)",
    txHash,
    blockNumber,
    blockHash,
    anchoredAt: new Date().toISOString(),
    root,
  };
}

export interface ReportData {
  generatedAt: string;
  root: string;
  verified: boolean;
  chain: { id: string; label: string; sha256: string; verified: boolean }[];
  anchor: AnchorRecord;
  caseTitle: string;
  caseFirs: string[];
  reconstruction: { phase: string; time: string; title: string; source: string }[] | null;
  summary: string;
}
