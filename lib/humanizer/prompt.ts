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

function getIterationFocus(step: string, request: HumanizeRequest) {
  const toneFocus =
    request.tone === "casual"
      ? "Favor more conversational, direct, and person-to-person phrasing where it fits the source voice."
      : "Favor more polished, precise, and advanced phrasing while keeping the voice natural and readable.";

  const levelFocus = getWritingLevelGuidance(request.gradeLevel);

  const intensityFocus =
    request.humanLikeLevel >= 90
      ? "Push the paraphrasing to the highest level. Rebuild sentence shapes aggressively, split and merge sentences when useful, and change more of the phrasing so the text feels fully rewritten."
      : request.humanLikeLevel >= 80
      ? "Push the paraphrasing harder and allow bolder sentence reshaping, sentence splitting and merging, and local sentence swaps when they still sound natural."
      : request.humanLikeLevel >= 45
        ? "Use noticeable paraphrasing, selective sentence reshaping, and some sentence splitting or merging, but keep the flow stable."
        : "Keep the edits relatively light and stay closer to the source wording and order.";

  const orderFocus =
    step === "b" || step === "g"
      ? "You may swap nearby sentences or reorder local clauses when it improves flow, but do not change meaning-critical order or move whole paragraphs."
      : "Only change local order when it clearly improves fluency and still respects the original logic.";

  const lexicalFocus =
    step === "f" || step === "h" || step === "j"
      ? `Push vocabulary variety harder in this step. ${getLexicalDiversificationGuidance(request)}`
      : `Keep vocabulary choices aligned to the user settings. ${getLexicalDiversificationGuidance(request)}`;

  const naturalnessCheck =
    step === "h" || step === "i" || step === "j"
      ? " Before finalizing this step, scan the output for: (1) any run of 3+ sentences with similar word counts (+/- 5 words); (2) any paragraph where all sentences start with the same part of speech; (3) any transition word used more than twice in the same paragraph; (4) any passage that reads too smoothly and evenly without any rhythmic variation. If found, rework those specific spots to introduce more natural variation."
      : "";

  return `${toneFocus} ${levelFocus} ${intensityFocus} ${orderFocus} ${lexicalFocus}${naturalnessCheck}`;
}

function buildGuardrailDetails(
  request: HumanizeRequest,
  paragraphCount: number,
  originalWordCount: number,
  citationPlaceholders: string[],
) {
  const intensity = getIntensityProfile(request.humanLikeLevel);
  const rewriteDistanceTarget = getRewriteDistanceTarget(request.humanLikeLevel);
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
    `ensure high sentence-length variance: include at least 15% of sentences under 10 words and at least 10% over 25 words; no paragraph should have all sentences within +/- 5 words of each other`,
    `do not use em dashes`,
    `do not use formulaic wrap-up phrases such as "Ultimately,", "In conclusion,", "To summarize,", or "Overall," unless they already appear in the source and must be preserved`,
    `do not use contrast-template phrasing such as "not X, but Y", "not just X, but Y", or similar constructions`,
    `do not write phrases like "The [thing] presents..." or "This essay/paper/article presents/explores/examines..."`,
    `do not use indirect framing such as "it is important to note", "it can be argued", or "it is worth noting"`,
    `do not use "X, Y, and Z" triadic parallel lists more than once per 500 words`,
    `do not create balanced sentence pairs with matching structure and length back-to-back`,
    `do not repeat the same paragraph-level logic template (claim -> example -> evaluation) across multiple paragraphs`,
    `do not open more than one paragraph with a dependent clause using the same conjunction`,
    `avoid the flagged verbs, adjectives, adverbs, nouns, and phrases listed in the boundary rules above`,
    `keep the writing natural, idiomatic, direct, and human-sounding`,
    `preserve the original meaning, facts, claims, point of view, and tone intent`,
  ].join("; ");
}

