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
      return "Use plain, direct vocabulary, mostly common words, and shorter sentence structures. Prefer simple sentence movement and avoid technical, abstract, or layered diction.";
    case "high_school":
      return "Use clear, natural vocabulary with moderate sentence variety. Allow some richer phrasing, but keep the wording accessible and avoid jargon or overly academic diction.";
    case "college":
      return "Use thoughtful, more advanced vocabulary and varied sentence structure, but keep the prose readable, direct, and recognizably human rather than inflated.";
    case "graduate":
      return "Use advanced but natural vocabulary with layered syntax, stronger precision, and more nuanced phrasing when needed, without sounding stiff, inflated, or artificial.";
  }
}

function getToneGuidance(tone: Tone) {
  switch (tone) {
    case "casual":
      return "Keep the tone conversational, direct, and more personal or in-person in feel when that matches the source point of view. Use simpler, more natural phrasing, occasional contractions when they fit, and a voice that sounds spoken rather than stiff, without becoming slangy or careless.";
    case "formal":
      return "Keep the tone polished, controlled, and more advanced in vocabulary and syntax than casual, while still sounding natural and human rather than corporate or robotic.";
  }
}

function getLexicalDiversificationGuidance(request: HumanizeRequest) {
  const toneRule =
    request.tone === "casual"
      ? "Keep the vocabulary simpler, more direct, and more spoken in feel. Prefer natural everyday synonyms, light contractions when they fit, and person-to-person phrasing over polished distance."
      : "Use broader and more advanced vocabulary than casual, but keep it clean and natural. Prefer precise, polished synonyms that a strong human writer would realistically choose, not showy thesaurus words.";

  const levelRule = (() => {
    switch (request.gradeLevel) {
      case "middle_school":
        return "Choose mostly common words. If you replace a word, keep the replacement familiar and easy to process.";
      case "high_school":
        return "Use mostly clear, common words with some richer alternatives where they still sound normal and readable.";
      case "college":
        return "Use more developed vocabulary and fresher word choices, but avoid stiff or inflated diction.";
      case "graduate":
        return "Use precise and layered vocabulary more often, but still sound like a person rather than a textbook or model output.";
    }
  })();

  const intensityRule =
    request.humanLikeLevel >= 80
      ? "Actively diversify verbs, modifiers, and repeated noun phrases. Rephrase whole clauses when a single-word swap would still sound too close to the source."
      : request.humanLikeLevel >= 45
        ? "Diversify repeated wording where it improves the prose, especially repeated verbs, transitions, and noun phrases."
        : "Keep vocabulary changes more restrained and favor only the clearest natural replacements.";

  return `${toneRule} ${levelRule} ${intensityRule}`;
}

