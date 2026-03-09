# Instructions: Improve the Humanizer Prompt for Natural Human-Like Output

## Context

You are modifying `prompt.ts` — the prompt-construction module for an essay humanizer. The system takes AI-generated text and rewrites it through a multi-step internal chain (steps a→j) across multiple outer passes (2–8 iterations) so the output reads like authentic human writing. The model performing the rewrite is GPT-5.1. The current prompt already handles: multi-step rewriting, paragraph-level paraphrasing, lexical diversification, banned AI vocabulary, alternating compression/expansion passes, guardrails (word count, paragraph count, tone, grade level, protected terms, citations). 

The changes below make the output more statistically consistent with real human writing patterns, based on what distinguishes human text from model-generated text at the measurable level. Do not remove any existing functionality — layer these improvements into the existing structure.

---

## Change 1: Add Explicit Statistical Naturalness Targets (HIGH PRIORITY)

### What to do

Add a new section in `buildBasePrompt` between the current "Research-informed guidance" block (lines 267–274) and the "Global rules" block (line 278). This section gives the model concrete, measurable properties of natural human writing to aim for.

### What to add

```
Statistical naturalness targets:
- Human writing has high sentence-length variance. The coefficient of variation (standard deviation divided by mean) of sentence word counts in natural writing typically falls between 0.40 and 0.60. Model-generated text typically sits at 0.15–0.25. In the output, deliberately include some very short sentences (3–8 words) and some genuinely long ones (30+ words) in an irregular, non-alternating pattern.
- At least 15% of sentences in the output should be under 10 words. At least 10% should be over 25 words. No paragraph should have all sentences within ±5 words of each other in length.
- Human writing includes occasional surprising or slightly unusual word choices — not always the most probable next word, but a less obvious synonym a human would reach for after a moment of thought. At 2–4 points per paragraph, choose the second- or third-most-obvious word rather than the default one.
- No more than 2 consecutive sentences should start with the same part of speech.
- Transition word density should not exceed 3% of total word count. Do not use transition words as sentence openers more than twice per 500 words.
- Human writing has non-uniform paragraph rhythms. Some paragraphs should open abruptly with a short declarative. Some should open with a subordinate clause. Some should open with a concrete detail. Vary these across paragraphs and do not repeat the same opening structure in consecutive paragraphs.
```

### Why

The current prompt describes naturalness qualitatively ("vary cadence," "mix shorter and longer sentences") but doesn't give the model quantitative targets. Models follow measurable instructions more reliably than vague qualitative ones. These specific thresholds are derived from corpus-level comparisons of human vs. model text.

---

## Change 2: Add Entropy Injection Directive (HIGH PRIORITY)

### What to do

Add the following to the "Boundary rules before generation" section (after the existing rules around line 258, before the "Research-informed guidance" section):

### What to add

```
- Entropy injection: At 2–3 points per 500 words, make a structural choice that is moderately unexpected: an unusual clause order, a sentence that starts with a conjunction ("And," "But," "Or"), a deliberate sentence fragment used for emphasis, an interrupted thought resumed with a dash or parenthetical aside, a rhetorical question, or a colloquial turn of phrase. These create local unpredictability in the text's statistical profile, which is characteristic of natural writing. Do not cluster these — spread them across different paragraphs.
```

### Why

Model text occupies statistically smooth, low-variance regions of the probability space. Human text has local spikes of unpredictability — moments where the next word or structure is not what a model would most likely produce. This directive creates those spikes without making the prose sound erratic.

---

## Change 3: Add Controlled Imperfection Injection (HIGH PRIORITY)

### What to do

Add to the "Boundary rules before generation" section, near the entropy injection directive:

### What to add

```
- Controlled imperfection: Human writing contains minor natural imperfections that model-generated text typically lacks. Include 2–3 of the following per 500 words of output: (a) a transition that is slightly abrupt rather than seamlessly smooth; (b) a point restated in slightly different terms without adding new information (natural human redundancy); (c) a mildly informal aside or qualification that a careful editor might tighten but a real writer would leave in a draft; (d) uneven depth of development — not every claim or point elaborated to the same degree, with some ideas getting a full sentence of support and others stated without elaboration. Do not introduce factual errors, grammatical mistakes, or genuinely bad writing. The goal is the kind of minor unevenness that naturally occurs in human prose.
```

