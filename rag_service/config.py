"""
Loads the SAME .env the Next.js app uses (one copy of the secrets, not two).
"""
import os
from pathlib import Path
from dotenv import load_dotenv

ENV_PATH = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(dotenv_path=ENV_PATH)


def _require(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(f"{name} is not set (expected in {ENV_PATH})")
    return value


JINA_API_KEY = _require("JINA_API_KEY")
QDRANT_API_KEY = _require("QDRANT_API_KEY")
QDRANT_CLUSTER_ENDPOINT = _require("QDRANT_CLUSTER_ENDPOINT")
GROQ_API_KEY = _require("GROQ_API_KEY")
GROQ_MODEL = _require("GROQ_MODEL")

# The Next.js app, so /reindex can pull already-computed derived data
# (suspect dossiers, pattern alerts, money flow, FIR narratives) instead of
# reimplementing that domain logic in Python — see rag_service/README.md.
NEXT_APP_URL = os.environ.get("NEXT_APP_URL", "http://localhost:3000")

COLLECTION = "preksha_evidence"
EMBEDDING_DIM = 1024
