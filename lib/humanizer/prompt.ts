import type { GradeLevel, HumanizeRequest, Tone } from "@/lib/humanizer/types";
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

function getWritingLevelGuidance(level: GradeLevel) {
  switch (level) {
    case "middle_school":
      return "Use plain, direct vocabulary and shorter sentence structures. Avoid technical or abstract diction.";
    case "high_school":
      return "Use clear, natural vocabulary with moderate sentence variety. Avoid jargon and overly academic phrasing.";
    case "college":
      return "Use thoughtful but natural vocabulary, with varied sentence structure that still sounds human and readable.";
    case "graduate":
      return "Use advanced but natural vocabulary with layered syntax when needed, without sounding stiff, inflated, or artificial.";
  }
}

function getToneGuidance(tone: Tone) {
  switch (tone) {
    case "casual":
      return "Keep the tone conversational, direct, and natural without becoming slangy or careless.";
    case "formal":
      return "Keep the tone polished and controlled, but still natural and human rather than corporate or robotic.";
    case "academic":
      return "Keep the tone thoughtful and analytical, but avoid canned academic framing or inflated jargon.";
  }
}

function buildGuardrailDetails(
  request: HumanizeRequest,
  paragraphCount: number,
  originalWordCount: number,
  citationPlaceholders: string[],
) {
  const intensity = getIntensityProfile(request.humanLikeLevel);
  const levelGuidance = getWritingLevelGuidance(request.gradeLevel);
  const toneGuidance = getToneGuidance(request.tone);

  return [
    `keep the final essay within +/- ${request.wordDelta} words of the original ${originalWordCount}-word essay`,
    `match the requested writing level: ${formatGradeLabel(request.gradeLevel)}`,
    `match the requested writing style/tone: ${request.tone}`,
    `match the human-like rewrite strength: ${request.humanLikeLevel}/100 (${intensity.label})`,
    `keep exactly ${paragraphCount} paragraphs`,
    `keep these protected words or phrases exactly unchanged: ${listOrNone(request.protectedTerms)}`,
    `keep every citation placeholder exactly unchanged: ${listOrNone(citationPlaceholders)}`,
    `follow this writing-level guidance: ${levelGuidance}`,
    `follow this tone guidance: ${toneGuidance}`,
    `do not use em dashes`,
    `do not use formulaic wrap-up phrases such as "Ultimately,", "In conclusion,", "To summarize,", or "Overall," unless they already appear in the source and must be preserved`,
    `do not use contrast-template phrasing such as "not X, but Y", "not just X, but Y", or similar constructions`,
    `do not write phrases like "The [thing] presents..." or "This essay/paper/article presents/explores/examines..."`,
    `do not use indirect framing such as "it is important to note", "it can be argued", or "it is worth noting"`,
    `avoid AI-coded or overly technical stock vocabulary such as "delve", "underscore", "meticulous", "commendable", "robust", "seamless", "pivotal", "comprehensive", "leverage", "intricate", "realm", "landscape", "nuanced", "transformative", or "paramount"`,
    `keep the writing natural, idiomatic, direct, and human-sounding`,
    `preserve the original meaning, facts, claims, point of view, and tone intent`,
  ].join("; ");
}

