"""
The RAG pipeline itself. Read this top to bottom -- it IS the explanation of
how retrieval-augmented generation works in this app:

  1. Turn the question into a vector (embed_query)
  2. Find the most similar indexed documents (search)
  3. Hand ONLY those documents to the LLM as context, tagged with ids
  4. Ask the LLM to answer using only that context, citing ids
  5. Check that every id it cited actually came from step 2 -- an id it
     invents is dropped, never shown to the user as if it were real

Nothing here is a black box: no framework, no agent, no hidden retries.
"""
from dataclasses import dataclass, field

from clients import embed_query, search, generate_grounded, extract_cited_ids

TOP_K = 5
MIN_SCORE = 0.3  # cosine similarity floor -- below this we say "no evidence", not a weak guess


@dataclass
class Citation:
    source_type: str
    source_id: str
    label: str
    score: float


@dataclass
class TraceStep:
    label: str
    detail: str
    ms: int


@dataclass
class Answer:
    answer: str
    citations: list[Citation]
    retrieved_count: int
    unsupported_citations_stripped: int
    trace: list[TraceStep] = field(default_factory=list)


def answer_question(question: str, case_id: str | None = None) -> Answer:
    import time

    t0 = time.monotonic()
    trace: list[TraceStep] = []

    def mark(label: str, detail: str = "") -> None:
        trace.append(TraceStep(label=label, detail=detail, ms=round((time.monotonic() - t0) * 1000)))

    # Step 1: embed the question
    vector = embed_query(question)
    mark("Embedded the question", "Jina embeddings v3 - retrieval.query")

    # Step 2: vector search, restricted to this case's documents when a
    # case_id is given ("chat with this case" -- see corpus.py's case
    # tagging and clients.search's filter)
    result = search(vector, limit=TOP_K, score_threshold=MIN_SCORE, case_id=case_id)
    hits = result.points
    scope = f"case {case_id}" if case_id else "all cases"
    mark("Searched the evidence index", f"Qdrant ({scope}) - {len(hits)} match(es) above threshold")

    if not hits:
        return Answer(
            answer="No relevant evidence found in the indexed case material for this question.",
            citations=[],
            retrieved_count=0,
            unsupported_citations_stripped=0,
            trace=trace,
        )

    retrieved = [
        {
            "source_type": h.payload["sourceType"],
            "source_id": h.payload["sourceId"],
            "label": h.payload["label"],
            "text": h.payload["text"],
            "score": h.score,
        }
        for h in hits
    ]

    # Step 3: build the evidence block -- every excerpt tagged with its id,
    # so the model has something concrete to cite back
    evidence_block = "\n\n---\n\n".join(f"[{d['source_id']}] ({d['label']})\n{d['text']}" for d in retrieved)

    # Step 4: ask the LLM to answer using ONLY that evidence
    text = generate_grounded(question, evidence_block)
    mark("Generated a grounded answer", "Groq")

    # Step 5: validate citations -- an id the model didn't actually retrieve
    # gets silently dropped here, never surfaced as if it were real evidence
    cited_ids = extract_cited_ids(text)
    retrieved_ids = {d["source_id"] for d in retrieved}
    valid = [d for d in retrieved if d["source_id"] in cited_ids]
    stripped = max(0, len(cited_ids) - len(cited_ids & retrieved_ids))
    mark(
        "Validated citations",
        f"{len(valid)} confirmed, {stripped} unsupported citation(s) stripped" if stripped else f"{len(valid)} confirmed against retrieved evidence",
    )

    return Answer(
        answer=text,
        citations=[Citation(d["source_type"], d["source_id"], d["label"], d["score"]) for d in valid],
        retrieved_count=len(retrieved),
        unsupported_citations_stripped=stripped,
        trace=trace,
    )
