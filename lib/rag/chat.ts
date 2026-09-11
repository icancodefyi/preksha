// Chat context + coreference resolution.
// Follow-up questions like "his details" / "where did he call from" must
// resolve the pronoun against the previous turn instead of hitting a generic
// retrieval and returning the wrong record (the classic "history is broken"
// failure mode). This is deterministic, testable, and never guesses an entity
// that was not already stated in the conversation.

import { networkMembers, burner } from "@/lib/data/seed";

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface ResolvedSubject {
  key?: string; // network-member key (or "burner")
  name?: string;
  role?: string; // "kingpin" | "burner" | etc.
}

const PRONOUN_RE = /\b(he|she|him|her|his|hers|they|them|their|it)\b/i;

const ROLE_TERMS = [
  "kingpin",
  "burner",
  "courier",
  "financier",
  "executor",
  "distributor",
  "operator",
  "mule account",
  "cashier",
];

// Ordered candidate entities — names, aliases, and the burner.
const ENTITIES: { name: string; key: string }[] = [
  ...networkMembers.flatMap((m) => [
    { name: m.name.toLowerCase(), key: m.key },
    ...(m.alias
      ? m.alias
          .split(/[/,|]/)
          .map((a) => a.trim().toLowerCase())
          .filter(Boolean)
          .map((a) => ({ name: a, key: m.key }))
      : []),
  ]),
  { name: "burner", key: "burner" },
  { name: burner.name.toLowerCase(), key: "burner" },
];

function findEntity(text: string): ResolvedSubject {
  const t = text.toLowerCase();
  for (const e of ENTITIES) if (t.includes(e.name)) return { key: e.key, name: e.name };
  for (const r of ROLE_TERMS) if (t.includes(r)) return { role: r };
  return {};
}

/**
 * Resolve what the question is *about*.
 * 1. If the question itself names a person/role, use that.
 * 2. Otherwise, if it contains a pronoun, look back through the assistant
 *    turns for the most recent named entity and carry it forward.
 */
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

/** True if the question asks for a profile/details/history of the subject. */
export function wantsProfile(question: string): boolean {
  return /\b(details?|profile|about|who is|tell me (about|more)|information|info|history|crimes|involved|record|score|risk)\b/i.test(
    question,
  );
}

/** Last N turns, trimmed to keep the LLM context tight and fast. */
export function historyWindow(history: ChatTurn[], n = 6): ChatTurn[] {
  return history.slice(-n);
}
