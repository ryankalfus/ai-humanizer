import type { HumanizeRequest } from "@/lib/humanizer/types";
import { countWords, formatGradeLabel, splitParagraphs } from "@/lib/humanizer/text";

function listOrNone(items: string[]) {
  return items.length ? items.join(", ") : "None provided";
}

function getIntensityProfile(level: number) {
  if (level <= 25) {
    return {
      label: "light",
      instruction:
        "Make lighter changes. Prefer subtle rewrites, gentle paraphrasing, and only modest reordering.",
    };
  }

  if (level <= 60) {
    return {
      label: "balanced",
      instruction:
        "Make moderate changes. Use clear paraphrasing, noticeable sentence reshaping, and selective reordering where it improves flow.",
    };
  }

  if (level <= 85) {
    return {
      label: "strong",
      instruction:
        "Make strong changes. Use deeper paraphrasing, broader sentence restructuring, and more meaningful reordering while keeping the same meaning.",
    };
  }

  return {
    label: "very strong",
    instruction:
      "Make very strong changes. Use rigorous paraphrasing, assertive restructuring, and substantial reordering while still preserving all hard rules and the original meaning.",
  };
}

export function buildHumanizerPrompt(
  request: HumanizeRequest,
  protectedEssay: string,
  citationPlaceholders: string[],
  attemptNumber = 1,
  totalPasses = 8,
) {
  const paragraphCount = splitParagraphs(request.text).length;
  const originalWordCount = countWords(request.text);
  const intensity = getIntensityProfile(request.humanLikeLevel);

  return `
You are rewriting an essay so it sounds natural, personal, and closer to a real writer's voice while keeping the same meaning.

Writing goals:
- Paraphrase by reshaping sentences and clauses, not by swapping words one by one.
- Rewrite stiff or generic lines into more natural phrasing.
- Change wording where it helps the prose sound less repetitive and less boilerplate.
- Reorder clauses and sentence flow when that improves rhythm and readability.
- Vary sentence openings naturally.
- Avoid overly uniform sentence lengths.
- Reduce formulaic transitions and boilerplate phrasing.
- Keep vocabulary aligned with the requested writing level.
- Prefer simple, context-matching wording over fancy or mismatched synonyms.
- Do not over-formalize simple ideas.
- Keep the writing smooth and believable, not flashy.
- Let the prose breathe: some sentences can be short, some can be longer, but they should still feel deliberate.
- Keep the writer's meaning and emphasis intact even when you rephrase heavily.
- Human-like rewrite strength is set to ${request.humanLikeLevel}/100 (${intensity.label}).
- ${intensity.instruction}

Hard rules:
- Return exactly ${paragraphCount} paragraphs.
- Keep every citation placeholder exactly as written: ${listOrNone(citationPlaceholders)}.
- Keep these protected words or phrases exactly unchanged: ${listOrNone(request.protectedTerms)}.
- Keep the final essay within +/- ${request.wordDelta} words of ${originalWordCount} words.
- Match this tone: ${request.tone}.
- Match this writing level: ${formatGradeLabel(request.gradeLevel)}.
- Preserve the original meaning.
- Do not add fake facts, fake citations, or new sources.

Rewrite method:
1. Read the full essay and identify the main meaning of each paragraph.
2. Rewrite each paragraph in a fresh way, using real paraphrasing and sentence restructuring.
3. Replace words only when the replacement is natural, common, and context-matching.
4. Vary rhythm, phrasing, and sentence order so the writing does not feel machine-flat.
5. Before answering, confirm that every hard rule still holds.

Current pass:
- This is pass ${attemptNumber} of ${totalPasses}.
- Make the writing feel fresher and less template-like than the previous attempt.

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
  attemptNumber: number,
  totalPasses: number,
) {
  const paragraphCount = splitParagraphs(request.text).length;
  const originalWordCount = countWords(request.text);
  const intensity = getIntensityProfile(request.humanLikeLevel);

  return `
Repair this rewritten essay. Only fix the listed problems while keeping the parts that already sound natural.

Problems to fix:
${violations.map((item) => `- ${item}`).join("\n")}

Writing goals:
- Keep the natural, human-sounding parts intact.
- Make the minimum edits needed.
- Avoid stiff, robotic, or thesaurus-heavy wording.
- If a sentence still sounds generic or machine-flat, rewrite it more naturally while preserving meaning.
- Use phrasing changes, clause reshaping, and word changes only where needed.
- Human-like rewrite strength is set to ${request.humanLikeLevel}/100 (${intensity.label}).
- ${intensity.instruction}

Hard rules:
- Return exactly ${paragraphCount} paragraphs.
- Keep every citation placeholder exactly as written: ${listOrNone(citationPlaceholders)}.
- Keep these protected words or phrases exactly unchanged: ${listOrNone(request.protectedTerms)}.
- Keep the final essay within +/- ${request.wordDelta} words of ${originalWordCount} words.
- Match this tone: ${request.tone}.
- Match this writing level: ${formatGradeLabel(request.gradeLevel)}.
- Preserve the original meaning.

Repair method:
1. Fix only the listed failures first.
2. Preserve good phrasing that already works.
3. If needed, lightly rephrase nearby sentences so the repaired result still sounds natural.
4. Before answering, confirm that every hard rule now holds.

Current pass:
- This is pass ${attemptNumber} of ${totalPasses}.
- Improve the writing while fixing the listed problems.

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

export function buildRefinementPrompt(
  request: HumanizeRequest,
  protectedEssay: string,
  citationPlaceholders: string[],
  attemptNumber: number,
  totalPasses: number,
) {
  const paragraphCount = splitParagraphs(request.text).length;
  const originalWordCount = countWords(request.text);
  const intensity = getIntensityProfile(request.humanLikeLevel);

  return `
Refine this already-valid essay so it sounds even more natural, more varied, and more human in rhythm while keeping every requirement exact.

Refinement goals:
- Keep the same meaning.
- Keep the strongest natural phrasing.
- Rewrite any remaining generic or flat wording into fresher language.
- Use meaningful paraphrasing, clause reordering, and smoother sentence flow.
- Vary sentence openings and pacing.
- Avoid robotic repetition and overly neat symmetry.
- Replace wording only when the replacement is common, clear, and context-matching.
- Human-like rewrite strength is set to ${request.humanLikeLevel}/100 (${intensity.label}).
- ${intensity.instruction}

Hard rules:
- Return exactly ${paragraphCount} paragraphs.
- Keep every citation placeholder exactly as written: ${listOrNone(citationPlaceholders)}.
- Keep these protected words or phrases exactly unchanged: ${listOrNone(request.protectedTerms)}.
- Keep the final essay within +/- ${request.wordDelta} words of ${originalWordCount} words.
- Match this tone: ${request.tone}.
- Match this writing level: ${formatGradeLabel(request.gradeLevel)}.
- Preserve the original meaning.

Current pass:
- This is pass ${attemptNumber} of ${totalPasses}.
- Keep all hard rules fully intact while refining the writing.

Return exactly this format:
<rewritten_essay>
[the refined essay only]
</rewritten_essay>
<self_check>
{"protectedTermsKept":true,"citationsKept":true,"paragraphCountKept":true,"wordRangeKept":true,"toneMatched":true,"readingLevelMatched":true,"notes":["short note"]}
</self_check>

Essay to refine:
${protectedEssay}
`.trim();
}

export function buildFinalizationPrompt(
  request: HumanizeRequest,
  protectedEssay: string,
  citationPlaceholders: string[],
  violations: string[],
  totalPasses: number,
) {
  const paragraphCount = splitParagraphs(request.text).length;
  const originalWordCount = countWords(request.text);
  const intensity = getIntensityProfile(request.humanLikeLevel);

  return `
This is the final pass. Produce the strongest final essay while locking every required guardrail.

Final goals:
- Keep the writing natural, smooth, and believable.
- Preserve the strongest phrasing already present.
- Fix any remaining guardrail problems completely.
- If needed, rephrase flat or awkward lines without changing the meaning.
- Human-like rewrite strength is set to ${request.humanLikeLevel}/100 (${intensity.label}).
- ${intensity.instruction}

Remaining issues to fix now:
${violations.length ? violations.map((item) => `- ${item}`).join("\n") : "- No explicit failures remain; lock the guardrails and polish the flow."}

Hard rules:
- Return exactly ${paragraphCount} paragraphs.
- Keep every citation placeholder exactly as written: ${listOrNone(citationPlaceholders)}.
- Keep these protected words or phrases exactly unchanged: ${listOrNone(request.protectedTerms)}.
- Keep the final essay within +/- ${request.wordDelta} words of ${originalWordCount} words.
- Match this tone: ${request.tone}.
- Match this writing level: ${formatGradeLabel(request.gradeLevel)}.
- Preserve the original meaning.
- Do not add fake facts, fake citations, or new sources.

Final pass method:
1. Check every hard rule before writing.
2. Fix any remaining violations first.
3. Improve natural flow only where it does not break the rules.
4. Before answering, verify that every hard rule holds.
5. This is the final pass ${totalPasses} of ${totalPasses}; prioritize a strong final rewrite that still obeys every rule.

Return exactly this format:
<rewritten_essay>
[the final essay only]
</rewritten_essay>
<self_check>
{"protectedTermsKept":true,"citationsKept":true,"paragraphCountKept":true,"wordRangeKept":true,"toneMatched":true,"readingLevelMatched":true,"notes":["short note"]}
</self_check>

Essay to finalize:
${protectedEssay}
`.trim();
}
