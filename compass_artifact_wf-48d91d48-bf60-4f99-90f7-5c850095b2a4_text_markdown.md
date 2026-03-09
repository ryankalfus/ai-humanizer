# Making AI-rewritten formal text read as authentically human

**The most reliable way to make LLM-generated academic text pass statistical classifiers is not a single trick but a layered system: eliminate known vocabulary fingerprints, inject measurable sentence-level variance that mimics human burstiness distributions, process text paragraph-by-paragraph with detector-in-the-loop feedback, and use cross-model rewriting.** Modern detectors like GPTZero, Turnitin, and Originality.ai have reached 95–99% accuracy on unmodified AI output, but their performance drops 15–90% against targeted adversarial techniques. The core vulnerability of formal AI text is statistical uniformity — low perplexity, low burstiness, predictable structure — and the core strategy for circumventing detection is systematically reintroducing the measurable irregularity that characterizes human writing.

This report synthesizes 2024–2026 research across detection technology, computational stylistics, adversarial paraphrasing, and prompt engineering to provide specific, encodable techniques for a rewriting system prompt.

---

## How the four major detectors actually work

Modern AI text detectors fall into two architectural families: **statistical/zero-shot methods** (measuring text properties like perplexity and burstiness against expected distributions) and **trained classifiers** (transformer models fine-tuned on labeled human/AI corpora). The four dominant commercial tools use hybrid approaches.

**GPTZero** deploys a seven-component multilayered model. Its foundation measures perplexity (how surprising each word is to a language model) and burstiness (variation in sentence-level perplexity across a document), but it supplements these with an education module comparing text to student writing corpora, sentence-by-sentence classification (GPTZeroX), adversarial defense (GPTZero Shield), internet text matching, and a custom deep learning classifier. On the RAID benchmark (672,000 texts, 12 LLMs, 12 adversarial attacks), GPTZero achieved **95.7% true positive rate at 1% false positive rate** as of October 2025. Real-world accuracy is lower — independent tests by Cybernews found ~70% on mixed/edited text.

**Turnitin** uses a custom BERT-based architecture operating on segment windows of a few hundred words with one-sentence stride lengths. Each window produces a 0-to-1 score; sentence-level predictions are computed via weighted averages. Its two-model system — **AIW-2** for direct detection and **AIR-1** for paraphrase/rewriting detection — achieves 91.18% document-level recall with only 0.51% false positive rate. In August 2025, Turnitin launched dedicated "AI bypasser detection" targeting humanizer tools.

**Originality.ai** runs a modified BERT model with three tiers: Lite (99% accuracy, 0.5% FPR), Turbo (97% on humanized content, 1.5% FPR), and Academic (99%+, <1% FPR). Its September 2025 models detect GPT-5.2 output at 97–98% accuracy. **Copyleaks** takes a different approach — rather than training on specific LLMs, it targets underlying text generation techniques, claiming this lets it detect new models without retraining. It supports adjustable sensitivity levels, with Level 3 producing **1,800% more false positives** than Level 1.

All four tools converge on the same core statistical signals: low perplexity, low burstiness, uniform sentence length, predictable vocabulary distributions, and structural regularity. The critical implication is that **defeating any one tool's specific model matters less than eliminating the shared statistical fingerprints**.

## Why formal academic AI text is maximally detectable

Formal AI text concentrates every statistical signal that detectors measure, creating a paradox: the qualities that make academic writing "good" also make AI-generated academic writing maximally detectable.

**Perplexity compression is the primary signal.** In rephrasing tasks, LLaMA produced text with mean perplexity of **18.37** versus human text mean of **43.03** — a 2.3x difference. Formal register constrains vocabulary choices, and AI amplifies this constraint by consistently selecting the highest-probability token at each position. Human writing averages perplexity scores of 20–50 on standard English benchmarks; top LLMs score as low as 5–10.

**Burstiness suppression is the secondary signal.** AI models generate sentences clustering tightly around **15–20 words**, while human prose ranges from terse 3-word fragments to 40+ word sprawling constructions. The burstiness formula used by detectors is **B = (σ / μ) × 100**, where σ is standard deviation and μ is mean sentence length. Low B values flag AI. One 2024 case study showed that editing AI text to introduce burstiness reduced detection rates by **40%**. Formal academic AI text has even less burstiness than casual AI text because the formal register itself already constrains variation, and AI amplifies this into near-total uniformity.