function usesFormalAcademicNaturalnessOverrides(request: HumanizeRequest) {
  return (
    request.tone === "formal" &&
    (request.gradeLevel === "college" || request.gradeLevel === "graduate") &&
    request.humanLikeLevel >= 80
  );
}

function buildIterationStepInstructions(
  request: HumanizeRequest,
  paragraphCount: number,
  originalWordCount: number,
  guardrailDetails: string,
) {
  const minWordCount = originalWordCount - request.wordDelta;
  const maxWordCount = originalWordCount + request.wordDelta;

  if (!usesFormalAcademicNaturalnessOverrides(request)) {
    return {
      focusMap: "",
      a: `a. Create version (a) from the original essay only. Paraphrase at the micro level by replacing words and short phrases one at a time with less AI-like alternatives. Keep paragraph structure the same, but do not over-protect the original sentence shells. Prioritize simple, natural synonym swaps that reduce robotic phrasing without changing meaning. Replace stale or generic wording where an easy human alternative would sound better. Avoid high-frequency AI wording, inflated diction, and overly neat phrasing. (while adhering to user guardrails/rules: ${guardrailDetails}. iteration-specific focus: ${getIterationFocus("a", request)})`,
      b: `b. Create version (b) using ONLY version (a). Re-order nearby sentences where helpful, vary sentence openings, and shift the writing style noticeably while preserving natural flow and meaning. Keep the prose more straightforward and plainspoken than version (a), as if simplifying it for clarity. Reshape sentences more boldly than in step (a), rewrite short stretches at the clause level instead of only swapping words, and split or merge sentences if that helps the paragraph sound less templated. You may swap nearby sentences if it improves flow, but do not rearrange whole paragraphs or move sentences when the logic depends on their original order. Do not look back at the original essay or any version before (a). For this step, internally draft TWO alternative versions of each paragraph. Select the version whose sentence lengths are more varied, whose word choices are less predictable, and whose structure differs more from the immediately prior version. Carry only the selected version forward as version (b). (while adhering to user guardrails/rules: ${guardrailDetails}. iteration-specific focus: ${getIterationFocus("b", request)})`,
      c: `c. Create version (c) using ONLY version (b). Push in the opposite direction from version (b): make the prose more layered and syntactically richer while still sounding human and staying within the same user guardrails. Introduce more variety in cadence, subordination, and phrasing, but do not become ornate, academic, or artificial. Use fuller clause reshaping and vary how ideas are introduced so the text no longer follows the same sentence blueprint. Rewrite each paragraph as a full unit rather than polishing sentences in isolation. Feel free to rebuild sentence structure from the ground up when the meaning stays intact. Do not consult any version except (b). (while adhering to user guardrails/rules: ${guardrailDetails}. iteration-specific focus: ${getIterationFocus("c", request)})`,
      d: `d. Create version (d) using ONLY version (c). Compress the prose: shorten where possible, tighten word choice, reduce excess modifiers, and make the writing feel brisker and more direct. Keep all essential meaning and preserve a natural human voice. Replace weak helper-verb phrasing with stronger verbs where possible. After compressing, verify the word count is still within ${minWordCount} to ${maxWordCount}. If under, stop compressing. Do not consult any version except (c). For this step, internally draft TWO alternative versions of each paragraph. Select the version whose sentence lengths are more varied, whose word choices are less predictable, and whose structure differs more from the immediately prior version. Carry only the selected version forward as version (d). (while adhering to user guardrails/rules: ${guardrailDetails}. iteration-specific focus: ${getIterationFocus("d", request)})`,
      e: `e. Create version (e) using ONLY version (d). Stretch the prose moderately: add texture through sentence reshaping, clause variation, and more conversationally human phrasing, but do not add new information. Make it feel less compressed than version (d) and less polished than typical AI output. Expand through rephrasing and clause movement, not through filler. After expanding, verify the word count is still within ${minWordCount} to ${maxWordCount}. If over, trim the expansion. Do not consult any version except (d). (while adhering to user guardrails/rules: ${guardrailDetails}. iteration-specific focus: ${getIterationFocus("e", request)})`,
      f: `f. Create version (f) using ONLY version (e). Rework the wording at the phrase level again, specifically targeting any remaining AI-sounding patterns, generic transitions, neat parallel structures, stacked abstract nouns, or overly balanced sentence construction. This is a vocabulary-heavy pass: rotate repeated verbs, modifiers, and noun phrases more aggressively, prefer fresh but natural synonyms, and rewrite whole clauses when single-word substitution would still feel close to the source. Replace more of the remaining generic vocabulary than in earlier steps. Favor human-typical word choices that fit the required writing level, whether simpler or more advanced per user guardrails. Do not consult any version except (e). For this step, internally draft TWO alternative versions of each paragraph. Select the version whose sentence lengths are more varied, whose word choices are less predictable, and whose structure differs more from the immediately prior version. Carry only the selected version forward as version (f). (while adhering to user guardrails/rules: ${guardrailDetails}. iteration-specific focus: ${getIterationFocus("f", request)})`,
      g: `g. Create version (g) using ONLY version (f). Change the stylistic texture again by varying rhythm sharply: mix shorter and longer sentences, alter paragraph movement, and make the flow feel less predictable while staying coherent. This pass should sound distinctly rephrased from version (f), not like a light edit. You may swap nearby sentences or shift local clause order if it reads more naturally, but do not rearrange entire paragraphs or disturb meaning-critical order. Use the new order changes to break repeated sentence scaffolding, not just to shuffle words around. Treat each paragraph as a mini-structure with its own flow and vary how the paragraph unfolds. If a sentence still sounds too close to the source, rebuild it more fully. Do not consult any version except (f). (while adhering to user guardrails/rules: ${guardrailDetails}. iteration-specific focus: ${getIterationFocus("g", request)})`,
      h: `h. Create version (h) using ONLY version (g). Perform the strongest final humanizing rewrite pass. Make this the most fully paraphrased version so far while preserving meaning, facts, and user constraints. Replace lingering machine-like phrasing, smooth out awkward spots, and ensure the result reads like an original human rewrite rather than a surface paraphrase. Increase real wording change here: vary phrases, clauses, and sentence shapes more aggressively while still sounding natural. Treat this as a full rewrite of the paragraph language and paragraph flow, not a cleanup edit. Do not consult any version except (g). For this step, internally draft TWO alternative versions of each paragraph. Select the version whose sentence lengths are more varied, whose word choices are less predictable, and whose structure differs more from the immediately prior version. Carry only the selected version forward as version (h). (while adhering to user guardrails/rules: ${guardrailDetails}. iteration-specific focus: ${getIterationFocus("h", request)})`,
      i: `i. Now evaluate ONLY version (h) against all user guardrails: word count range, writing level, writing style, human-like rewrite strength, banned patterns, every other user parameter, and the final vocabulary fit. Count the words in version (h). If the count is outside ${minWordCount} to ${maxWordCount}, adjust by adding or removing small phrases until the count falls within range. This takes priority over all other corrections in this step. If version (h) fails any other guardrail, rewrite it once so it fully matches while keeping it as close as possible to version (h). Also correct vocabulary mismatches such as wording that is too flat, too inflated, too repetitive, or wrong for the selected tone and writing level. Do not pull the language back toward the source unless a guardrail requires it. Output only the corrected version (i). Do not explain the check unless explicitly asked. (while adhering to user guardrails/rules: ${guardrailDetails}. iteration-specific focus: ${getIterationFocus("i", request)})`,
      j: `j. Create version (j) using ONLY version (i). Perform one final research-informed human rewrite/paraphrase pass that stays faithful to version (i) while still making the final result feel fully rewritten. Use the research-informed guidance above: add natural variation in cadence, avoid repeated connective scaffolding, keep sentence movement less mechanically balanced, vary clause size, favor concrete context-appropriate phrasing, and rotate any remaining repeated words with fresher natural alternatives. Do not use odd or inflated synonyms. Only use vocabulary shifts that fit the required writing level and tone. This should read like a genuinely rephrased final draft, not a lightly edited version. Re-check each paragraph as a whole so the discourse flow does not mirror the source too closely. Before outputting, count the total words. The count MUST be between ${minWordCount} and ${maxWordCount}. If it is not, revise until it is. Do not output a result that violates this range. Do not consult any version except (i). Before answering, verify that version (j) still satisfies every user guardrail exactly. (while adhering to user guardrails/rules: ${guardrailDetails}. iteration-specific focus: ${getIterationFocus("j", request)})`,
    };
  }

  return {
    focusMap: `Focused step map for this formal academic high-naturalness case:
- Steps (a)-(c): STRUCTURAL OVERHAUL PASS. Focus on paragraph structure, sentence order, sentence splitting and merging, paragraph-opening variety, and breaking topic-sentence-first repetition.
- Steps (d)-(f): VOCABULARY AND TRANSITION PASS. Replace flagged vocabulary, cut additive transition stacking, prefer equivocal connectors, and add natural hedges or stance markers where they fit.
- Steps (g)-(h): RHYTHM AND IMPERFECTION PASS. Target the sentence-length numbers above, create larger burstiness, and add controlled human unevenness plus 2-3 entropy injections per 500 words.
- Steps (i)-(j): GUARDRAIL VERIFICATION AND FINAL POLISH. Check every hard rule, fix only what still fails, and keep the final prose natural rather than over-smoothed.`,
    a: `a. Create version (a) from the original essay only. STRUCTURAL OVERHAUL PASS: Do not just swap words - reshape sentences. Split at least 20% of sentences and merge at least 10%. Keep the paragraph count at exactly ${paragraphCount}. Vary paragraph openings so no more than one paragraph begins with the same syntactic structure. Do not start every paragraph with a topic sentence; begin some with evidence, a concession, a question, a qualification, or a mid-thought continuation instead. When there are multiple paragraphs, move the main point of at least two paragraphs away from the opening sentence. Break any repeated claim -> example -> evaluation template across paragraphs. Keep meaning intact, but make the structure materially less predictable. (while adhering to user guardrails/rules: ${guardrailDetails}. iteration-specific focus: ${getIterationFocus("a", request)})`,
    b: `b. Create version (b) using ONLY version (a). STRUCTURAL OVERHAUL PASS: Reorder nearby sentences whenever it improves rhythm or argument flow. Build each paragraph so the logic unfolds differently from the previous version: some paragraphs may open with evidence, some with concession, some with qualification, some with continuation. Do not let more than one paragraph open with the same kind of syntactic frame. Break any remaining topic-sentence-first pattern and any "From X to Y" overview construction. For this step, internally draft TWO alternative versions of each paragraph and keep the one with stronger opening variety, less repeated paragraph logic, and more sentence-length spread. Carry only the selected version forward as version (b). (while adhering to user guardrails/rules: ${guardrailDetails}. iteration-specific focus: ${getIterationFocus("b", request)})`,
    c: `c. Create version (c) using ONLY version (b). STRUCTURAL OVERHAUL PASS: Rebuild paragraph flow again, but in a different way. Rewrite paragraphs as full units, not sentence by sentence. If two paragraphs still feel parallel in structure, make one more evidence-first, concession-first, or qualification-first. Use sentence splitting, merging, and local order shifts to make the internal architecture feel less templated. Do not consult any version except (b). End this step with paragraph structures that no longer repeat the same claim -> support -> evaluation sequence more than twice. (while adhering to user guardrails/rules: ${guardrailDetails}. iteration-specific focus: ${getIterationFocus("c", request)})`,
    d: `d. Create version (d) using ONLY version (c). VOCABULARY AND TRANSITION PASS: Replace every remaining flagged AI-coded word or phrase you can find. Cut additive transition stacking such as "furthermore," "moreover," "additionally," and "in addition." Prefer equivocal connectors where they fit the logic: "but," "though," "however," "still," "granted," "admittedly." Add natural hedges or stance markers where appropriate: "arguably," "to some extent," "it seems," "in fairness," "though this is debated." After revising, verify the word count is still within ${minWordCount} to ${maxWordCount}. If under, stop compressing. For this step, internally draft TWO alternative versions of each paragraph and keep the one with cleaner vocabulary and lower transition density. (while adhering to user guardrails/rules: ${guardrailDetails}. iteration-specific focus: ${getIterationFocus("d", request)})`,
    e: `e. Create version (e) using ONLY version (d). VOCABULARY AND TRANSITION PASS: Keep replacing flagged vocabulary, but now improve connective tissue. Add function words, hedges, and light stance markers so the prose does not over-pack content words. Use less-obvious but still natural synonyms at 3-5 points per 500 words, not flashy thesaurus words. Reduce repeated formal connector stacking and avoid letting every sentence announce its logic too neatly. After revising, verify the word count is still within ${minWordCount} to ${maxWordCount}. If over, trim by rewriting, not by deleting meaning. (while adhering to user guardrails/rules: ${guardrailDetails}. iteration-specific focus: ${getIterationFocus("e", request)})`,
    f: `f. Create version (f) using ONLY version (e). VOCABULARY AND TRANSITION PASS: Do a final vocabulary scrub. Remove any leftover flagged verbs, adjectives, adverbs, nouns, or phrases. Check that additive transitions are rarer than equivocal ones, and that transition density stays low. Replace neat formal scaffolding with more human connective phrasing. Where the prose still sounds overly polished, add slight hedging or a modest stance marker instead of a formal transition. For this step, internally draft TWO alternative versions of each paragraph and keep the version with the more natural lexical mix, lower transition density, and less RLHF-style polish. (while adhering to user guardrails/rules: ${guardrailDetails}. iteration-specific focus: ${getIterationFocus("f", request)})`,
    g: `g. Create version (g) using ONLY version (f). RHYTHM AND IMPERFECTION PASS: Target a sentence-length mean of 18-22 words and standard deviation of 8-12 words per paragraph. In every paragraph, include some short sentences in the 5-8 word range and some long ones in the 30-40 word range. Do not let three consecutive sentences land at similar lengths. The word-count difference between consecutive sentences should usually fall around 6-10 words on average. Add 2-3 entropy injections per 500 words and 2-3 controlled imperfections per 500 words, spread across different paragraphs. Use punctuation variety too: some semicolons, parenthetical asides, and occasional short dashes, but no em dashes. (while adhering to user guardrails/rules: ${guardrailDetails}. iteration-specific focus: ${getIterationFocus("g", request)})`,
    h: `h. Create version (h) using ONLY version (g). RHYTHM AND IMPERFECTION PASS: Make the rhythm feel more human than polished. Keep the numerical sentence-length targets active. Introduce slight unevenness in transition smoothness, support depth, and local cadence without creating factual or grammatical errors. For this step, internally draft TWO alternative versions of each paragraph and keep the one with stronger burstiness, more paragraph-length variety, and more believable human roughness. Carry only the selected version forward as version (h). (while adhering to user guardrails/rules: ${guardrailDetails}. iteration-specific focus: ${getIterationFocus("h", request)})`,
    i: `i. Now evaluate ONLY version (h). GUARDRAIL VERIFICATION PASS: Check word count, paragraph count, banned vocabulary and phrases, sentence burstiness, transition density, repeated paragraph templates, present-participial phrase overuse, "From X to Y" constructions, and writing-level fit. Count the words in version (h). If the count is outside ${minWordCount} to ${maxWordCount}, fix that first. Then repair only the places that still violate guardrails. Keep the sentence-length variance, paragraph-opening variety, and controlled imperfections that already work; do not polish them away. Output only the corrected version (i). (while adhering to user guardrails/rules: ${guardrailDetails}. iteration-specific focus: ${getIterationFocus("i", request)})`,
    j: `j. Create version (j) using ONLY version (i). FINAL POLISH PASS: Keep version (i)'s structure, burstiness, and vocabulary gains, but tighten any sentence that still sounds mechanical. Do not over-smooth the prose. Preserve the natural hedges, equivocal connectors, punctuation variety, and local unevenness that make it read human. Before outputting, verify that version (j) still satisfies every hard guardrail exactly and that the total word count is between ${minWordCount} and ${maxWordCount}. If it is not, revise until it is. (while adhering to user guardrails/rules: ${guardrailDetails}. iteration-specific focus: ${getIterationFocus("j", request)})`,
  };
}

