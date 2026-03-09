import type { HumanizeRequest } from "@/lib/humanizer/types";
import { countWords, formatGradeLabel, splitParagraphs } from "@/lib/humanizer/text";

export function buildHumanizerPrompt(
  request: HumanizeRequest,
  protectedEssay: string,
) {
  const paragraphCount = splitParagraphs(request.text).length;
  const originalWordCount = countWords(request.text);
  const protectedTerms = request.protectedTerms.length
    ? request.protectedTerms.join(", ")
    : "None provided";

  return `
You are rewriting an essay so it sounds more naturally human while keeping its meaning.

Hard requirements:
- Return exactly ${paragraphCount} paragraphs.
- Keep every citation placeholder exactly as written.
- Keep these protected terms exactly unchanged: ${protectedTerms}.
- Keep the final essay within +/- ${request.wordDelta} words of ${originalWordCount} words.
- Match this tone: ${request.tone}.
- Match this writing level: ${formatGradeLabel(request.gradeLevel)}.
- Prefer natural sentence restructuring over aggressive synonym swaps.
- Do not replace common words with strange, overly advanced, or mismatched words.
- Do not add fake facts, fake citations, or extra sources.

Return only the rewritten essay.

Essay to rewrite:
${protectedEssay}
`.trim();
}

export function buildRepairPrompt(
  previousOutput: string,
  violations: string[],
  request: HumanizeRequest,
) {
  const originalWordCount = countWords(request.text);

  return `
Repair this rewritten essay. Fix only the listed problems while preserving the rest of the writing.

Problems to fix:
${violations.map((item) => `- ${item}`).join("\n")}

Rules:
- Keep the same meaning as the original essay.
- Keep citations exactly unchanged.
- Keep protected terms exactly unchanged.
- Keep the final word count within +/- ${request.wordDelta} words of ${originalWordCount}.
- Tone must remain ${request.tone}.
- Writing level must remain ${formatGradeLabel(request.gradeLevel)}.

Return only the repaired essay.

Essay:
${previousOutput}
`.trim();
}