**Structural predictability is the tertiary signal.** AI deploys textbook paragraph templates — topic sentence, supporting details, concluding statement — with mechanical consistency. It begins nearly every paragraph with a formal connector ("Furthermore," "Moreover," "Additionally") at **3–5x the rate of human writing**. Turnitin's own documentation acknowledges false positives "particularly with formal or technical writing that mimics AI-like traits," confirming that formal AI text sits squarely in the highest-confidence detection zone.

A November 2025 SSRN paper (Kujur) confirmed that "AI-generated texts typically demonstrate lower perplexity, more uniform sentence structures, and higher lexical repetitiveness" but noted that "as language models have advanced, these differences have diminished significantly." The gap is closing but remains exploitable by detectors.

## Measurable linguistic differences between human and AI academic text

Computational stylistics research from 2023–2026 has identified specific, quantifiable differences. These are the features a rewriting system must target.

**Sentence length distribution.** Average sentence length alone is not a useful discriminator (Desaire et al., 2023, *Cell Reports Physical Science*), but the **standard deviation of sentence length within paragraphs** is a powerful differentiator. Humans vary sentence length far more per paragraph. The median difference in word count between consecutive sentences is also a key feature — humans create larger jumps. AI consistently writes at 15–20 words per sentence; human academic writing ranges from 5 to 45 words.

**Paragraph structure.** The two largest distinguishing features identified by Desaire et al. were number of sentences per paragraph and total words per paragraph — human paragraphs are significantly longer and more varied. The **standard deviation of paragraph length across a document** is a "highly predictive indicator" of human authorship. AI produces remarkably uniform paragraphs of 3–5 sentences and 60–100 words each.

**Lexical diversity and vocabulary patterns.** Type-Token Ratio data shows humans average **55.3** versus AI's **45.5** in general contexts, though in academic settings GPT-4 actually exceeds human student TTR (0.69 vs. 0.61). The critical difference is vocabulary *type*: AI overuses content words (content-to-function word ratio of **1.37** vs. human **0.98**), creating a detectable "heaviness." Humans deploy more function words, hedging expressions, and idiomatic language. AI uses fewer commas, question marks, dashes, parentheses, and semicolons, relying primarily on periods and commas.

**Discourse and stance markers.** Human academic writers frequently use equivocal language ("but," "however," "although") — a pattern not shared by AI (Desaire et al.). AI uses **significantly fewer interactional metadiscourse features** — hedges, boosters, and attitude markers — while prioritizing transitions and structural coherence. Students used hedges **12 times** versus GPT's **7 times** in matched samples. AI produces "a narrower and more repetitive range of stance and engagement features." Human writers use more modals and epistemic markers conveying speaker attitude; AI uses more nominalizations and achieves formality through lexical density rather than varied syntactic strategies.

**Phonological fingerprints persist.** AI-generated texts show **20–23% higher frequencies** of various consonant types — a statistical bias from training data that persists even after substantial editing. A 2025 *Nature Humanities & Social Sciences Communications* study using Burrows' Delta found AI systems produce "tightly grouped clusters" while human authors show "greater stylistic diversity and individuality."

## The vocabulary and structural fingerprints that trigger detection

Research has moved well beyond "delve" and "moreover." Quantitative corpus analysis now identifies hundreds of flagged markers.

**The most extreme frequency disparities** come from IsGPT's analysis of 3.3 million texts (updated February 2025). Phrases like "provide a valuable insight" appear **468x more frequently** in AI text, "left an indelible mark" at **317x**, "play a significant role in shaping" at **207x**, and "a nuanced understanding" at **115x**. These are not subtle differences — they are orders-of-magnitude overrepresentation.

**RLHF is the primary driver of word overuse.** A May 2025 study comparing Llama Base versus Llama Instruct found "nuanced" increased **8,342%** after RLHF alignment, "firstly" increased **4,794%**, and "reliance" increased **3,193%**. Of 32 words identified in literature as LLM-overrepresented, **28 (87.5%)** also appeared in the base-versus-instruct comparison, confirming alignment training — not architecture — as the source.

**Corpus-level analysis** of 14 million PubMed abstracts (Kobak et al., 2024) found "delves" appeared **25.2x** more frequently in 2024 versus pre-LLM baseline, "showcasing" at ~9x, and "underscores" at ~9x. At least **10% of 2024 abstracts** (up to 30% in some subcorpora) showed LLM processing. The 280 identified excess "style" words were predominantly **verbs (two-thirds) and adjectives (one-fifth)**, not content nouns.