function buildBasePrompt(
  request: HumanizeRequest,
  protectedEssay: string,
  citationPlaceholders: string[],
  outerPassLabel: string,
  extraPassInstructions: string,
) {
  const originalParagraphs = splitParagraphs(request.text);
  const paragraphCount = splitParagraphs(request.text).length;
  const originalWordCount = countWords(request.text);
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
  const stepInstructions = buildIterationStepInstructions(
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

Boundary rules before generation:
- Keep the writing human, idiomatic, and natural.
- Use real paraphrasing, clause reshaping, phrasing changes, and sentence-flow changes rather than shallow synonym swaps.
- Make the result materially different in wording from the source. Do not preserve original sentence shells when a natural rewrite is possible.
- Model-fingerprint mitigation: Do not default to your most natural or highest-probability phrasing patterns. Actively vary: (a) your typical clause-ordering preferences - if you tend to put the main clause first, sometimes lead with the subordinate clause, and vice versa; (b) your most common transition words - track which transitions you have already used and avoid repeating any transition word within 300 words; (c) your default sentence-opening patterns - if you find yourself starting sentences with the subject-verb pattern repeatedly, interrupt that with a different construction. When you notice yourself reaching for a comfortable, default phrasing, choose the second or third option instead. Prefer constructions that feel like a human writer's considered first draft, not a model's most-optimized output.
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
- Entropy injection: At 2-3 points per 500 words, make a structural choice that is moderately unexpected: an unusual clause order, a sentence that starts with a conjunction ("And," "But," "Or"), a deliberate sentence fragment used for emphasis, an interrupted thought resumed with a parenthetical aside or comma interruption, a rhetorical question, or a colloquial turn of phrase. These create local unpredictability in the text's statistical profile, which is characteristic of natural writing. Do not cluster these - spread them across different paragraphs.
- Controlled imperfection: Human writing contains minor natural imperfections that model-generated text typically lacks. Include 2-3 of the following per 500 words of output: (a) a transition that is slightly abrupt rather than seamlessly smooth; (b) a point restated in slightly different terms without adding new information (natural human redundancy); (c) a mildly informal aside or qualification that a careful editor might tighten but a real writer would leave in a draft; (d) uneven depth of development - not every claim or point elaborated to the same degree, with some ideas getting a full sentence of support and others stated without elaboration. Do not introduce factual errors, grammatical mistakes, or genuinely bad writing. The goal is the kind of minor unevenness that naturally occurs in human prose.
- Do not use three or more parallel items in the same grammatical form ("X, Y, and Z" triads) more than once per 500 words. When listing multiple items, break them across sentences or use different grammatical structures instead of neat triadic lists.
- Do not create perfectly balanced sentence pairs where one sentence presents a point and the immediately following sentence qualifies it with a matching structure and similar length. Vary how qualifications and counterpoints are introduced.
- Do not repeat the same paragraph-level template across multiple paragraphs (e.g., abstract claim -> supporting example -> evaluative conclusion in every paragraph). Vary the internal logic structure across paragraphs.
- Do not open more than one paragraph in the same essay with a dependent clause using the same subordinating conjunction.
- Use semicolons sparingly, but do not avoid them so completely that the punctuation collapses into only periods and commas.
- ${useFormalAcademicOverrides ? `Do not overuse present participial phrases (main clause, comma, -ing verb). Use at most one per 300 words.
- Do not use "From X to Y" overview constructions ("From ancient traditions to modern innovations").
- Do not start every paragraph with a topic sentence. Begin some paragraphs with evidence, a concession, a question, a qualification, or a mid-thought continuation instead.
- Do not deploy the same internal paragraph logic (claim, then supporting example, then evaluative conclusion) in more than two paragraphs. Vary how paragraphs build their arguments.
- Use equivocal connectors ("but," "though," "however," "still," "granted," "admittedly") more often than additive connectors ("furthermore," "moreover," "additionally," "in addition"). Human academic writers favor equivocal transitions.
- Include hedging and stance markers where appropriate: "arguably," "to some extent," "it seems," "in fairness," "granted," "though this is debated."
- Vary punctuation: include at least some semicolons, parenthetical asides, and occasional dashes (short dashes, not em dashes). AI text over-relies on periods and commas alone.` : `When punctuation starts to feel too even, vary it with occasional semicolons or parenthetical asides rather than relying only on periods and commas.`}
- When the user selected a higher writing level or formal tone, move beyond plain generic wording and choose more precise, less common vocabulary where it still sounds natural in context.
- Writing-level rule: ${levelGuidance}
- Style rule: ${toneGuidance}
- Vocabulary-diversification rule: ${lexicalGuidance}
- Paragraph-level rewrite rule: ${paragraphGuidance}
- Human-like rewrite strength: ${request.humanLikeLevel}/100 (${intensity.label})
- Intensity guidance: ${intensity.instruction}
- Rewrite-distance target: ${rewriteDistanceTarget}

Research-informed guidance:
- Corpus-level comparisons of human and model text show that human writing has: (a) higher lexical diversity within paragraphs, (b) more varied sentence lengths with a coefficient of variation above 0.40, (c) less uniform transition usage, (d) less symmetrical sentence construction, and (e) more variation in how thoroughly different points are developed.
- Human writing uses fewer stacked abstract nouns (words ending in -tion, -ment, -ness, -ity) and more concrete, context-specific phrasing.
- Human writing reuses key terms naturally rather than aggressively rotating synonyms for the same concept. When a specific technical or topic-central term is the right word, repeat it rather than forcing an unnatural synonym.
- Paragraph-level paraphrasing (reshaping how ideas flow within a paragraph as a unit) changes discourse-level patterns more effectively than sentence-by-sentence editing.
- Multi-step rewriting that alternates compression, expansion, reordering, and vocabulary refresh produces more natural output than a single rewrite pass.
- Human text often places important information in the middle of paragraphs, not always at the beginning or end. Vary where the key point of each paragraph lands.
- Human writing occasionally embeds opinion-like qualifiers ("surprisingly," "oddly enough," "in fairness"), hedges that feel natural rather than formulaic, and emphasis markers that model text rarely uses. Include these sparingly where they fit the requested tone.
- Apply these findings: vary cadence irregularly, reduce repeated transition scaffolds, mix clause lengths unpredictably, avoid repeating sentence blueprints, prefer concrete context-appropriate phrasing, rotate repeated word choices with natural alternatives (not forced synonyms), split or merge sentences when it helps break predictable rhythm, reshape paragraphs as full units, and allow sentence-level order changes when they improve natural flow.

Statistical naturalness targets:
- Human writing has high sentence-length variance. The coefficient of variation (standard deviation divided by mean) of sentence word counts in natural writing typically falls between 0.40 and 0.60. Model-generated text typically sits at 0.15-0.25. In the output, deliberately include some very short sentences (3-8 words) and some genuinely long ones (30+ words) in an irregular, non-alternating pattern.
- At least 15% of sentences in the output should be under 10 words. At least 10% should be over 25 words. No paragraph should have all sentences within +/- 5 words of each other in length.
- Human writing includes occasional surprising or slightly unusual word choices - not always the most probable next word, but a less obvious synonym a human would reach for after a moment of thought. At 2-4 points per paragraph, choose the second- or third-most-obvious word rather than the default one.
- No more than 2 consecutive sentences should start with the same part of speech.
- Transition word density should not exceed 3% of total word count. Do not use transition words as sentence openers more than twice per 500 words.
- Human writing has non-uniform paragraph rhythms. Some paragraphs should open abruptly with a short declarative. Some should open with a subordinate clause. Some should open with a concrete detail. Vary these across paragraphs and do not repeat the same opening structure in consecutive paragraphs.
${useFormalAcademicOverrides ? `
FORMAL-REGISTER NATURALNESS OVERRIDES (these apply because formal academic text is the hardest case for natural writing):
- Sentence length: target a mean of 18-22 words with standard deviation of 8-12 words PER PARAGRAPH. This means some sentences of 5-8 words and some of 30-40 words in every paragraph. Do NOT cluster all sentences at 15-20 words.
- The word-count difference between consecutive sentences should average 6-10 words. Do not write three sentences in a row with similar lengths.
- Vary paragraph length: some paragraphs should have 2-3 sentences, some 5-7. Do not make all paragraphs 3-5 sentences.
- Content-to-function-word ratio: human academic writing uses a roughly 1:1 ratio of content words to function words. AI text over-indexes on content words (ratio ~1.37). Include more function words, hedges, and connective tissue.
- At 3-5 points per 500 words, choose a word that is NOT the most obvious or highest-probability choice. Pick a less common but still natural synonym - the kind of word a human would reach for after a moment of thought, not the first word that comes to mind.
` : ""}

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
17. Sentence count may change if needed for a stronger natural rewrite, as long as the paragraph count stays the same.
18. Do not preserve the source sentence order by default. Keep it only when it is already the most natural arrangement.
19. For formal, college, and graduate settings, raise the lexical register when it fits naturally. Replace flat common wording with more precise and somewhat less common alternatives, but avoid bizarre thesaurus choices.
20. The higher the rewrite-strength setting, the more the result should differ in wording and sentence construction from the source. At the highest settings, do not settle for a near-copy.
21. At medium and higher rewrite-strength settings, rewrite paragraphs as full units. Do not treat the task as isolated sentence polishing.
22. At higher rewrite-strength settings, change how ideas move inside each paragraph by varying transitions, clause order, and local sentence order when it improves flow and still preserves meaning.

Outer pass context:
- ${outerPassLabel}
- ${extraPassInstructions}
${stepInstructions.focusMap}

${stepInstructions.a}

${stepInstructions.b}

${stepInstructions.c}

${stepInstructions.d}

${stepInstructions.e}

${stepInstructions.f}

${stepInstructions.g}

${stepInstructions.h}

${stepInstructions.i}

${stepInstructions.j}

Return policy:
- Perform steps (a) through (j) internally.
- Do not print steps (a) through (i).
- Output only the final version from step (j) in the required format below.

Per-paragraph word budget (stay close to these counts, individual paragraphs may vary but the total must stay within +/- ${request.wordDelta} words of ${originalWordCount}):
${perParagraphWordCounts.join("\n")}

Return exactly this format. The essay has exactly ${paragraphCount} paragraphs. Output each paragraph inside its own numbered tag. Do not add, remove, or merge any paragraph tags.
<rewritten_essay>
${paragraphTemplate}
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
