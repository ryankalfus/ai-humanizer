# Codex Instructions: Fix Paragraph Count, Word Count, and Formal/Graduate/100 Detection Issues

## Problems to Solve

1. **Output paragraph count doesn't match input paragraph count.** The prompt tells the model to keep the same number of paragraphs, but there's no structural enforcement — the model receives the full essay as a blob of text and returns a blob of text, with only a post-hoc validation check. The model ignores the paragraph count instruction frequently, especially at high intensity levels where the 10-step a→j chain drifts.

2. **Output word count greatly exceeds or falls far below the user's ±wordDelta range.** Same root cause: the prompt states the word count constraint but the model has no mechanism to track or enforce it during generation. The 10-step internal chain makes this worse — each step can drift, and by step (j) the cumulative drift is large.

3. **Formal / Graduate / 100 intensity outputs score 100% AI on detectors.** The prompt's approach to naturalness is qualitative, not quantitative. It tells the model to "vary cadence" and "mix sentence lengths" but doesn't give it the specific statistical targets that would actually change the measurable features detectors use (perplexity uniformity, burstiness suppression, vocabulary fingerprints, structural predictability). The formal/graduate combination is the hardest case because formal register naturally constrains variation, and AI amplifies that constraint.

---

## PART A: Fix Paragraph Count (files: `prompt.ts`, `index.ts`)

### Root Cause

In `prompt.ts`, `buildBasePrompt` (line 234) computes `paragraphCount` and mentions it in the guardrail string ("keep exactly N paragraphs"), but the model receives the entire essay as one continuous text block. The model's 10-step internal chain (a→j) frequently merges or splits paragraphs because it's rewriting the full text at once. In `index.ts`, the `validateRewrite` function (called at line 210) checks paragraph count *after* generation and reports it as a violation, but by that point the text is already wrong and the repair prompt just asks the model to try again with the same architecture.

### What to Change

#### Change A1: In `prompt.ts` — Add a structural skeleton to the output format

Replace the current return format block (the section starting with "Return exactly this format:" near line 358) with a format that **forces paragraph-by-paragraph output** using numbered XML tags. This makes paragraph count structurally enforceable.

Find this block:
```
Return exactly this format:
<rewritten_essay>
[only the final version from step (j)]
</rewritten_essay>
```

Replace with:
```
Return exactly this format. The essay has exactly ${paragraphCount} paragraphs. Output each paragraph inside its own numbered tag. Do not add or remove any paragraph tags.

<rewritten_essay>
<p1>[paragraph 1 text]</p1>
<p2>[paragraph 2 text]</p2>
...
<p${paragraphCount}>[paragraph ${paragraphCount} text]</p${paragraphCount}>
</rewritten_essay>
```

This means the template literal in `buildBasePrompt` needs to dynamically generate the example tags. Build a helper string like:

```typescript
const paragraphTemplate = Array.from(
  { length: paragraphCount },
  (_, i) => `<p${i + 1}>[paragraph ${i + 1} text]</p${i + 1}>`
).join("\n");
```

Then use it in the return format:
```
Return exactly this format. The essay has exactly ${paragraphCount} paragraphs. Output each paragraph inside its own numbered tag. Do not add, remove, or merge any paragraph tags.

<rewritten_essay>
${paragraphTemplate}
</rewritten_essay>
```

#### Change A2: In `prompt.ts` — Add per-paragraph word budgets to the prompt

Right before the essay text at the end of `buildBasePrompt`, add a per-paragraph word budget breakdown. This implements the "Plan-and-Write" method from the research, which improves length adherence by 37.6%.

After computing `paragraphCount` and `originalWordCount`, also compute per-paragraph word counts from the original:

```typescript
const originalParagraphs = splitParagraphs(request.text);
const perParagraphWordCounts = originalParagraphs.map(
  (p, i) => `Paragraph ${i + 1}: ~${countWords(p)} words`
);
```

Then insert this into the prompt, right before the essay text:

```
Per-paragraph word budget (stay close to these counts, individual paragraphs may vary but the total must stay within +/- ${request.wordDelta} words of ${originalWordCount}):
${perParagraphWordCounts.join("\n")}
```

