import type { GradeLevel, HumanizeRequest, Tone } from "@/lib/humanizer/types";
import { countWords, formatGradeLabel, splitParagraphs } from "@/lib/humanizer/text";

function listOrNone(items: string[]) {
  return items.join(", ");
}

function getIntensityProfile(level: number) {
  if (level <= 10) {
    return {
      label: "minimal",
      instruction:
        "Make very light changes. Keep the rewrite close to the source, with only limited paraphrasing, light phrase cleanup, and almost no reordering.",
    };
  }

  if (level <= 25) {
    return {
      label: "light",
      instruction:
        "Make lighter changes. Prefer subtle rewrites, gentle paraphrasing, and only modest reordering, but still avoid returning wording that stays too close to the source.",
    };
  }

  if (level <= 45) {
    return {
      label: "moderate",
      instruction:
        "Make moderate changes. Use clear paraphrasing, noticeable sentence reshaping, selective reordering where it improves flow, and enough wording change that the prose does not read like a surface edit.",
    };
  }

  if (level <= 70) {
    return {
      label: "strong",
      instruction:
        "Make strong changes. Use deeper paraphrasing, broader sentence restructuring, more meaningful reordering, and fuller vocabulary rotation while keeping the same meaning. At this intensity, start pushing statistical naturalness too: increase sentence-length variance, reduce repeated structural templates, and break overly smooth rhythm where it makes the prose feel processed.",
    };
  }

  if (level <= 85) {
    return {
      label: "very strong",
      instruction:
        "Make very strong changes. Use rigorous paraphrasing, assertive restructuring, substantial reordering, sentence splitting and merging, and major vocabulary rotation while still preserving all hard rules and the original meaning. At this intensity, also focus on statistical naturalness: ensure high sentence-length variance, break repeated paragraph-level patterns, and include occasional unexpected structural choices that create natural unpredictability in the prose rhythm.",
    };
  }

  return {
    label: "maximum",
    instruction:
      "Make maximum changes. Rewrite very aggressively at the phrase, clause, and sentence level. Use deep paraphrasing, strong sentence rebuilding, local order changes, sentence splitting and merging, and major vocabulary rotation so the final result feels fully rewritten. At this intensity, also maximize statistical naturalness: push sentence-length variance high, avoid any repeated structural templates across paragraphs, inject natural imperfections and unexpected structural choices, and ensure the output would read as a confident human writer's original draft rather than a carefully processed rewrite.",
  };
}

function getRewriteDistanceTarget(level: number) {
  if (level <= 10) {
    return "Keep the rewrite very close to the original. Only clean up wording lightly and avoid broad structural change.";
  }

  if (level <= 25) {
    return "Keep the rewrite fairly close to the original, but still paraphrase enough that it does not read like a copy edit.";
  }

  if (level <= 45) {
    return "Aim for a moderate rewrite distance. Change a noticeable amount of wording and some sentence structure.";
  }

  if (level <= 70) {
    return "Aim for a strong rewrite distance. Change a large amount of wording, many phrases, and plenty of sentence structure.";
  }

  if (level <= 85) {
    return "Aim for a very strong rewrite distance. The result should feel substantially rephrased across most sentences while preserving meaning.";
  }

  return "Aim for the maximum rewrite distance allowed by the guardrails. The final result should feel fully rewritten in wording and sentence construction, not lightly edited.";
}

function getWritingLevelGuidance(level: GradeLevel) {
  switch (level) {
    case "middle_school":
      return "Use plain, direct vocabulary, mostly common words, and shorter sentence structures. Prefer simple sentence movement and avoid technical, abstract, or layered diction.";
    case "high_school":
      return "Use clear, natural vocabulary with moderate sentence variety. Allow some richer phrasing, but keep the wording accessible and avoid jargon or overly academic diction.";
    case "college":
      return "Use thoughtful, more advanced vocabulary and varied sentence structure. Choose fresher and somewhat less common words when they fit naturally, but keep the prose readable, direct, and recognizably human rather than inflated.";
    case "graduate":
      return "Use advanced but natural vocabulary with layered syntax, stronger precision, and more nuanced phrasing when needed. Allow more specialized and less common diction when it reads smoothly, without sounding stiff, inflated, or artificial.";
  }
}