The comprehensive avoidance list for formal academic rewriting includes:

- **Flagged verbs:** delve, navigate, underscore, showcase, illuminate, elucidate, foster, harness, intertwine, reimagine, revolutionize, transcend, unleash, unlock, unravel, weave, embark, craft
- **Flagged adjectives:** commendable, meticulous, multifaceted, pivotal, nuanced, indelible, invaluable, groundbreaking, exemplary, cutting-edge, remarkable, intricate
- **Flagged adverbs:** seamlessly, meticulously, intricately, profoundly, pivotally, relentlessly, tirelessly, vibrantly
- **Flagged nouns:** tapestry, realm, landscape, facet, interplay, kaleidoscope, symphony, testament, paradigm, roadmap, toolkit, quest, journey
- **Flagged phrases:** "it's important to note," "in a world of/where," "not only ___ but also," "a testament to," "the landscape of," "navigating the complexities of," "paving the way," "harness the power of," "serves as," "gain a comprehensive understanding," "play a crucial role"

**Structural patterns are equally important:** em dash overuse (AI uses them frequently for explanatory clauses), consistent Oxford comma usage, American English spelling exclusively, perfect grammar with no split infinitives or dangling prepositions, rigid topic-sentence-first paragraph construction, and "From X to Y" constructions ("From bustling cities to serene landscapes"). AI also overuses present participial phrases (main clause + comma + -ing verb) at **2–5x the human rate** and deploys the "rule of three" pattern compulsively.

## Multi-pass rewriting: what works and what backfires

The most important finding from 2025 adversarial research is that **naive recursive paraphrasing can increase detectability**. A June 2025 study (Sadasivan et al.) demonstrated that simple or recursive paraphrasing sometimes *increased* detection rates — by +8.57% on RADAR and +15.03% on Fast-DetectGPT — while targeted adversarial paraphrasing achieved **87.88% average reduction** across 8 detectors. The difference is specificity: unfocused rewriting preserves the statistical fingerprint while changing surface words, whereas targeted rewriting attacks the specific features detectors measure.

**Paragraph-level paraphrasing** remains the most powerful single technique. The DIPPER model (NeurIPS 2023) reduced DetectGPT accuracy from **70.3% to 4.6%** at 1% false positive rate using paragraph-level lexical diversity and content reordering controls. The AuthorMist system (March 2025) used reinforcement learning trained against Originality.ai to iteratively reduce detection from **88.6% to 8.7%** while maintaining linguistic similarity, with strong cross-detector transfer.

**Sentence-level approaches offer surgical precision.** TempParaphraser (EMNLP 2025) segments text into individual sentences, generates multiple paraphrase candidates per sentence, uses a detector to select the least-detectable version of each, then reassembles. This detector-in-the-loop approach is explicitly multi-pass and produces the highest per-sentence optimization.

**The optimal approach uses 2–3 targeted passes with distinct focuses:**

1. **Pass 1 — Structural overhaul:** Break uniform paragraph lengths (vary from 2 to 8 sentences), eliminate five-paragraph-essay format, vary sentence openings, remove predictable topic-sentence-first pattern
2. **Pass 2 — Vocabulary and transitions:** Replace all flagged AI-tell words, eliminate formal transition stacking, substitute equivocal human-style connectors ("but," "though," "still"), add idiomatic expressions
3. **Pass 3 — Voice and rhythm injection:** Introduce sentence-length variance (targeting SD of 8–12 words within paragraphs), add register micro-shifts, insert specific details replacing vague generalities, introduce deliberate minor imperfections

**Cross-model rewriting is consistently more effective** than same-model rewriting. Research shows machine-generated text is less frequently altered upon rewriting by the same model compared to human text (the "Raidar" effect). Using a different model for rewriting introduces additional variation. Practitioners report that GPT for drafting + Claude or Gemini for humanization outperforms single-model approaches.

## Controlling output length and preserving paragraph structure

LLMs fundamentally lack built-in word counters — they operate on tokens, not words — making length control a persistent challenge. However, several techniques achieve reliable structural fidelity.

**The Plan-and-Write method** (KDD Workshop 2025) achieves up to **37.6% improvement** in length adherence by instructing the model to first allocate a word budget across sections before writing, incorporating explicit counting mechanisms. The core pattern: "First, plan how to allocate your [N]-word budget across sections. Then write each section, tracking your word count." This works without model retraining.

