import { QdrantClient } from "@qdrant/js-client-rest";

const url = process.env.QDRANT_CLUSTER_ENDPOINT;
const apiKey = process.env.QDRANT_API_KEY;
if (!url || !apiKey) throw new Error("QDRANT_CLUSTER_ENDPOINT / QDRANT_API_KEY are not set");

export const qdrant = new QdrantClient({ url, apiKey });

// Own collection, separate from whatever else lives on this shared cluster
// (a pre-existing "timmo_rag" collection was found on connect — untouched).
export const COLLECTION = "preksha_evidence";