function getToneGuidance(tone: Tone) {
  switch (tone) {
    case "casual":
      return "Keep the tone conversational, direct, and more personal or in-person in feel when that matches the source point of view. Use simpler, more natural phrasing, occasional contractions when they fit, and a voice that sounds spoken rather than stiff, without becoming slangy or careless.";
    case "formal":
      return "Keep the tone polished, controlled, and more advanced in vocabulary and syntax than casual. Lean into more precise and somewhat less common diction when it still sounds natural and human rather than corporate or robotic.";
  }
}

function getLexicalDiversificationGuidance(request: HumanizeRequest) {
  const toneRule =
    request.tone === "casual"
      ? "Keep the vocabulary simpler, more direct, and more spoken in feel. Prefer natural everyday synonyms, light contractions when they fit, and person-to-person phrasing over polished distance."
      : "Use broader and more advanced vocabulary than casual, but keep it clean and natural. Prefer precise, polished synonyms and less common but still believable word choices that a strong human writer would realistically choose, not showy thesaurus words.";

  const levelRule = (() => {
    switch (request.gradeLevel) {
      case "middle_school":
        return "Choose mostly common words. If you replace a word, keep the replacement familiar and easy to process.";
      case "high_school":
        return "Use mostly clear, common words with some richer alternatives where they still sound normal and readable.";
      case "college":
        return "Use more developed vocabulary, fresher word choices, and more lexical variety. Favor less common but still natural words over flat generic repeats, while avoiding stiff or inflated diction.";
      case "graduate":
        return "Use precise and layered vocabulary more often, including less common words when they fit naturally. Keep the voice human and readable rather than textbook-like or model-like.";
    }
  })();

  const intensityRule =
    request.humanLikeLevel >= 80
      ? "Actively diversify verbs, modifiers, and repeated noun phrases. Rephrase whole clauses when a single-word swap would still sound too close to the source. Replace flat generic wording with more distinctive but still natural alternatives."
      : request.humanLikeLevel >= 45
        ? "Diversify repeated wording where it improves the prose, especially repeated verbs, transitions, and noun phrases. Introduce fresher vocabulary when it still matches the requested tone and level."
        : "Keep vocabulary changes more restrained and favor only the clearest natural replacements.";

  return `${toneRule} ${levelRule} ${intensityRule}`;
}

function getParagraphLevelGuidance(level: number) {
  if (level <= 25) {
    return "Keep paragraph-level change restrained. Lightly improve flow inside each paragraph, but do not force broad discourse reshaping.";
  }

  if (level <= 55) {
    return "Rewrite at the paragraph level, not just sentence by sentence. Let each paragraph gain a clearer internal flow and less repetitive scaffolding.";
  }

  if (level <= 80) {
    return "Use paragraph-level paraphrasing. Change how ideas move inside each paragraph, vary how sentences connect, and reduce repeated discourse scaffolding instead of only polishing sentences one at a time.";
  }

  return "Use strong paragraph-level paraphrasing. Rebuild the language of each paragraph as a whole, vary discourse movement inside the paragraph, and avoid leaving original sentence patterns intact when a fuller rewrite is possible.";
}

