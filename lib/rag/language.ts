// Answer-language detection for "Ask Preksha".
//
// The corpus (FIRs, CDR, ledgers) is English. The user is not always reading
// English. Jina embeds Devanagari and Latin questions into one space, so
// retrieval already matches regardless of script — the only piece missing is
// answering in the language the question was asked in.
//
// Two scripts, no brittle wordlists: the Devanagari block decides Hindi
// vs. Marathi vs. everything else. Telling Hindi and Marathi apart by character
// range is impossible (same script), so instead the model is directed to
// answer in whichever of the two the user actually wrote — something an LLM
// reads reliably and a regex cannot. Latin-script Romanized Hindi (Hinglish)
// is also left to the model: it can distinguish "how is the money moving?"
// from "paisa kise jaa raha hai?" better than any stopword list, and a
// false-positive English detector would be worse than none.

const DEVANAGARI = /[\u0900-\u097F]/;

/**
 * Returns the answer-language instruction to inject into the SYSTEM message
 * (it must be an override: the first version of this sat in the user turn and
 * the model simply ignored it) plus a short human label for the query trace.
 */
export function answerLanguage(question: string): { instruction: string; label: string } {
  const devanagari = DEVANAGARI.test(question);
  const target = devanagari
    ? "the same language the QUESTION is written in (Hindi or Marathi — match whichever the user used)"
    : "the same language the QUESTION is written in (Roman-script Hindi / Hinglish if that is what the user wrote, otherwise English)";
  const label = devanagari ? "Devanagari (Hindi/Marathi)" : "As asked (English/Hinglish)";

  const instruction = [
    "# Answer language — this OVERRIDES the language of the source excerpts",
    "",
    "The source excerpts are English. The user is not necessarily reading English.",
    `Write the ENTIRE answer in ${target}. Do not answer in English unless the question itself was asked in English.`,
    "Identifiers stay EXACTLY as printed in the excerpts — never translated, never transliterated:",
    "- evidence ids and FIR/case numbers: [1201/2023], [member:rajesh]",
    "- names, dates, amounts, units and burner numbers",
    "",
    "Prose is translated; anything printed in a record is not.",
    "Do not append an English translation.",
  ].join("\n");

  return { instruction, label };
}

/**
 * BCP-47 tag to READ a piece of text aloud with. Devanagari text must never be
 * handed an English voice (it produces noise), so any Devanagari answer reads
 * with a Hindi voice even when the UI language is English, then falls back to
 * the page's language.
 */
export function speechTagForText(text: string, fallback: string): string {
  return DEVANAGARI.test(text) ? "hi-IN" : fallback;
}