function buildBasePrompt(
  request: HumanizeRequest,
  protectedEssay: string,
  citationPlaceholders: string[],
  outerPassLabel: string,
  extraPassInstructions: string,
) {
  const paragraphCount = splitParagraphs(request.text).length;
  const originalWordCount = countWords(request.text);
  const intensity = getIntensityProfile(request.humanLikeLevel);
  const levelGuidance = getWritingLevelGuidance(request.gradeLevel);
  const toneGuidance = getToneGuidance(request.tone);
  const guardrailDetails = buildGuardrailDetails(
    request,
    paragraphCount,
    originalWordCount,
    citationPlaceholders,
  );

  return `
You are rewriting an essay so it reads like natural human writing while preserving the user's exact guardrails.

Boundary rules before generation:
- Keep the writing human, idiomatic, and natural.
- Use real paraphrasing, clause reshaping, phrasing changes, and sentence-flow changes rather than shallow synonym swaps.
- Prefer direct, concrete verbs and plain human word choices over inflated, abstract, technical, or AI-coded language.
- Do not use em dashes.
- Do not use formulaic conclusion phrases such as "Ultimately,", "In conclusion,", "To summarize,", "Overall,", or similar wrap-up language unless those exact phrases already appear in the source and must be preserved.
- Do not use contrast-template phrasing such as "not X, but Y", "not just X, but Y", or similar constructions.
- Do not write phrases like "The [thing] presents..." or "This essay/paper/article presents/explores/examines...".
- Do not use indirect framing such as "it is important to note", "it can be argued", "it is worth noting", or similar stock lead-ins.
- Avoid technical, overly academic, corporate, generic, or AI-coded vocabulary such as "delve", "underscore", "meticulous", "commendable", "robust", "seamless", "pivotal", "comprehensive", "leverage", "intricate", "realm", "landscape", "nuanced", "transformative", or "paramount".
- Writing-level rule: ${levelGuidance}
- Style rule: ${toneGuidance}
- Human-like rewrite strength: ${request.humanLikeLevel}/100 (${intensity.label})
- Intensity guidance: ${intensity.instruction}

Every iteration should STAY CONSISTENT with the word count range guardrail (+/- ${request.wordDelta}), the writing level (${formatGradeLabel(request.gradeLevel)}), the writing style (${request.tone}), the human-like re-write strength (${request.humanLikeLevel}/100), and all other user parameters.

Global rules for every iteration:
1. Preserve the original meaning, facts, claims, tone intent, point of view, and core message unless user guardrails explicitly allow changes.
2. Do not add new facts, examples, citations, statistics, or arguments.
3. Do not remove key meaning. Compression and expansion may change phrasing density, not substance.
4. Keep the output natural, idiomatic, and human-sounding.
5. Avoid stereotypical AI phrasing, polished filler, hedging clutter, and repetitive transitions.
6. Do not use em dashes.
7. Do not use formulaic conclusion phrases such as "Ultimately," "In conclusion," "To summarize," "Overall," or similar wrap-up language unless those exact phrases already appear in the source and user guardrails require keeping them.
8. Prefer synonym choices that sound human and context-appropriate rather than overly formal, corporate, academic, generic, or machine-like.
9. Some passes should intentionally stretch the prose and some should intentionally compress it, but all versions must still remain inside the user word-count guardrail.
10. For every step after step (a), use ONLY the immediately previous version as the source text. Completely ignore all earlier versions and the original essay. Treat the most recent version as the only source of truth.
11. After each iteration, generate only the new version for that step internally.
12. Do not explain what you changed unless explicitly asked.

Outer pass context:
- ${outerPassLabel}
- ${extraPassInstructions}

a. Create version (a) from the original essay only. Paraphrase at the micro level by replacing words and short phrases one at a time with less AI-like alternatives. Keep sentence order, sentence count, paragraph structure, and overall rhythm as close as possible to the original unless a change is required for fluency. Prioritize simple, natural synonym swaps that reduce robotic phrasing without changing meaning. Avoid high-frequency AI wording, inflated diction, and overly neat phrasing. (while adhering to user guardrails/rules: ${guardrailDetails})

b. Create version (b) using ONLY version (a). Re-order sentences where helpful, vary sentence openings, and shift the writing style noticeably while preserving natural flow and meaning. Keep the prose more straightforward and plainspoken than version (a), as if simplifying it for clarity. Do not look back at the original essay or any version before (a). (while adhering to user guardrails/rules: ${guardrailDetails})

c. Create version (c) using ONLY version (b). Push in the opposite direction from version (b): make the prose more layered, nuanced, and syntactically richer while still sounding human and staying within the same user guardrails. Introduce more variety in cadence, subordination, and phrasing, but do not become ornate, academic, or artificial. Do not consult any version except (b). (while adhering to user guardrails/rules: ${guardrailDetails})

d. Create version (d) using ONLY version (c). Compress the prose: shorten where possible, tighten word choice, reduce excess modifiers, and make the writing feel brisker and more direct. Keep all essential meaning and preserve a natural human voice. Do not consult any version except (c). (while adhering to user guardrails/rules: ${guardrailDetails})

e. Create version (e) using ONLY version (d). Stretch the prose moderately: add texture through sentence reshaping, clause variation, and more conversationally human phrasing, but do not add new information. Make it feel less compressed than version (d) and less polished than typical AI output. Do not consult any version except (d). (while adhering to user guardrails/rules: ${guardrailDetails})

f. Create version (f) using ONLY version (e). Rework the wording at the phrase level again, specifically targeting any remaining AI-sounding patterns, generic transitions, neat parallel structures, or overly balanced sentence construction. Favor human-typical word choices that fit the required writing level, whether simpler or more advanced per user guardrails. Do not consult any version except (e). (while adhering to user guardrails/rules: ${guardrailDetails})

g. Create version (g) using ONLY version (f). Change the stylistic texture again by varying rhythm sharply: mix shorter and longer sentences, alter paragraph movement, and make the flow feel less predictable while staying coherent. This pass should sound distinctly rephrased from version (f), not like a light edit. Do not consult any version except (f). (while adhering to user guardrails/rules: ${guardrailDetails})

h. Create version (h) using ONLY version (g). Perform the strongest final humanizing rewrite pass. Make this the most fully paraphrased version so far while preserving meaning, facts, and user constraints. Replace lingering machine-like phrasing, smooth out awkward spots, and ensure the result reads like an original human rewrite rather than a surface paraphrase. Do not consult any version except (g). (while adhering to user guardrails/rules: ${guardrailDetails})

i. Now evaluate ONLY version (h) against all user guardrails: word count range, writing level, writing style, human-like rewrite strength, banned patterns, and every other user parameter. If version (h) fails any guardrail, rewrite it once so it fully matches while keeping it as close as possible to version (h). Output only the corrected final version. Do not explain the check unless explicitly asked. (while adhering to user guardrails/rules: ${guardrailDetails})

Return policy:
- Perform steps (a) through (i) internally.
- Do not print steps (a) through (h).
- Output only the final corrected version from step (i) in the required format below.

Return exactly this format:
<rewritten_essay>
[only the final corrected version from step (i)]
</rewritten_essay>
<self_check>
{"protectedTermsKept":true,"citationsKept":true,"paragraphCountKept":true,"wordRangeKept":true,"toneMatched":true,"readingLevelMatched":true,"notes":["short note"]}
</self_check>

Essay to use as the source for step (a):
${protectedEssay}
`.trim();
}

