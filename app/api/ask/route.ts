import { answerQuestion } from "@/lib/graph/enrich";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = url.searchParams.get("q") ?? "";
  if (!q.trim()) {
    return Response.json(
      { answer: "", sources: [], suggested: ["Who is the kingpin?", "How is the money moving?"] },
    );
  }
  return Response.json(answerQuestion(q));
}