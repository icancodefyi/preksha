// Phase 8.4: citations are structured objects, never LLM-generated strings.
// Every branch in lib/rag/answer.ts builds these directly from the same
// deterministic query result it's summarizing — there is no separate
// "citation generation" step that could drift from what was actually retrieved.
export interface Citation {
  sourceType: "communication_event" | "transaction" | "fir" | "analytical_run" | "evidence";
  caseId: string;
  recordId: string;
  label: string;
  confidence: number;
}