export function buildHumanizerPrompt(
  request: HumanizeRequest,
  protectedEssay: string,
  citationPlaceholders: string[],
  attemptNumber = 1,
  totalPasses = 8,
) {
  return buildBasePrompt(
    request,
    protectedEssay,
    citationPlaceholders,
    `This is outer pass ${attemptNumber} of ${totalPasses}.`,
    "Focus on producing the strongest full a-through-i rewrite chain from the current source text.",
  );
}

export function buildRepairPrompt(
  request: HumanizeRequest,
  protectedEssay: string,
  violations: string[],
  citationPlaceholders: string[],
  attemptNumber: number,
  totalPasses: number,
) {
  return buildBasePrompt(
    request,
    protectedEssay,
    citationPlaceholders,
    `This is outer pass ${attemptNumber} of ${totalPasses}.`,
    `Prioritize repairing these issues in the final step (i): ${violations.length ? violations.join(" ") : "No explicit violations were passed in, so tighten the guardrails and keep the writing natural."}`,
  );
}

export function buildRefinementPrompt(
  request: HumanizeRequest,
  protectedEssay: string,
  citationPlaceholders: string[],
  attemptNumber: number,
  totalPasses: number,
) {
  return buildBasePrompt(
    request,
    protectedEssay,
    citationPlaceholders,
    `This is outer pass ${attemptNumber} of ${totalPasses}.`,
    "The current source text is already close. Focus on making the internal a-through-i chain produce a more natural final result without loosening any guardrail.",
  );
}

export function buildFinalizationPrompt(
  request: HumanizeRequest,
  protectedEssay: string,
  citationPlaceholders: string[],
  violations: string[],
  totalPasses: number,
) {
  return buildBasePrompt(
    request,
    protectedEssay,
    citationPlaceholders,
    `This is the final outer pass ${totalPasses} of ${totalPasses}.`,
    `This final pass must lock the best final step (i) result. Any remaining problems to correct: ${violations.length ? violations.join(" ") : "No explicit failures remain; tighten the final output while preserving all rules."}`,
  );
}