**PositionID Prompting** (Wang et al., October 2024) assigns sequential position IDs to each word during generation, forcing continuous counting during next-token prediction. It significantly outperforms zero-shot, few-shot, chain-of-thought, and truncation baselines, though it may increase token costs.

**Paragraph-by-paragraph processing** is the most reliable technique for structural preservation. Breaking text into individual paragraphs and processing each separately prevents the "lost in the middle" effect where LLMs drop information from long contexts. For a system prompt, this means processing each paragraph as an independent rewriting task with explicit constraints, then reassembling.

**JSON schema enforcement** provides guaranteed paragraph count preservation. Using OpenAI's Structured Outputs with `strict: true`, each paragraph becomes a required field in the schema, ensuring exact structural compliance. This is the most programmatically reliable approach for paragraph count fidelity.

**GPT-4.1 and later models follow instructions more literally** than predecessors. The OpenAI GPT-4.1 prompting guide specifically notes that "a single sentence" added to the system prompt can correct structural behavior. Structured prompt formatting using XML tags or markdown headers improves compliance across all models. Key practices include specifying ranges rather than exact counts ("450–550 words" not "500 words"), providing structural skeletons for the model to fill (output anchoring), and using explicit output contracts that enumerate constraints before generation begins.

**Dynamic Length Feedback** (January 2026) injects length tracking during generation, enabling adaptive mid-generation adjustments. This training-free approach significantly improves precision for target word and sentence counts and represents the cutting edge of length control research.

## Actionable parameters for a GPT-5.1 system prompt

Synthesizing the research, the following specific targets and techniques are encodable:

**Sentence-length targets:** Mean of 16–22 words with standard deviation of **8–12 words** within each paragraph. Include at least one sentence under 8 words and one over 30 words per 3–4 paragraphs. The median word-count difference between consecutive sentences should be **6–10 words** (matching human distributions from Desaire et al.).

**Paragraph structure targets:** Vary paragraph length from **2 to 8 sentences** with a document-level standard deviation in paragraph word count of at least **30–40%** of the mean. Never use the same paragraph length twice consecutively. Avoid starting every paragraph with a topic sentence — begin some with evidence, anecdotes, qualifications, or mid-thought continuations.

**Vocabulary constraints:** Maintain a content-to-function word ratio near **0.98** (not 1.37). Target word-level Shannon entropy between **4 and 6 bits**. Use equivocal and hedging language ("though," "but," "admittedly," "granted") at rates matching human academic writers. Target idiom density of **8–12%**. Use varied punctuation including semicolons, parenthetical asides, and dashes used sparingly.

**Transition strategy:** Eliminate stacked formal transitions. Never begin more than one paragraph per page with a conjunctive adverb. Prefer subordinate clauses ("While X, Y") and implicit logical connections over explicit markers. Use "but" and "however" more than "furthermore" and "moreover" — human writers favor equivocal transitions over additive ones.

**Structural unpredictability:** Vary paragraph openings — some with evidence first, some with concessions, some with questions, some with short declarative claims. Break the "three-point" pattern. Allow occasional single-sentence paragraphs. Do not mirror the same organizational template across sections.

**Deliberate imperfection:** Include occasional sentences starting with "And" or "But." Allow one or two split infinitives per document. Use contractions sparingly but non-zero. Let some sentences end with prepositions. Vary between active and passive voice within the same paragraph rather than maintaining consistent voice throughout.

## Conclusion

The detection landscape in 2025–2026 is an arms race with measurable parameters on both sides. The four major detectors converge on the same core signals — **perplexity uniformity, burstiness suppression, vocabulary fingerprints, and structural predictability** — and formal academic text amplifies all four. The most effective countermeasures are not surface-level word swaps but systematic injection of the statistical irregularity that characterizes human cognition: varied sentence rhythms, unpredictable paragraph structures, equivocal stance markers, and vocabulary that avoids the hundreds of RLHF-amplified tell words now documented in large-scale corpus studies.

The critical insight from 2025 adversarial research is that naive rewriting often fails or backfires, while **targeted, detector-aware, multi-pass processing with cross-model variation** can reduce detection from 89% to under 9%. The optimal workflow is paragraph-by-paragraph processing with 2–3 focused passes (structure → vocabulary → rhythm), using explicit structural constraints in prompts, JSON schema enforcement for paragraph preservation, and the Plan-and-Write method for length fidelity. These techniques are encodable into a system prompt, but their effectiveness depends on specificity — vague instructions like "write naturally" accomplish far less than precise statistical targets for sentence-length variance, transition density, and vocabulary distributions.