function usesFormalAcademicNaturalnessOverrides(request: HumanizeRequest) {
  return (
    request.tone === "formal" &&
    (request.gradeLevel === "college" || request.gradeLevel === "graduate") &&
    request.humanLikeLevel >= 80
  );
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
  const paragraphGuidance = getParagraphLevelGuidance(request.humanLikeLevel);
  const protectedTermsRule = request.protectedTerms.length
    ? `keep these protected words or phrases exactly unchanged: ${listOrNone(request.protectedTerms)}`
    : "there are no protected words or phrases to preserve, so do not insert any placeholder text or mention that none were provided";
  const citationsRule = citationPlaceholders.length
    ? `keep every citation placeholder exactly unchanged: ${listOrNone(citationPlaceholders)}`
    : "there are no citation placeholders in this essay, so do not insert any placeholder text or mention that none were provided";

  return [
    `CRITICAL HARD CONSTRAINT: The final output MUST be between ${originalWordCount - request.wordDelta} and ${originalWordCount + request.wordDelta} words (original: ${originalWordCount} words, allowed range: +/- ${request.wordDelta}). Count carefully. This is the single most important structural rule - violating it is a failure regardless of all other quality`,
    `match the requested writing level: ${formatGradeLabel(request.gradeLevel)}`,
    `match the requested writing style/tone: ${request.tone}`,
    `match the human-like rewrite strength: ${request.humanLikeLevel}/100 (${intensity.label})`,
    `keep exactly ${paragraphCount} paragraphs`,
    protectedTermsRule,
    citationsRule,
    `follow this writing-level guidance: ${levelGuidance}`,
    `follow this tone guidance: ${toneGuidance}`,
    `follow this paragraph-level rewrite guidance: ${paragraphGuidance}`,
    `STATISTICAL TARGETS — these are hard requirements:
- Sentence-length coefficient of variation (stddev / mean) must be >= 0.40 per paragraph
- At least 15% of all sentences must be under 10 words
- At least 10% of all sentences must be over 25 words
- No paragraph may have all sentences within +/- 5 words of each other
- Transition word density must not exceed 3% of total word count
- No transition word may be used as a sentence opener more than twice in the entire essay
- Content-to-function word ratio must be between 0.85 and 1.10
- The median word-count difference between consecutive sentences must be >= 6 words`,
    `ANTI-PATTERNS — actively avoid these:
- Do not write sentences that all land at 15-20 words. Human paragraphs contain 5-word sentences and 35-word sentences in the same paragraph.
- Do not use the same paragraph template more than once. If paragraph 1 is claim -> evidence -> evaluation, paragraph 2 must use a different internal structure.
- Do not begin more than one paragraph with a dependent clause using the same conjunction.
- Do not use present participial phrases (main clause, comma, -ing verb) more than once per 300 words.
- Do not use "From X to Y" overview constructions.
- Do not write perfectly balanced sentence pairs where one sentence states a point and the next qualifies it with matching structure and similar length.`,
    `avoid the flagged verbs, adjectives, adverbs, nouns, and phrases listed in the boundary rules above`,
    `keep the writing natural, idiomatic, direct, and human-sounding`,
    `preserve the original meaning, facts, claims, point of view, and tone intent`,
  ].join("; ");
}

