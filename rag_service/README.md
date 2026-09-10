# preksha RAG service

The RAG (retrieval-augmented generation) backend, in Python, separate from
the Next.js app. This replaced an earlier TypeScript implementation
(`lib/rag/*` in the main app, still present but no longer called) for one
reason: legibility. Read `query.py` — it's the whole pipeline in ~15 lines
of actual logic, no framework in the way.

## How it works

```
question
   │
   ▼
embed_query()          -- Jina turns the question into a 1024-dim vector
   │
   ▼
search()                -- Qdrant finds the ~5 most similar indexed documents
   │                        (FIR narratives, suspect profiles, pattern
   │                        alerts, money-flow summaries, tower co-location)
   ▼
build evidence_block    -- those documents, each tagged with an id in [brackets]
   │
   ▼
generate_grounded()     -- Groq answers the question, told to cite [ids] and
   │                        never invent facts outside the given evidence
   ▼
extract_cited_ids()     -- every [id] the model wrote is checked against what
   │                        was actually retrieved; anything it made up is
   │                        dropped, not shown to the user
   ▼
answer + real citations
```

That's the entire system. No agent loop, no tool-calling, no hidden
retries — one pass through five steps, every step visible in `query.py`.

## Files

- `config.py` — loads `../.env` (same secrets the Next.js app uses)
- `clients.py` — the three external calls (Jina embed, Qdrant search, Groq generate)
- `query.py` — **the pipeline** — start reading here
- `corpus.py` — builds the indexed documents by fetching already-computed
  data from the Next.js app's REST API (`/api/firs`, `/api/suspects`,
  `/api/alerts`, `/api/money`, `/api/towers`, `/api/discoveries`) — this
  service does not reimplement graph/dossier logic, it reuses it
- `main.py` — FastAPI routes: `POST /query`, `POST /reindex`, `GET /health`

## Running it

```bash
cd rag_service
python -m venv .venv
.venv\Scripts\activate        # Windows
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

Runs alongside `pnpm dev` (a second process, port 8000). The Next.js
`/api/ask` route calls `http://localhost:8000/query`; if this service is
down, it falls back to the deterministic keyword-matching answerer
automatically — no hard failure for the user.

## Re-indexing after the data changes

Whenever the FIR/CDR/suspect seed data is edited or replaced:

```bash
curl -X POST http://localhost:8000/reindex
```

No code changes needed — the corpus is always rebuilt from whatever the
Next.js app currently serves.