#### Change A3: In `index.ts` — Add paragraph extraction logic in `parseModelResponse`

Update `parseModelResponse` (line 79) to extract text from the numbered paragraph tags and reconstruct the essay with proper `\n\n` separators. This ensures that even if the model adds extra whitespace or formatting inside tags, the paragraph structure is preserved.

```typescript
function parseModelResponse(raw: string): GenerationAttempt {
  const essayMatch = raw.match(/<rewritten_essay>\s*([\s\S]*?)\s*<\/rewritten_essay>/i);
  const selfCheckMatch = raw.match(/<self_check>\s*([\s\S]*?)\s*<\/self_check>/i);

  let outputText = "";
  if (essayMatch?.[1]) {
    // Try to extract numbered paragraph tags
    const paragraphMatches = essayMatch[1].matchAll(/<p(\d+)>\s*([\s\S]*?)\s*<\/p\1>/gi);
    const paragraphs = [...paragraphMatches]
      .sort((a, b) => Number(a[1]) - Number(b[1]))
      .map(m => m[2].trim());

    if (paragraphs.length > 0) {
      outputText = paragraphs.join("\n\n");
    } else {
      // Fallback: strip tags and use raw content
      outputText = essayMatch[1].trim();
    }
  } else {
    outputText = raw.trim();
  }

  return {
    outputText,
    selfCheck: parseSelfCheck(selfCheckMatch?.[1]),
  };
}
```

#### Change A4: In `index.ts` — Add paragraph count enforcement as a hard gate

After `validateRewrite` at line 210, add a hard check: if the paragraph count doesn't match, attempt to repair the output programmatically *before* proceeding to the next iteration. This prevents bad paragraph counts from cascading through subsequent outer passes.

After line 209 (`const restoredOutput = finalizeOutput(...)`), add:

```typescript
// Hard-enforce paragraph count
const outputParagraphs = splitParagraphs(restoredOutput);
let correctedOutput = restoredOutput;
if (outputParagraphs.length !== paragraphCountTarget) {
  // If too many paragraphs, merge the shortest adjacent pair
  if (outputParagraphs.length > paragraphCountTarget) {
    while (splitParagraphs(correctedOutput).length > paragraphCountTarget) {
      const parts = splitParagraphs(correctedOutput);
      // Find shortest paragraph and merge with its neighbor
      let shortestIdx = 0;
      let shortestLen = Infinity;
      for (let i = 0; i < parts.length; i++) {
        if (countWords(parts[i]) < shortestLen) {
          shortestLen = countWords(parts[i]);
          shortestIdx = i;
        }
      }
      const mergeWith = shortestIdx > 0 ? shortestIdx - 1 : 1;
      const mergedParts = [...parts];
      const low = Math.min(shortestIdx, mergeWith);
      mergedParts[low] = mergedParts[low] + " " + mergedParts[low + 1];
      mergedParts.splice(low + 1, 1);
      correctedOutput = mergedParts.join("\n\n");
    }
  }
  // If too few paragraphs, don't try to split — let the repair loop handle it
}
const finalOutput = correctedOutput;
```

Then use `finalOutput` instead of `restoredOutput` for the validation and candidate tracking that follows.

---

## PART B: Fix Word Count Drift (files: `prompt.ts`, `index.ts`)

### Root Cause

The prompt mentions the word count constraint in the guardrail string, but it's buried among 20+ other rules. The 10-step a→j chain has alternating compression (step d) and expansion (step e) passes, which is good in theory, but the model has no way to track its actual word count during generation. The constraint is stated once at the top level and then repeated in each step's guardrail string, but the model doesn't have a running count. At high intensity (100), the aggressive rewriting overwhelms the soft constraint.

### What to Change

#### Change B1: In `prompt.ts` — Move word count to the #1 priority position and make it emphatic

In `buildGuardrailDetails` (line 200), the word count rule is the first item but phrased softly. Make it far more emphatic. Change the first entry from:

```typescript
`keep the final essay within +/- ${request.wordDelta} words of the original ${originalWordCount}-word essay`,
```

to:

```typescript
`CRITICAL HARD CONSTRAINT: The final output MUST be between ${originalWordCount - request.wordDelta} and ${originalWordCount + request.wordDelta} words (original: ${originalWordCount} words, allowed range: +/- ${request.wordDelta}). Count carefully. This is the single most important structural rule — violating it is a failure regardless of all other quality`,
```

#### Change B2: In `prompt.ts` — Add word count checkpoints inside the a→j chain

Add explicit word-count verification instructions to steps (d), (e), (i), and (j) since (d) compresses and (e) expands. In step (d), add:

```
After compressing, verify the word count is still within ${originalWordCount - request.wordDelta} to ${originalWordCount + request.wordDelta}. If under, stop compressing.
```

In step (e), add:
```
After expanding, verify the word count is still within ${originalWordCount - request.wordDelta} to ${originalWordCount + request.wordDelta}. If over, trim the expansion.
```

In step (i), add:
```
Count the words in version (h). If the count is outside ${originalWordCount - request.wordDelta} to ${originalWordCount + request.wordDelta}, adjust by adding or removing small phrases until the count falls within range. This takes priority over all other corrections in this step.
```

In step (j), add:
```
Before outputting, count the total words. The count MUST be between ${originalWordCount - request.wordDelta} and ${originalWordCount + request.wordDelta}. If it is not, revise until it is. Do not output a result that violates this range.
```

#### Change B3: In `index.ts` — Add word count as a hard rejection gate

In the outer loop (line 166), after validation, add a specific check: if the word count is off by more than 2× the allowed delta, discard the candidate entirely and don't feed it into the next iteration. This prevents compounding drift.

```typescript
const wordCountDiff = Math.abs(countWords(finalOutput) - originalWordCount);
if (wordCountDiff > request.wordDelta * 2) {
  // Output is so far off it would poison the next iteration — skip feeding it forward
  // But still record it as a candidate in case all attempts are bad
  candidates.push({ outputText: finalOutput, selfCheck: generation.selfCheck, validation });
  // Don't update currentProtectedEssay — retry from the previous good version
  continue;
}
```

---

## PART C: Fix Formal/Graduate/100 is still AI-written (files: `prompt.ts`, `naturalness.ts`, `validation.ts`)

### Root Cause Analysis

The research identifies exactly why formal/graduate/100 is maximally detectable:

1. **Perplexity compression**: At formal/graduate, the prompt encourages "advanced but natural vocabulary with layered syntax" — but the model interprets this as consistently selecting high-probability formal words, producing uniformly low perplexity (18 vs human 43).

2. **Burstiness suppression**: The prompt says "mix shorter and longer sentences" but gives no quantitative targets. The model produces sentences clustering at 15–20 words. Human academic writing ranges from 5 to 45 words with SD of 8–12.

3. **RLHF vocabulary fingerprint**: The current banned word list has 15 words. The research identifies 50+ flagged verbs, adjectives, adverbs, and nouns, plus 11+ flagged phrases, plus structural patterns (participial phrase overuse, "rule of three" triads, "From X to Y" constructions).

4. **Structural predictability**: The model produces uniform 3–5 sentence paragraphs with topic-sentence-first structure, formal connector stacking ("Furthermore," "Moreover,"), and claim→example→evaluation templates in every paragraph.

5. **Excessive polish**: 10 rewrite passes produce text that's *too consistently coherent* — a detectable signal of model authorship. Human academic writing has slight unevenness in transition quality, development depth, and sentence rhythm.

### What to Change

#### Change C1: In `prompt.ts` — Massively expand the banned vocabulary list

In the boundary rules section of `buildBasePrompt` (the line starting "Avoid technical, overly academic..."), replace the current 15-word list with the full research-derived list:

```
- Avoid these flagged AI-vocabulary verbs: "delve", "underscore", "showcase", "illuminate", "elucidate", "foster", "harness", "intertwine", "reimagine", "revolutionize", "transcend", "unleash", "unlock", "unravel", "weave", "embark", "craft", "navigate", "leverage".
- Avoid these flagged AI-vocabulary adjectives: "commendable", "meticulous", "multifaceted", "pivotal", "nuanced", "indelible", "invaluable", "groundbreaking", "exemplary", "cutting-edge", "remarkable", "intricate", "robust", "seamless", "comprehensive", "transformative", "paramount".
- Avoid these flagged AI-vocabulary adverbs: "seamlessly", "meticulously", "intricately", "profoundly", "pivotally", "relentlessly", "tirelessly", "vibrantly".
- Avoid these flagged AI-vocabulary nouns: "tapestry", "realm", "landscape", "facet", "interplay", "kaleidoscope", "symphony", "testament", "paradigm", "roadmap", "toolkit", "quest", "journey".
- Avoid these flagged AI phrases: "it's important to note", "in a world of/where", "not only ___ but also", "a testament to", "the landscape of", "navigating the complexities of", "paving the way", "harness the power of", "serves as", "gain a comprehensive understanding", "play a crucial role", "provide a valuable insight", "left an indelible mark", "play a significant role in shaping".
```

#### Change C2: In `validation.ts` — Expand `BANNED_AI_VOCABULARY` to match

Update the `BANNED_AI_VOCABULARY` array (line 59) to include all the new words so the post-generation validator catches them:

```typescript
const BANNED_AI_VOCABULARY = [
  "delve", "underscore", "showcase", "illuminate", "elucidate",
  "foster", "harness", "intertwine", "reimagine", "revolutionize",
  "transcend", "unleash", "unlock", "unravel", "weave", "embark",
  "craft", "navigate", "leverage",
  "commendable", "meticulous", "multifaceted", "pivotal", "nuanced",
  "indelible", "invaluable", "groundbreaking", "exemplary",
  "cutting-edge", "remarkable", "intricate", "robust", "seamless",
  "comprehensive", "transformative", "paramount",
  "seamlessly", "meticulously", "intricately", "profoundly",
  "pivotally", "relentlessly", "tirelessly", "vibrantly",
  "tapestry", "realm", "landscape", "facet", "interplay",
  "kaleidoscope", "symphony", "testament", "paradigm",
  "roadmap", "toolkit", "quest", "journey",
];
```

Also add new entries to `BANNED_PHRASE_PATTERNS`:

```typescript
/\ba\s+testament\s+to\b/i,
/\bthe\s+landscape\s+of\b/i,
/\bpaving\s+the\s+way\b/i,
/\bharness\s+the\s+power\b/i,
/\bgain\s+a\s+comprehensive\b/i,
/\bprovide\s+a\s+valuable\s+insight\b/i,
/\bleft\s+an\s+indelible\s+mark\b/i,
/\bin\s+a\s+world\s+(of|where)\b/i,
```

#### Change C3: In `naturalness.ts` — Expand `OVER_ADVANCED_SWAPS` with the new flagged words

Add the new flagged vocabulary to the swap map so `cleanupSurfacePatterns` (the post-processing step) catches any that slip through:

```typescript
// Add to OVER_ADVANCED_SWAPS:
showcase: "show",
illuminate: "clarify",
foster: "encourage",
harness: "use",
intertwine: "connect",
reimagine: "rethink",
transcend: "go beyond",
unleash: "release",
unravel: "explain",
embark: "start",
craft: "write",
navigate: "handle",
groundbreaking: "new",
exemplary: "strong",
remarkable: "notable",
invaluable: "very useful",
indelible: "lasting",
tapestry: "mix",
facet: "side",
interplay: "interaction",
paradigm: "model",
testament: "proof",
```

Also expand `FILLER_PHRASES`:

```typescript
// Add to FILLER_PHRASES:
"a testament to",
"the landscape of",
"paving the way",
"harness the power",
"navigating the complexities",
"in a world where",
"gain a comprehensive understanding",
"provide a valuable insight",
"play a significant role",
"serves as a reminder",
"from this perspective",
```

#### Change C4: In `prompt.ts` — Add structural anti-pattern rules for formal/graduate

Add these to the boundary rules section of `buildBasePrompt`, specifically targeting the patterns the research identifies as formal-AI tells:

```
- Do not overuse present participial phrases (main clause, comma, -ing verb). Use at most one per 300 words.
- Do not use "From X to Y" overview constructions ("From ancient traditions to modern innovations").
- Do not start every paragraph with a topic sentence. Begin some paragraphs with evidence, a concession, a question, a qualification, or a mid-thought continuation instead.
- Do not deploy the same internal paragraph logic (claim, then supporting example, then evaluative conclusion) in more than two paragraphs. Vary how paragraphs build their arguments.
- Use equivocal connectors ("but," "though," "however," "still," "granted," "admittedly") more often than additive connectors ("furthermore," "moreover," "additionally," "in addition"). Human academic writers favor equivocal transitions.
- Include hedging and stance markers where appropriate: "arguably," "to some extent," "it seems," "in fairness," "granted," "though this is debated."
- Vary punctuation: include at least some semicolons, parenthetical asides, and occasional dashes (short dashes, not em dashes). AI text over-relies on periods and commas alone.
```

#### Change C5: In `prompt.ts` — Add quantitative sentence-length targets for formal/graduate

The current "Statistical naturalness targets" section gives general guidance. For formal/graduate/100 specifically, the model needs harder numbers. Add a conditional block in `buildBasePrompt` that fires when `request.tone === "formal" && (request.gradeLevel === "college" || request.gradeLevel === "graduate") && request.humanLikeLevel >= 80`:

```
FORMAL-REGISTER NATURALNESS OVERRIDES (these apply because formal academic text is the hardest case for natural writing):
- Sentence length: target a mean of 18-22 words with standard deviation of 8-12 words PER PARAGRAPH. This means some sentences of 5-8 words and some of 30-40 words in every paragraph. Do NOT cluster all sentences at 15-20 words.
- The word-count difference between consecutive sentences should average 6-10 words. Do not write three sentences in a row with similar lengths.
- Vary paragraph length: some paragraphs should have 2-3 sentences, some 5-7. Do not make all paragraphs 3-5 sentences.
- Content-to-function-word ratio: human academic writing uses a roughly 1:1 ratio of content words to function words. AI text over-indexes on content words (ratio ~1.37). Include more function words, hedges, and connective tissue.
- At 3-5 points per 500 words, choose a word that is NOT the most obvious or highest-probability choice. Pick a less common but still natural synonym — the kind of word a human would reach for after a moment of thought, not the first word that comes to mind.
```

#### Change C6: In `prompt.ts` — Restructure the a→j chain for formal/graduate/100

The research shows that **naive recursive paraphrasing can increase detectability** — it changed surface words while preserving the underlying statistical signature. The current 10-step chain (a through j) risks exactly this: each step does another round of unfocused paraphrasing.

Restructure the chain to follow the research-recommended **3-focused-pass model** within each step grouping:

- Steps (a)-(c): **Structural overhaul pass** — focus on paragraph structure, sentence order, sentence merging/splitting, paragraph opening variety, eliminating topic-sentence-first patterns
- Steps (d)-(f): **Vocabulary and transition pass** — focus on replacing all flagged vocabulary, eliminating formal transition stacking, adding equivocal connectors, adding hedges and stance markers
- Steps (g)-(h): **Rhythm and imperfection pass** — focus on sentence-length variance targeting the specific numerical thresholds, adding controlled imperfections, introducing 2-3 per-500-word entropy injections
- Steps (i)-(j): **Guardrail verification and final polish**

Update the step instructions in `buildBasePrompt` to explicitly assign these focuses. For example, step (a) currently says "Paraphrase at the micro level by replacing words and short phrases." Change it to:

```
a. Create version (a) from the original essay only. STRUCTURAL FOCUS: Do not just swap words — reshape sentences. Split at least 20% of sentences and merge at least 10%. Vary paragraph openings: do not start more than one paragraph with the same syntactic structure (e.g., do not start two paragraphs with a noun phrase subject). Move the main point of at least two paragraphs away from the opening sentence. Break any claim→example→evaluation template that repeats across paragraphs. Keep the paragraph count at exactly ${paragraphCount}...
```

Apply similar focused instructions to each step group.

#### Change C7: In `validation.ts` — Add burstiness (sentence-length CV) as a validation check

The current `hasSentenceVariety` check (line 158) only checks if variance ≥ 8, which is far too lenient. A variance of 8 corresponds to a CV of ~0.15 — exactly the AI range. Add a proper coefficient-of-variation check:

```typescript
export function hasSufficientBurstiness(output: string) {
  const lengths = getSentenceLengths(output);
  if (lengths.length < 5) return true;

  const mean = lengths.reduce((s, v) => s + v, 0) / lengths.length;
  if (mean === 0) return true;

  const stdDev = Math.sqrt(
    lengths.reduce((s, v) => s + (v - mean) ** 2, 0) / lengths.length
  );
  const cv = stdDev / mean;

  // Human text typically has CV of 0.40-0.60; AI text sits at 0.15-0.25
  return cv >= 0.35;
}
```

Add this check to `buildConstraintReport`:

```typescript
if (!hasSufficientBurstiness(output)) {
  report.unmetConstraints.push("Sentence lengths are too uniform — need more variation between short and long sentences.");
}
```

This means that when the outer loop in `index.ts` detects low burstiness, it will feed that specific violation into the repair prompt, which will tell the model exactly what to fix.

#### Change C8: In `validation.ts` — Add transition density check

```typescript
export function hasAcceptableTransitionDensity(output: string) {
  const words = output.toLowerCase().match(/\b[\w'-]+\b/g) ?? [];
  const transitionWords = new Set([
    "furthermore", "moreover", "additionally", "consequently",
    "therefore", "however", "nevertheless", "nonetheless",
    "subsequently", "accordingly", "hence", "thus",
    "meanwhile", "conversely", "similarly", "likewise",
  ]);
  const transitionCount = words.filter(w => transitionWords.has(w)).length;
  // Human text: transition density under 3% of total words
  return words.length === 0 || (transitionCount / words.length) < 0.03;
}
```

Add to `buildConstraintReport`:

```typescript
if (!hasAcceptableTransitionDensity(output)) {
  report.unmetConstraints.push("Too many formal transition words — reduce transition density to feel more natural.");
}
```

---

## PART D: Testing and Verification

After making all changes, verify with these test cases:

1. **Paragraph count test**: Input a 5-paragraph essay. Output must have exactly 5 paragraphs across all settings (casual/middle_school/10, formal/graduate/100, and everything between).

2. **Word count test**: Input a 500-word essay with wordDelta=20. Output must be 480-520 words. Test at intensity 100 specifically — this is where drift is worst.

3. **Detection test**: Input a 500-word formal/graduate essay, run at humanLikeLevel=100, and check the output against GPTZero. The goal is to get below 50% AI detection (currently at 100%).

4. **Regression test**: Run existing tests in `humanizer_test.ts` — all should still pass. The new validation checks (burstiness, transition density) should be added as new test cases.

---

## Summary of All File Changes

| File | Changes | Purpose |
|------|---------|---------|
| `prompt.ts` | A1: Numbered `<p1>`...`<pN>` output format | Structurally enforce paragraph count |
| `prompt.ts` | A2: Per-paragraph word budgets | Plan-and-Write length control |
| `prompt.ts` | B1: Emphatic word count constraint | Stop word count drift |
| `prompt.ts` | B2: Word count checkpoints in steps d/e/i/j | Mid-chain drift prevention |
| `prompt.ts` | C1: Expanded banned vocabulary (50+ words) | Eliminate RLHF fingerprint |
| `prompt.ts` | C4: Structural anti-pattern rules | Break formal-AI tells |
| `prompt.ts` | C5: Quantitative sentence-length targets | Target specific detector signals |
| `prompt.ts` | C6: Focused step groupings in a→j chain | Replace naive recursive paraphrasing with targeted passes |
| `index.ts` | A3: Parse numbered paragraph tags | Extract structured output |
| `index.ts` | A4: Paragraph count hard enforcement | Programmatic repair |
| `index.ts` | B3: Word count hard rejection gate | Stop cascading drift |
| `validation.ts` | C2: Expanded BANNED_AI_VOCABULARY + phrases | Catch new flagged words |
| `validation.ts` | C7: Burstiness (CV) check | Detect uniform sentence lengths |
| `validation.ts` | C8: Transition density check | Detect transition stacking |
| `naturalness.ts` | C3: Expanded OVER_ADVANCED_SWAPS + FILLER_PHRASES | Post-process cleanup net |