function buildThreePassInstructions(
  request: HumanizeRequest,
  paragraphCount: number,
  originalWordCount: number,
  guardrailDetails: string,
) {
  const minWordCount = originalWordCount - request.wordDelta;
  const maxWordCount = originalWordCount + request.wordDelta;
  const formalOverride = usesFormalAcademicNaturalnessOverrides(request)
    ? `
FORMAL-REGISTER NATURALNESS OVERRIDES (these apply because formal academic text is the hardest case for natural writing):
- Sentence length: target a mean of 18-22 words with standard deviation of 8-12 words PER PARAGRAPH. This means some sentences of 5-8 words and some of 30-40 words in every paragraph. Do NOT cluster all sentences at 15-20 words.
- The word-count difference between consecutive sentences should average 6-10 words. Do not write three sentences in a row with similar lengths.
- Vary paragraph length: some paragraphs should have 2-3 sentences, some 5-7. Do not make all paragraphs 3-5 sentences.
- Content-to-function-word ratio: human academic writing uses a roughly 1:1 ratio of content words to function words. AI text over-indexes on content words (ratio ~1.37). Include more function words, hedges, and connective tissue.
- At 3-5 points per 500 words, choose a word that is NOT the most obvious or highest-probability choice. Pick a less common but still natural synonym - the kind of word a human would reach for after a moment of thought, not the first word that comes to mind.
`
    : "";

  return `
PASS 1 — STRUCTURAL OVERHAUL:
Rewrite the essay from the source. Focus ONLY on structure:
- Split at least 20% of sentences and merge at least 10%
- Vary paragraph openings: no two paragraphs may begin with the same syntactic structure
- Do NOT start every paragraph with a topic sentence; begin some with evidence, a concession, a qualification, or a mid-thought continuation
- Move the main claim away from the first sentence in at least half the paragraphs
- Break any repeated claim -> example -> evaluation template
- Reorder nearby sentences when it improves flow
- Keep meaning and facts intact
- Keep the paragraph count at exactly ${paragraphCount}
- Stay inside these guardrails: ${guardrailDetails}
Output this as version (1).

PASS 2 — VOCABULARY AND TRANSITIONS:
Using ONLY version (1), rewrite focusing on vocabulary and transitions:
- Replace every flagged AI-vocabulary word (see boundary rules above)
- Cut additive transition stacking ("furthermore," "moreover," "additionally")
- Prefer equivocal connectors: "but," "though," "however," "still," "granted," "admittedly"
- Add natural hedges and stance markers where appropriate: "arguably," "to some extent," "it seems"
- Maintain content-to-function word ratio near 1.0 (not 1.37). Add function words, hedges, and connective tissue where the prose feels too content-heavy
- At 3-5 points per 500 words, choose a word that is NOT the most obvious choice - pick a less common but still natural synonym
- Do not consult version (1)'s source or the original essay
- Keep the total within ${minWordCount}-${maxWordCount} words
Output this as version (2).

PASS 3 — RHYTHM, BURSTINESS, AND FINAL POLISH:
Using ONLY version (2), rewrite focusing on rhythm:
- Target sentence-length mean of 16-22 words with standard deviation of 8-12 words PER PARAGRAPH
- Include at least one sentence under 8 words and one over 30 words per 3-4 paragraphs
- The word-count difference between consecutive sentences should average 6-10 words
- No three consecutive sentences may have similar word counts (within +/- 5 words)
- No two consecutive sentences may start with the same part of speech
- Add 2-3 entropy injections per 500 words: unusual clause order, sentence starting with "And"/"But", a deliberate fragment, a parenthetical aside, a rhetorical question
- Add 2-3 controlled imperfections per 500 words: a slightly abrupt transition, a point restated in slightly different terms, an informal aside, uneven depth of development
- Verify final word count is within ${minWordCount}-${maxWordCount}
- Do not over-smooth the output
${formalOverride.trim()}
Output this as the final version.
`.trim();
}

