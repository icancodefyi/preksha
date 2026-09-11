import { evidenceChain } from "@/lib/graph/enrich";
import { anchorEvidence } from "@/lib/graph/blockchain";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const tamper = url.searchParams.get("tamper");
  const chain = evidenceChain();
  if (tamper === "1") {
    // demo: simulate a tampered artifact → chain verification flips false
    const c = [...chain.chain];
    c[0] = { ...c[0], sha256: "tampered" };
    const bad = { ...chain, chain: c, verified: c.every((i) => i.sha256.startsWith("tampered") === false) };
    return Response.json(bad);
  }
  return Response.json({ ...chain, anchor: anchorEvidence() });
}