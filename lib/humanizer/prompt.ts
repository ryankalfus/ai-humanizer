import type { HumanizeRequest } from "@/lib/humanizer/types";
import { countWords, formatGradeLabel, splitParagraphs } from "@/lib/humanizer/text";

function listOrNone(items: string[]) {
  return items.length ? items.join(", ") : "None provided";
}

export function buildHumanizerPrompt(
  request: HumanizeRequest,
  protectedEssay: string,
  citationPlaceholders: string[],
) {
  const paragraphCount = splitParagraphs(request.text).length;
  const originalWordCount = countWords(request.text);

  return `
You are rewriting an essay so it sounds more natural, more personal, and closer to a real writer's voice while keeping the same meaning.

Writing goals:
- Paraphrase by reshaping sentences and clauses, not by swapping words one by one.
- Vary sentence openings naturally.
- Avoid overly uniform sentence lengths.
- Reduce formulaic transitions and boilerplate phrasing.
- Keep vocabulary aligned with the requested writing level.
- Prefer simple, context-matching wording over fancy or mismatched synonyms.
- Do not over-formalize simple ideas.

Hard rules:
- Return exactly ${paragraphCount} paragraphs.
- Keep every citation placeholder exactly as written: ${listOrNone(citationPlaceholders)}.
- Keep these protected words or phrases exactly unchanged: ${listOrNone(request.protectedTerms)}.
- Keep the final essay within +/- ${request.wordDelta} words of ${originalWordCount} words.
- Match this tone: ${request.tone}.
- Match this writing level: ${formatGradeLabel(request.gradeLevel)}.
- Preserve the original meaning.
- Do not add fake facts, fake citations, or new sources.

Return exactly this format:
<rewritten_essay>
[the rewritten essay only]
</rewritten_essay>
<self_check>
{"protectedTermsKept":true,"citationsKept":true,"paragraphCountKept":true,"wordRangeKept":true,"toneMatched":true,"readingLevelMatched":true,"notes":["short note"]}
</self_check>

Essay to rewrite:
${protectedEssay}
`.trim();
}

export function buildRepairPrompt(
  request: HumanizeRequest,
  protectedEssay: string,
  violations: string[],
  citationPlaceholders: string[],
) {
  const paragraphCount = splitParagraphs(request.text).length;
  const originalWordCount = countWords(request.text);

  return `
Repair this rewritten essay. Only fix the listed problems while keeping the parts that already sound natural.

Problems to fix:
${violations.map((item) => `- ${item}`).join("\n")}

Writing goals:
- Keep the natural, human-sounding parts intact.
- Make the minimum edits needed.
- Avoid stiff, robotic, or thesaurus-heavy wording.

Hard rules:
- Return exactly ${paragraphCount} paragraphs.
- Keep every citation placeholder exactly as written: ${listOrNone(citationPlaceholders)}.
- Keep these protected words or phrases exactly unchanged: ${listOrNone(request.protectedTerms)}.
- Keep the final essay within +/- ${request.wordDelta} words of ${originalWordCount} words.
- Match this tone: ${request.tone}.
- Match this writing level: ${formatGradeLabel(request.gradeLevel)}.
- Preserve the original meaning.

Return exactly this format:
<rewritten_essay>
[the repaired essay only]
</rewritten_essay>
<self_check>
{"protectedTermsKept":true,"citationsKept":true,"paragraphCountKept":true,"wordRangeKept":true,"toneMatched":true,"readingLevelMatched":true,"notes":["short note"]}
</self_check>

Essay to repair:
${protectedEssay}
`.trim();
}