function buildBasePrompt(
  request: HumanizeRequest,
  protectedEssay: string,
  citationPlaceholders: string[],
  outerPassLabel: string,
  extraPassInstructions: string,
) {
  const originalParagraphs = splitParagraphs(request.text);
  const paragraphCount = originalParagraphs.length;
  const originalWordCount = countWords(request.text);
  const minWordCount = originalWordCount - request.wordDelta;
  const maxWordCount = originalWordCount + request.wordDelta;
  const intensity = getIntensityProfile(request.humanLikeLevel);
  const rewriteDistanceTarget = getRewriteDistanceTarget(request.humanLikeLevel);
  const levelGuidance = getWritingLevelGuidance(request.gradeLevel);
  const toneGuidance = getToneGuidance(request.tone);
  const lexicalGuidance = getLexicalDiversificationGuidance(request);
  const paragraphGuidance = getParagraphLevelGuidance(request.humanLikeLevel);
  const useFormalAcademicOverrides = usesFormalAcademicNaturalnessOverrides(request);
  const guardrailDetails = buildGuardrailDetails(
    request,
    paragraphCount,
    originalWordCount,
    citationPlaceholders,
  );
  const passInstructions = buildThreePassInstructions(
    request,
    paragraphCount,
    originalWordCount,
    guardrailDetails,
  );
  const paragraphTemplate = Array.from(
    { length: paragraphCount },
    (_, index) => `<p${index + 1}>[paragraph ${index + 1} text]</p${index + 1}>`,
  ).join("\n");
  const perParagraphWordCounts = originalParagraphs.map(
    (paragraph, index) => `Paragraph ${index + 1}: ~${countWords(paragraph)} words`,
  );

  return `
You are rewriting an essay so it reads like natural human writing while preserving the user's exact guardrails.

STEP 0 — WORD BUDGET PLAN (do this BEFORE starting PASS 1):
Before writing anything, allocate the total word budget (${originalWordCount} words, range ${minWordCount}-${maxWordCount}) across all ${paragraphCount} paragraphs. Write out the allocation as:
Paragraph 1: ~X words
Paragraph 2: ~Y words
...
Paragraph N: ~Z words
Total: ~${originalWordCount} words

Use the original per-paragraph word counts as starting guidance but allow +/- 20% variation between paragraphs to avoid uniform paragraph sizes. Track your running word count during generation.

Boundary rules before generation:
- Keep the writing human, idiomatic, and natural.
- Use real paraphrasing, clause reshaping, phrasing changes, and sentence-flow changes rather than shallow synonym swaps.
- Make the result materially different in wording from the source. Do not preserve original sentence shells when a natural rewrite is possible.
- Model-fingerprint mitigation: Do not default to your most natural or highest-probability phrasing patterns. Actively vary clause ordering, transition choices, and sentence openings. When you notice yourself reaching for a comfortable default phrasing, choose the second or third option instead.
- Prefer direct, concrete verbs and plain human word choices over inflated, abstract, technical, or AI-coded language.
- Do not use em dashes.
- Do not use formulaic conclusion phrases such as "Ultimately,", "In conclusion,", "To summarize,", "Overall,", or similar wrap-up language unless those exact phrases already appear in the source and must be preserved.
- Do not use contrast-template phrasing such as "not X, but Y", "not just X, but Y", or similar constructions.
- Do not write phrases like "The [thing] presents..." or "This essay/paper/article presents/explores/examines...".
- Do not use indirect framing such as "it is important to note", "it can be argued", "it is worth noting", or similar stock lead-ins.
- Avoid these vocabulary verbs: "delve", "underscore", "showcase", "illuminate", "elucidate", "foster", "harness", "intertwine", "reimagine", "revolutionize", "transcend", "unleash", "unlock", "unravel", "weave", "embark", "craft", "navigate", "leverage".
- Avoid these flagged AI-vocabulary adjectives: "commendable", "meticulous", "multifaceted", "pivotal", "nuanced", "indelible", "invaluable", "groundbreaking", "exemplary", "cutting-edge", "remarkable", "intricate", "robust", "seamless", "comprehensive", "transformative", "paramount".
- Avoid these flagged AI-vocabulary adverbs: "seamlessly", "meticulously", "intricately", "profoundly", "pivotally", "relentlessly", "tirelessly", "vibrantly".
- Avoid these flagged AI-vocabulary nouns: "tapestry", "realm", "landscape", "facet", "interplay", "kaleidoscope", "symphony", "testament", "paradigm", "roadmap", "toolkit", "quest", "journey".
- Avoid these phrases: "it's important to note", "in a world of/where", "not only ___ but also", "a testament to", "the landscape of", "navigating the complexities of", "paving the way", "harness the power of", "serves as", "gain a comprehensive understanding", "play a crucial role", "provide a valuable insight", "left an indelible mark", "play a significant role in shaping".
- Do not rely on stock transition openers such as "Furthermore,", "Moreover,", "Additionally,", or "Consequently,".
- Do not use canned framing such as "This highlights", "This underscores", or "plays a crucial role".
- Do not lean on filler patterns such as "in today's world", "in today's landscape", "at its core", "from this perspective", or similar generic framing.
- Do not overuse weak generic verbs such as "shows", "makes", "gives", or "seems" when a clearer context-specific verb would sound more natural.
- Do not stack too many abstract nouns ending in "-tion", "-ment", "-ness", "-ity", or similar forms when a more concrete rewrite would read better.
- Entropy injection: At 2-3 points per 500 words, make a structural choice that is moderately unexpected: an unusual clause order, a sentence that starts with a conjunction, a deliberate fragment used for emphasis, an interrupted thought resumed with a parenthetical aside, or a rhetorical question. Spread these across different paragraphs.
- Controlled imperfection: Include 2-3 of the following per 500 words of output: a slightly abrupt transition, a point restated in slightly different terms, a mildly informal aside, or uneven depth of development. Do not introduce factual errors, grammatical mistakes, or genuinely bad writing.
- Do not use three or more parallel items in the same grammatical form ("X, Y, and Z" triads) more than once per 500 words.
- Do not create perfectly balanced sentence pairs where one sentence presents a point and the immediately following sentence qualifies it with a matching structure and similar length.
- Do not repeat the same paragraph-level template across multiple paragraphs.
- Do not open more than one paragraph in the same essay with a dependent clause using the same subordinating conjunction.
- When the user selected a higher writing level or formal tone, move beyond plain generic wording and choose more precise, less common vocabulary where it still sounds natural in context.
- Writing-level rule: ${levelGuidance}
- Style rule: ${toneGuidance}
- Vocabulary-diversification rule: ${lexicalGuidance}
- Paragraph-level rewrite rule: ${paragraphGuidance}
- Human-like rewrite strength: ${request.humanLikeLevel}/100 (${intensity.label})
- Intensity guidance: ${intensity.instruction}
- Rewrite-distance target: ${rewriteDistanceTarget}
${useFormalAcademicOverrides ? `- Do not overuse present participial phrases (main clause, comma, -ing verb). Use at most one per 300 words.
- Do not use "From X to Y" overview constructions ("From ancient traditions to modern innovations").
- Do not start every paragraph with a topic sentence. Begin some paragraphs with evidence, a concession, a question, a qualification, or a mid-thought continuation instead.
- Do not deploy the same internal paragraph logic (claim, then supporting example, then evaluative conclusion) in more than two paragraphs. Vary how paragraphs build their arguments.
- Use equivocal connectors ("but," "though," "however," "still," "granted," "admittedly") more often than additive connectors ("furthermore," "moreover," "additionally," "in addition"). Human academic writers favor equivocal transitions.
- Include hedging and stance markers where appropriate: "arguably," "to some extent," "it seems," "in fairness," "granted," "though this is debated."
- Vary punctuation: include at least some semicolons, parenthetical asides, and occasional dashes (short dashes, not em dashes). AI text over-relies on periods and commas alone.` : `- When punctuation starts to feel too even, vary it with occasional semicolons or parenthetical asides rather than relying only on periods and commas.`}

Research-informed guidance:
- Human writing shows higher lexical diversity within paragraphs, more varied sentence lengths, lower transition density, less symmetrical sentence construction, and more uneven development depth.
- Human writing reuses key terms naturally rather than aggressively rotating synonyms for the same concept.
- Paragraph-level paraphrasing changes discourse-level patterns more effectively than sentence-by-sentence editing.
- Plan-and-write budgeting helps control length more reliably than freeform drafting.
- Human text often places important information in the middle of paragraphs, not always at the beginning or end.

Statistical naturalness targets:
- Sentence-length coefficient of variation (stddev / mean) must be >= 0.40 per paragraph.
- At least 15% of all sentences must be under 10 words.
- At least 10% of all sentences must be over 25 words.
- No paragraph may have all sentences within +/- 5 words of each other.
- Transition word density must not exceed 3% of total word count.
- No transition word may be used as a sentence opener more than twice in the entire essay.
- Content-to-function word ratio must be between 0.85 and 1.10.
- The median word-count difference between consecutive sentences must be >= 6 words.

Every pass should STAY CONSISTENT with the word count range guardrail (+/- ${request.wordDelta}), the writing level (${formatGradeLabel(request.gradeLevel)}), the writing style (${request.tone}), the human-like rewrite strength (${request.humanLikeLevel}/100), and all other user parameters.

Global rules for every pass:
1. Preserve the original meaning, facts, claims, tone intent, point of view, and core message unless user guardrails explicitly allow changes.
2. Do not add new facts, examples, citations, statistics, or arguments.
3. Do not remove key meaning. Compression and expansion may change phrasing density, not substance.
4. Keep the output natural, idiomatic, and human-sounding.
5. Avoid stereotypical AI phrasing, polished filler, hedging clutter, and repetitive transitions.
6. Do not use em dashes.
7. Prefer synonym choices that sound human and context-appropriate rather than overly formal, corporate, academic, generic, or machine-like.
8. Make the prose feel rewritten, not lightly polished.
9. Sentence count may change if needed for a stronger natural rewrite, as long as the paragraph count stays the same.
10. Do not preserve the source sentence order by default. Keep it only when it is already the most natural arrangement.
11. At medium and higher rewrite-strength settings, rewrite paragraphs as full units.
12. The higher the rewrite-strength setting, the more the result should differ in wording and sentence construction from the source.

Outer pass context:
- ${outerPassLabel}
- ${extraPassInstructions}

${passInstructions}

Return policy:
- Perform PASS 1 through PASS 3 internally.
- Do not print version (1) or version (2).
- Output only the final version from PASS 3 in the required format below.

Per-paragraph word budget (stay close to these counts, individual paragraphs may vary but the total must stay within +/- ${request.wordDelta} words of ${originalWordCount}):
${perParagraphWordCounts.join("\n")}

Return exactly this format. The essay has exactly ${paragraphCount} paragraphs. Output each paragraph inside its own numbered tag. Do not add, remove, or merge any paragraph tags.
<rewritten_essay>
${paragraphTemplate}
</rewritten_essay>
<self_check>
{"protectedTermsKept":true,"citationsKept":true,"paragraphCountKept":true,"wordRangeKept":true,"toneMatched":true,"readingLevelMatched":true,"notes":["short note"]}
</self_check>

Essay to rewrite:
${protectedEssay}
`.trim();
}

