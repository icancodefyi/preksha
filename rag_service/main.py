"""
Entry point. Run with:  uvicorn main:app --reload --port 8000

Two endpoints:
  POST /query    -- answer a question (see query.py for the actual pipeline)
  POST /reindex  -- rebuild the Qdrant index from current app data (see corpus.py)

Run /reindex any time the underlying FIR/CDR/suspect data changes -- there
is no code to edit, the corpus is always derived fresh from whatever the
Next.js app currently serves.
"""
from uuid import uuid4

from fastapi import FastAPI
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from qdrant_client.models import Distance, VectorParams, PointStruct, PayloadSchemaType

from clients import qdrant, embed_passages
from config import COLLECTION, EMBEDDING_DIM
from corpus import build_corpus
from query import answer_question

app = FastAPI(title="preksha RAG service")


class QueryRequest(BaseModel):
    question: str
    case_id: str | None = None  # when set, search is restricted to that case's tagged documents


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/query")
def query(req: QueryRequest):
    if not req.question.strip():
        return {"answer": "", "citations": [], "retrieved_count": 0, "unsupported_citations_stripped": 0, "trace": []}
    try:
        result = answer_question(req.question, case_id=req.case_id)
    except Exception as exc:  # noqa: BLE001 -- surfaced as a 500; Next.js falls back to the deterministic path on any error
        return JSONResponse(status_code=500, content={"error": str(exc)})
    return {
        "answer": result.answer,
        "citations": [c.__dict__ for c in result.citations],
        "retrieved_count": result.retrieved_count,
        "unsupported_citations_stripped": result.unsupported_citations_stripped,
        "trace": [t.__dict__ for t in result.trace],
    }


@app.post("/reindex")
def reindex():
    docs = build_corpus()

    if qdrant.collection_exists(COLLECTION):
        qdrant.delete_collection(COLLECTION)
    qdrant.create_collection(COLLECTION, vectors_config=VectorParams(size=EMBEDDING_DIM, distance=Distance.COSINE))
    # Qdrant Cloud requires an explicit payload index before a field can be
    # used in a query filter -- this is what makes clients.search's
    # caseIds filter (case-scoped chat) work at all.
    qdrant.create_payload_index(COLLECTION, field_name="caseIds", field_schema=PayloadSchemaType.KEYWORD)

    vectors = embed_passages([d.text for d in docs])
    points = [
        PointStruct(
            id=str(uuid4()),
            vector=vector,
            payload={"sourceType": d.source_type, "sourceId": d.source_id, "label": d.label, "text": d.text, "caseIds": d.case_ids},
        )
        for d, vector in zip(docs, vectors)
    ]
    qdrant.upsert(COLLECTION, points=points, wait=True)

    counts: dict[str, int] = {}
    for d in docs:
        counts[d.source_type] = counts.get(d.source_type, 0) + 1

    return {"indexed": len(docs), "by_type": counts}
