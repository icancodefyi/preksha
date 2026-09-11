// Shared types for the Preksha RAG pipeline.

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

/** A single indexed passage with its provenance. */
export interface SourceChunk {
  id: string; // citation id the model must cite, e.g. "1201/2023", "member:rajesh"
  label: string; // human-facing label
  text: string; // passage text
  caseIds: string[]; // FIR numbers this chunk belongs to ([] = global)
}

export interface ScoredChunk extends SourceChunk {
  score: number;
}

export interface Citation {
  id: string;
  label: string;
}

export interface TraceStep {
  label: string;
  detail?: string;
  ms: number;
}

export interface ChatResult {
  answer: string;
  sources: { label: string; ref: string }[];
  suggested: string[];
  confidence: "high" | "medium" | "low";
  trace: TraceStep[];
}

export interface ChatRequest {
  question: string;
  history?: ChatTurn[];
  caseId?: string; // a case id ("case-<idx>") for case-scoped chat
}
