// Conversation context + coreference resolution. Follow-ups like "his details"
// must resolve the pronoun to the entity from the previous turn *before*
// retrieval, otherwise the vector search has nothing meaningful to match and
// the model is grounded on the wrong evidence. Deterministic and testable.
import { networkMembers, burner } from "@/lib/data/seed";
import type { ChatTurn } from "./types";

export interface ResolvedSubject {
  key?: string;
  name?: string;
  role?: string;
}

const PRONOUN_RE = /\b(he|she|him|her|his|hers|they|them|their|it)\b/i;
const ROLE_TERMS = ["kingpin", "burner", "courier", "financier", "executor", "distributor", "operator", "mule account", "cashier"];

const ENTITIES: { name: string; key: string }[] = [
  ...networkMembers.flatMap((m) => [
    { name: m.name.toLowerCase(), key: m.key },
    ...(m.alias
      ? m.alias
          .split(/[/,|]/)
          .map((a) => a.trim().toLowerCase())
          .filter((a) => a.length >= 3) // drop single/double-letter aliases — they match everything
          .map((a) => ({ name: a, key: m.key }))
      : []),
  ]),
  { name: "burner", key: "burner" },
  { name: burner.name.toLowerCase(), key: "burner" },
];

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findEntity(text: string): ResolvedSubject {
  const t = text.toLowerCase();
  for (const e of ENTITIES) {
    if (new RegExp(`\\b${escapeRe(e.name)}\\b`).test(t)) return { key: e.key, name: e.name };
  }
  for (const r of ROLE_TERMS) if (t.includes(r)) return { role: r };
  return {};
}

export function resolveSubject(question: string, history: ChatTurn[]): ResolvedSubject {
  const self = findEntity(question);
  if (self.key || self.role) return self;
  if (!PRONOUN_RE.test(question)) return {};
  for (let i = history.length - 1; i >= 0; i--) {
    const turn = history[i];
    if (turn.role !== "assistant") continue;
    const resolved = findEntity(turn.content);
    if (resolved.key || resolved.role) return resolved;
  }
  return {};
}

/** Rewrite the query with the resolved subject so retrieval + generation see it. */
export function withResolvedSubject(question: string, history: ChatTurn[]): string {
  const s = resolveSubject(question, history);
  if (s.name && !question.toLowerCase().includes(s.name)) return `${s.name} — ${question}`;
  if (s.key === "burner" && !question.toLowerCase().includes("burner")) return `the burner phone — ${question}`;
  if (s.role && !question.toLowerCase().includes(s.role)) return `${s.role} — ${question}`;
  return question;
}