export function buildParagraphPrompt(
  request: HumanizeRequest,
  protectedParagraph: string,
  citationPlaceholders: string[],
  paragraphIndex: number,
  totalParagraphs: number,
  precedingSentence: string | null,
): string {
  const wordCount = countWords(protectedParagraph);
  const intensity = getIntensityProfile(request.humanLikeLevel);
  const guardrailDetails = buildGuardrailDetails(
    request,
    totalParagraphs,
    countWords(request.text),
    citationPlaceholders,
  );

  return `
You are rewriting a single paragraph (paragraph ${paragraphIndex + 1} of ${totalParagraphs}) so it reads as natural human writing.

${precedingSentence ? `The preceding paragraph ends with: "${precedingSentence}"\nEnsure smooth flow from that sentence.` : "This is the first paragraph."}

STRUCTURAL DIRECTIVE FOR THIS PARAGRAPH:
${getParagraphStructuralDirective(paragraphIndex, totalParagraphs)}

TARGET: ~${wordCount} words (allowed range: ${Math.max(1, wordCount - 15)} to ${wordCount + 15})

SENTENCE-LENGTH TARGETS FOR THIS PARAGRAPH:
- Mean: 16-22 words, standard deviation: 8-12 words
- Include at least one short sentence (under 10 words) and one longer sentence (over 25 words)
- No two consecutive sentences within +/- 5 words of each other

BOUNDARY RULES:
- ${guardrailDetails}
- Use the requested tone: ${getToneGuidance(request.tone)}
- Use the requested writing level: ${getWritingLevelGuidance(request.gradeLevel)}
- Use the rewrite intensity: ${request.humanLikeLevel}/100 (${intensity.label})
- Avoid RLHF-style stock vocabulary, stacked formal transitions, and repeated paragraph templates.

Paragraph to rewrite:
${protectedParagraph}

Return ONLY the rewritten paragraph text. No tags, no explanation.
`.trim();
}

function getParagraphStructuralDirective(index: number, total: number): string {
  const directives = [
    "Open with a concrete detail or piece of evidence, not a topic sentence.",
    "Open with a concession or qualification before stating the main point.",
    "Open with a short declarative claim (under 8 words), then develop it.",
    "Open with a subordinate clause that sets context before the main idea.",
    "Open by continuing a thread from the previous paragraph, then pivot.",
    "Open with a question or rhetorical prompt, then answer it.",
    "State the main point in the middle of the paragraph, not at the start or end.",
    "Build from specific details toward a broader observation.",
  ];

  return directives[(index + total) % directives.length];
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
    "Focus on producing the strongest full 3-pass rewrite chain from the current source text.",
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
    `Prioritize repairing these issues inside PASS 3 while keeping the final output natural: ${violations.length ? violations.join(" ") : "No explicit violations were passed in, so tighten the guardrails and keep the writing natural."}`,
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
    "The current source text is already close. Focus on making the 3-pass rewrite produce a more natural final result without loosening any guardrail.",
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
    `This final pass must lock the best PASS 3 result. Any remaining problems to correct before the final output: ${violations.length ? violations.join(" ") : "No explicit failures remain; tighten the final output while preserving all rules."}`,
  );
}