function getIterationFocus(step: string, request: HumanizeRequest) {
  const toneFocus =
    request.tone === "casual"
      ? "Favor more conversational, direct, and person-to-person phrasing where it fits the source voice."
      : "Favor more polished, precise, and advanced phrasing while keeping the voice natural and readable.";

  const levelFocus = getWritingLevelGuidance(request.gradeLevel);

  const intensityFocus =
    request.humanLikeLevel >= 80
      ? "Push the paraphrasing harder and allow bolder sentence reshaping and local sentence swaps when they still sound natural."
      : request.humanLikeLevel >= 45
        ? "Use noticeable paraphrasing and selective sentence reshaping, but keep the flow stable."
        : "Keep the edits relatively light and stay closer to the source wording and order.";

  const orderFocus =
    step === "b" || step === "g"
      ? "You may swap nearby sentences or reorder local clauses when it improves flow, but do not change meaning-critical order or move whole paragraphs."
      : "Only change local order when it clearly improves fluency and still respects the original logic.";

  const lexicalFocus =
    step === "f" || step === "h" || step === "j"
      ? `Push vocabulary variety harder in this step. ${getLexicalDiversificationGuidance(request)}`
      : `Keep vocabulary choices aligned to the user settings. ${getLexicalDiversificationGuidance(request)}`;

  return `${toneFocus} ${levelFocus} ${intensityFocus} ${orderFocus} ${lexicalFocus}`;
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
  const lexicalGuidance = getLexicalDiversificationGuidance(request);
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
- Do not rely on stock transition openers such as "Furthermore,", "Moreover,", "Additionally,", or "Consequently,".
- Do not use canned framing such as "This highlights", "This underscores", or "plays a crucial role".
- Do not lean on filler patterns such as "in today's world", "in today's landscape", "at its core", "from this perspective", or similar generic framing.
- Do not overuse weak generic verbs such as "shows", "makes", "gives", or "seems" when a clearer context-specific verb would sound more natural.
- Do not stack too many abstract nouns ending in "-tion", "-ment", "-ness", "-ity", or similar forms when a more concrete rewrite would read better.
- Writing-level rule: ${levelGuidance}
- Style rule: ${toneGuidance}
- Vocabulary-diversification rule: ${lexicalGuidance}
- Human-like rewrite strength: ${request.humanLikeLevel}/100 (${intensity.label})
- Intensity guidance: ${intensity.instruction}

Research-informed guidance:
- Stylometry research comparing human and AI text finds that human writing tends to show richer stylistic variation, less uniform sentence length, less repeated sentence scaffolding, and less predictable transition use.
- Text evaluation work also emphasizes that human writing usually sounds less template-like, less evenly balanced, and more locally varied in syntax, rhythm, and clause movement.
- Human writing also tends to rely more on concrete wording, fewer stacked abstract nouns, fewer polished filler phrases, and less perfectly symmetrical sentence construction.
- Human writing also tends to vary verbs and repeated noun phrases more than model text that falls back on the same lexical scaffolding.
- Apply that guidance here by varying cadence naturally, reducing repeated transition scaffolds, mixing clause lengths, avoiding sentence blueprints that repeat, preferring concrete context-appropriate phrasing, rotating repeated word choices, and letting sentence-level order change when it improves natural flow.

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
13. Increase real rewording. Change wording at the word, phrase, clause, and sentence level instead of making only light edits.
14. Vary verbs first, then modifiers, then repeated noun phrases. When possible, replace repeated scaffolding with fresher phrasing.
15. Prefer rewriting full phrases or clauses over dropping in a rare single-word synonym that sounds forced.
16. Make the prose feel rewritten, not lightly polished.

Outer pass context:
- ${outerPassLabel}
- ${extraPassInstructions}

a. Create version (a) from the original essay only. Paraphrase at the micro level by replacing words and short phrases one at a time with less AI-like alternatives. Keep sentence order, sentence count, paragraph structure, and overall rhythm as close as possible to the original unless a change is required for fluency. Prioritize simple, natural synonym swaps that reduce robotic phrasing without changing meaning. Replace stale or generic wording where an easy human alternative would sound better. Avoid high-frequency AI wording, inflated diction, and overly neat phrasing. (while adhering to user guardrails/rules: ${guardrailDetails}. iteration-specific focus: ${getIterationFocus("a", request)})

b. Create version (b) using ONLY version (a). Re-order nearby sentences where helpful, vary sentence openings, and shift the writing style noticeably while preserving natural flow and meaning. Keep the prose more straightforward and plainspoken than version (a), as if simplifying it for clarity. Reshape sentences more boldly than in step (a), and rewrite short stretches at the clause level instead of only swapping words. You may swap nearby sentences if it improves flow, but do not rearrange whole paragraphs or move sentences when the logic depends on their original order. Do not look back at the original essay or any version before (a). (while adhering to user guardrails/rules: ${guardrailDetails}. iteration-specific focus: ${getIterationFocus("b", request)})

c. Create version (c) using ONLY version (b). Push in the opposite direction from version (b): make the prose more layered and syntactically richer while still sounding human and staying within the same user guardrails. Introduce more variety in cadence, subordination, and phrasing, but do not become ornate, academic, or artificial. Use fuller clause reshaping and vary how ideas are introduced so the text no longer follows the same sentence blueprint. Do not consult any version except (b). (while adhering to user guardrails/rules: ${guardrailDetails}. iteration-specific focus: ${getIterationFocus("c", request)})

d. Create version (d) using ONLY version (c). Compress the prose: shorten where possible, tighten word choice, reduce excess modifiers, and make the writing feel brisker and more direct. Keep all essential meaning and preserve a natural human voice. Replace weak helper-verb phrasing with stronger verbs where possible. Do not consult any version except (c). (while adhering to user guardrails/rules: ${guardrailDetails}. iteration-specific focus: ${getIterationFocus("d", request)})

e. Create version (e) using ONLY version (d). Stretch the prose moderately: add texture through sentence reshaping, clause variation, and more conversationally human phrasing, but do not add new information. Make it feel less compressed than version (d) and less polished than typical AI output. Expand through rephrasing and clause movement, not through filler. Do not consult any version except (d). (while adhering to user guardrails/rules: ${guardrailDetails}. iteration-specific focus: ${getIterationFocus("e", request)})

f. Create version (f) using ONLY version (e). Rework the wording at the phrase level again, specifically targeting any remaining AI-sounding patterns, generic transitions, neat parallel structures, stacked abstract nouns, or overly balanced sentence construction. This is a vocabulary-heavy pass: rotate repeated verbs, modifiers, and noun phrases more aggressively, prefer fresh but natural synonyms, and rewrite whole clauses when single-word substitution would still feel close to the source. Favor human-typical word choices that fit the required writing level, whether simpler or more advanced per user guardrails. Do not consult any version except (e). (while adhering to user guardrails/rules: ${guardrailDetails}. iteration-specific focus: ${getIterationFocus("f", request)})

g. Create version (g) using ONLY version (f). Change the stylistic texture again by varying rhythm sharply: mix shorter and longer sentences, alter paragraph movement, and make the flow feel less predictable while staying coherent. This pass should sound distinctly rephrased from version (f), not like a light edit. You may swap nearby sentences or shift local clause order if it reads more naturally, but do not rearrange entire paragraphs or disturb meaning-critical order. Use the new order changes to break repeated sentence scaffolding, not just to shuffle words around. Do not consult any version except (f). (while adhering to user guardrails/rules: ${guardrailDetails}. iteration-specific focus: ${getIterationFocus("g", request)})

h. Create version (h) using ONLY version (g). Perform the strongest final humanizing rewrite pass. Make this the most fully paraphrased version so far while preserving meaning, facts, and user constraints. Replace lingering machine-like phrasing, smooth out awkward spots, and ensure the result reads like an original human rewrite rather than a surface paraphrase. Increase real wording change here: vary phrases, clauses, and sentence shapes more aggressively while still sounding natural. Do not consult any version except (g). (while adhering to user guardrails/rules: ${guardrailDetails}. iteration-specific focus: ${getIterationFocus("h", request)})

i. Now evaluate ONLY version (h) against all user guardrails: word count range, writing level, writing style, human-like rewrite strength, banned patterns, every other user parameter, and the final vocabulary fit. If version (h) fails any guardrail, rewrite it once so it fully matches while keeping it as close as possible to version (h). Also correct vocabulary mismatches such as wording that is too flat, too inflated, too repetitive, or wrong for the selected tone and writing level. Output only the corrected version (i). Do not explain the check unless explicitly asked. (while adhering to user guardrails/rules: ${guardrailDetails}. iteration-specific focus: ${getIterationFocus("i", request)})

j. Create version (j) using ONLY version (i). Perform one final research-informed human rewrite/paraphrase pass that stays very close to version (i) while making the flow feel more naturally human. Use the research-informed guidance above: add natural variation in cadence, avoid repeated connective scaffolding, keep sentence movement less mechanically balanced, vary clause size, favor concrete context-appropriate phrasing, and rotate any remaining repeated words with fresher natural alternatives. Do not use odd or inflated synonyms. Only use vocabulary shifts that fit the required writing level and tone. This should feel like a final human rewrite, not a new essay. Do not consult any version except (i). Before answering, verify that version (j) still satisfies every user guardrail exactly. (while adhering to user guardrails/rules: ${guardrailDetails}. iteration-specific focus: ${getIterationFocus("j", request)})

Return policy:
- Perform steps (a) through (j) internally.
- Do not print steps (a) through (i).
- Output only the final version from step (j) in the required format below.

Return exactly this format:
<rewritten_essay>
[only the final version from step (j)]
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
    "Focus on producing the strongest full a-through-j rewrite chain from the current source text.",
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
    `Prioritize repairing these issues by step (i), then keep step (j) clean and natural: ${violations.length ? violations.join(" ") : "No explicit violations were passed in, so tighten the guardrails and keep the writing natural."}`,
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
    "The current source text is already close. Focus on making the internal a-through-j chain produce a more natural final result without loosening any guardrail.",
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
    `This final pass must lock the best final step (j) result. Any remaining problems to correct before the final human rewrite/paraphrase: ${violations.length ? violations.join(" ") : "No explicit failures remain; tighten the final output while preserving all rules."}`,
  );
}