### Why

The current prompt optimizes hard for coherence, flow, and polish at every step of the a→j chain. But excessive polish is itself a statistical signal of model authorship. Real human writing — even good human writing — has slight unevenness in transitions, development depth, and phrasing precision. This directive prevents the output from being "too perfect."

---

## Change 4: Add Structural Pattern Bans (MEDIUM PRIORITY)

### What to do

Extend the existing banned-pattern rules in `buildBasePrompt` (the "Boundary rules" block starting at line 242 and the `buildGuardrailDetails` function starting at line 177). Add these to both locations to ensure they're enforced in the guardrail string and the boundary rules.

### What to add to boundary rules

```
- Do not use three or more parallel items in the same grammatical form ("X, Y, and Z" triads) more than once per 500 words. When listing multiple items, break them across sentences or use different grammatical structures instead of neat triadic lists.
- Do not create perfectly balanced sentence pairs where one sentence presents a point and the immediately following sentence qualifies it with a matching structure and similar length. Vary how qualifications and counterpoints are introduced.
- Do not repeat the same paragraph-level template across multiple paragraphs (e.g., abstract claim → supporting example → evaluative conclusion in every paragraph). Vary the internal logic structure across paragraphs.
- Do not open more than one paragraph in the same essay with a dependent clause using the same subordinating conjunction.
- Do not use more than one semicolon-joined independent clause per 500 words unless the source text specifically uses them.
```

### What to add to `buildGuardrailDetails` return array

Add these as additional entries in the array returned by `buildGuardrailDetails`:

```typescript
`do not use "X, Y, and Z" triadic parallel lists more than once per 500 words`,
`do not create balanced sentence pairs with matching structure and length back-to-back`,
`do not repeat the same paragraph-level logic template (claim → example → evaluation) across multiple paragraphs`,
`do not open more than one paragraph with a dependent clause using the same conjunction`,
```

### Why

Current banned patterns focus on individual words and short phrases. But classifiers also detect structural-level patterns that recur across model output: triadic lists, balanced sentence pairs, and repeated paragraph templates. Banning these at the structural level addresses a different detection surface than vocabulary rotation alone.

---

## Change 5: Add Cross-Model Fingerprint Mitigation (MEDIUM PRIORITY)

### What to do

Add a new directive to the "Boundary rules before generation" section. This should go near the top, after the first few rules about keeping writing human and idiomatic.

### What to add

```
- Model-fingerprint mitigation: Do not default to your most natural or highest-probability phrasing patterns. Actively vary: (a) your typical clause-ordering preferences — if you tend to put the main clause first, sometimes lead with the subordinate clause, and vice versa; (b) your most common transition words — track which transitions you have already used and avoid repeating any transition word within 300 words; (c) your default sentence-opening patterns — if you find yourself starting sentences with the subject-verb pattern repeatedly, interrupt that with a different construction. When you notice yourself reaching for a comfortable, default phrasing, choose the second or third option instead. Prefer constructions that feel like a human writer's considered first draft, not a model's most-optimized output.
```

### Why

When the same model family (GPT) rewrites text originally produced by a GPT-family model, statistical fingerprints from the model family persist in the output — the rewrite inherits distributional patterns from the rewriter itself. This is a known limitation documented in paraphrasing research. This directive pushes the model to actively deviate from its own default distributions, partially mitigating the same-family fingerprint problem.

---

## Change 6: Add Tournament Selection to the a→j Chain (MEDIUM PRIORITY)

### What to do

Modify the instructions for steps (b), (d), (f), and (h) in the `buildBasePrompt` function (lines 308, 312, 316, 320) to include a lightweight internal tournament. Add the following instruction to each of those four steps.

### What to add (append to steps b, d, f, h)

For step (b), append before the closing parenthetical:

```
For this step, internally draft TWO alternative versions of each paragraph. Select the version whose sentence lengths are more varied, whose word choices are less predictable, and whose structure differs more from the immediately prior version. Carry only the selected version forward as version (b).
```

Apply the same pattern to steps (d), (f), and (h), changing the version letter accordingly.

### Why

The current chain is purely serial — each step takes the single output of the prior step and transforms it once. Research on effective multi-step rewriting shows that a selection/tournament step (generating multiple candidates and picking the best one) significantly improves output quality. This lightweight tournament doesn't require external tools — it just asks the model to generate two options per paragraph and self-select the one with more natural statistical properties.

---

## Change 7: Upgrade the Research-Informed Guidance Section (MEDIUM PRIORITY)

### What to do

Replace the current "Research-informed guidance" block (lines 267–274) with a more specific, actionable version. Keep the same section header.

### Replace with

```
Research-informed guidance:
- Corpus-level comparisons of human and model text show that human writing has: (a) higher lexical diversity within paragraphs, (b) more varied sentence lengths with a coefficient of variation above 0.40, (c) less uniform transition usage, (d) less symmetrical sentence construction, and (e) more variation in how thoroughly different points are developed.
- Human writing uses fewer stacked abstract nouns (words ending in -tion, -ment, -ness, -ity) and more concrete, context-specific phrasing.
- Human writing reuses key terms naturally rather than aggressively rotating synonyms for the same concept. When a specific technical or topic-central term is the right word, repeat it rather than forcing an unnatural synonym.
- Paragraph-level paraphrasing (reshaping how ideas flow within a paragraph as a unit) changes discourse-level patterns more effectively than sentence-by-sentence editing.
- Multi-step rewriting that alternates compression, expansion, reordering, and vocabulary refresh produces more natural output than a single rewrite pass.
- Human text often places important information in the middle of paragraphs, not always at the beginning or end. Vary where the key point of each paragraph lands.
- Human writing occasionally embeds opinion-like qualifiers ("surprisingly," "oddly enough," "in fairness"), hedges that feel natural rather than formulaic, and emphasis markers that model text rarely uses. Include these sparingly where they fit the requested tone.
- Apply these findings: vary cadence irregularly, reduce repeated transition scaffolds, mix clause lengths unpredictably, avoid repeating sentence blueprints, prefer concrete context-appropriate phrasing, rotate repeated word choices with natural alternatives (not forced synonyms), split or merge sentences when it helps break predictable rhythm, reshape paragraphs as full units, and allow sentence-level order changes when they improve natural flow.
```

### Why

The current research-informed guidance is too vague and reads as general writing advice. The replacement encodes specific, actionable findings from text analysis research, including some counterintuitive ones (like *not* aggressively rotating synonyms for key terms, which can itself be a tell).

---

## Change 8: Add Naturalness Heuristic to Iteration Focus (LOWER PRIORITY)

### What to do

Modify the `getIterationFocus` function (line 147) to include a naturalness-check instruction for the later steps. Specifically, for steps (h), (i), and (j), add a naturalness self-check to the returned string.

### What to add

In the `getIterationFocus` function, add a conditional block:

```typescript
const naturalnessCheck =
  step === "h" || step === "i" || step === "j"
    ? " Before finalizing this step, scan the output for: (1) any run of 3+ sentences with similar word counts (±5 words); (2) any paragraph where all sentences start with the same part of speech; (3) any transition word used more than twice in the same paragraph; (4) any passage that reads too smoothly and evenly without any rhythmic variation. If found, rework those specific spots to introduce more natural variation."
    : "";
```

Then append `${naturalnessCheck}` to the return string at the end of the function.

### Why

This creates a lightweight self-check in the final steps of the chain that approximates what a statistical classifier would flag, without requiring an external detector API. It catches residual patterns that earlier steps may not have resolved.

---

## Change 9: Adjust Intensity Profiles for Higher Levels (LOWER PRIORITY)

### What to do

In the `getIntensityProfile` function (line 8), modify the instructions for the `strong`, `very strong`, and `maximum` levels to incorporate the new naturalness concepts.

### Replace the instruction for level > 85 (maximum)

```typescript
return {
  label: "maximum",
  instruction:
    "Make maximum changes. Rewrite very aggressively at the phrase, clause, and sentence level. Use deep paraphrasing, strong sentence rebuilding, local order changes, sentence splitting and merging, and major vocabulary rotation so the final result feels fully rewritten. At this intensity, also maximize statistical naturalness: push sentence-length variance high, avoid any repeated structural templates across paragraphs, inject natural imperfections and unexpected structural choices, and ensure the output would read as a confident human writer's original draft rather than a carefully processed rewrite.",
};
```

### Replace the instruction for level 71–85 (very strong)

```typescript
return {
  label: "very strong",
  instruction:
    "Make very strong changes. Use rigorous paraphrasing, assertive restructuring, substantial reordering, sentence splitting and merging, and major vocabulary rotation while still preserving all hard rules and the original meaning. At this intensity, also focus on statistical naturalness: ensure high sentence-length variance, break repeated paragraph-level patterns, and include occasional unexpected structural choices that create natural unpredictability in the prose rhythm.",
};
```

### Why

The highest intensity levels should push hardest on the statistical naturalness properties because those settings are chosen by users who want the most thorough rewrite. Encoding naturalness concepts directly into the intensity instruction reinforces the guidance from the other new sections.

---

## Change 10: Add a Sentence-Level Variation Guardrail (LOWER PRIORITY)

### What to do

Add a new entry to the `buildGuardrailDetails` return array (line 195):

### What to add

```typescript
`ensure high sentence-length variance: include at least 15% of sentences under 10 words and at least 10% over 25 words; no paragraph should have all sentences within ±5 words of each other`,
```

### Why

This makes sentence-length variance an explicit guardrail that gets repeated in the per-step iteration instructions via `${guardrailDetails}`, reinforcing it at every step of the chain rather than only in the top-level guidance section.

---

## Summary of All Changes

| # | What | Where in code | Priority |
|---|------|---------------|----------|
| 1 | Statistical naturalness targets (quantitative) | New section in `buildBasePrompt` after research guidance | High |
| 2 | Entropy injection directive | Boundary rules in `buildBasePrompt` | High |
| 3 | Controlled imperfection injection | Boundary rules in `buildBasePrompt` | High |
| 4 | Structural pattern bans | Boundary rules + `buildGuardrailDetails` | Medium |
| 5 | Cross-model fingerprint mitigation | Boundary rules in `buildBasePrompt` | Medium |
| 6 | Tournament selection in chain steps | Steps (b), (d), (f), (h) in `buildBasePrompt` | Medium |
| 7 | Upgraded research-informed guidance | Replace existing block in `buildBasePrompt` | Medium |
| 8 | Naturalness heuristic in iteration focus | `getIterationFocus` function | Lower |
| 9 | Adjusted intensity profiles for high levels | `getIntensityProfile` function | Lower |
| 10 | Sentence-length variance guardrail | `buildGuardrailDetails` return array | Lower |

## Important Implementation Notes

- **Do not remove any existing rules, banned words, or guardrails.** All changes are additive or replacement-in-kind.
- **The tournament selection (Change 6) will increase token usage** since the model generates 2x paragraph text internally at those steps. This is expected and acceptable — the quality improvement justifies the cost.
- **Test the changes incrementally.** Apply Changes 1–3 first (highest impact), verify outputs, then layer in 4–7, then 8–10.
- **The quantitative targets (Change 1) are guidelines, not hard constraints.** The model should aim for them but not sacrifice coherence to hit exact numbers. Frame them as targets, not absolute rules, so the model doesn't produce awkward prose just to hit a sentence-length threshold.
- **Changes 4 and 5 may need periodic updates** as writing patterns evolve. The structural bans should be reviewed quarterly against current analysis of model output patterns.
