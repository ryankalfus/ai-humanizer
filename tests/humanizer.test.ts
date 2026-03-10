import { describe, expect, it } from "vitest";
import {
  applyProtectedSpans,
  extractCitations,
  restoreProtectedSpans,
} from "@/lib/humanizer/citations";
import { getHumanizerConfig, getHumanizerStatus } from "@/lib/humanizer/config";
import { HumanizerError } from "@/lib/humanizer/errors";
import { cleanupSurfacePatterns, downgradeOverwrittenWords, scoreNaturalness } from "@/lib/humanizer/naturalness";
import { buildHumanizerPrompt, buildParagraphPrompt } from "@/lib/humanizer/prompt";
import {
  computeSentenceLengthCV,
  countWords,
  estimateGradeBand,
  getConsecutiveSentenceLengthDiffs,
  getLastSentence,
  getSentenceLengths,
  getSentenceOpeners,
  joinParagraphs,
  parseProtectedTerms,
  splitParagraphs,
} from "@/lib/humanizer/text";
import {
  avoidsAiVocabulary,
  avoidsAbstractNounClusters,
  avoidsContrastTemplates,
  avoidsEmDashes,
  avoidsIndirectFraming,
  avoidsParagraphTemplateRepetition,
  avoidsTransitionOpenerOveruse,
  hasAcceptableTransitionDensity,
  hasAcceptableContentFunctionRatio,
  avoidsRepeatedGenericVerbs,
  avoidsRepeatedOpeners,
  buildConstraintReport,
  hasConsecutiveSentenceVariance,
  hasEnoughParagraphLevelRewriting,
  hasEnoughSentenceLevelRewriting,
  hasEnoughLexicalVariety,
  hasPerParagraphBurstiness,
  hasShortAndLongSentences,
  hasSufficientBurstiness,
  hasSentenceVariety,
  staysWithinExpectedDiction,
  validateRewrite,
} from "@/lib/humanizer/validation";
import type { HumanizeRequest } from "@/lib/humanizer/types";

describe("text helpers", () => {
  it("splits and rejoins paragraphs", () => {
    const source = "First paragraph.\n\nSecond paragraph.";
    const paragraphs = splitParagraphs(source);

    expect(paragraphs).toEqual(["First paragraph.", "Second paragraph."]);
    expect(joinParagraphs(paragraphs)).toBe(source);
  });

  it("parses protected terms from commas and lines", () => {
    expect(parseProtectedTerms("three prongs, originality\nSmith")).toEqual([
      "three prongs",
      "originality",
      "Smith",
    ]);
  });

  it("counts words and estimates readability", () => {
    expect(countWords("A short sentence for counting.")).toBe(5);
    expect(estimateGradeBand("This is a clear sentence. This is another clear sentence.")).toBe(
      "middle_school",
    );
  });

  it("extracts sentence patterns for naturalness checks", () => {
    expect(getSentenceOpeners("We start here. They continue there. We change pace.")).toEqual([
      "we",
      "they",
      "we",
    ]);
    expect(getSentenceLengths("A short sentence. This one is slightly longer.")).toEqual([3, 5]);
    expect(getConsecutiveSentenceLengthDiffs("A short sentence. This one is slightly longer. Tiny line.")).toEqual([2, 3]);
    expect(getLastSentence("A short sentence. This one is slightly longer.")).toBe(
      "This one is slightly longer.",
    );
    expect(computeSentenceLengthCV("Tiny line. This sentence runs much longer than the first one.")).toBeGreaterThan(0);
  });
});

describe("citation handling", () => {
  it("protects and restores citations exactly", () => {
    const source = "This matters (Smith, 2023) and also [12].";
    const spans = extractCitations(source);
    const protectedText = applyProtectedSpans(source, spans);

    expect(protectedText).toContain("__CITATION_0__");
    expect(restoreProtectedSpans(protectedText, spans)).toBe(source);
  });
});

describe("naturalness rules", () => {
  it("downgrades overly advanced swaps", () => {
    expect(
      downgradeOverwrittenWords(
        "We will utilize, showcase, and illuminate the plan because the tapestry is remarkable.",
      ),
    ).toBe(
      "We will use, show, and clarify the plan because the mix is notable.",
    );
  });

  it("penalizes forced wording", () => {
    expect(scoreNaturalness("This uses clear language.")).toBeGreaterThan(80);
    expect(
      scoreNaturalness(
        "This multifaceted paradigm will utilize a plethora of quintessential examples.",
      ),
    ).toBeLessThan(65);
  });

  it("removes prompt fallback residue from output cleanup", () => {
    expect(cleanupSurfacePatterns("First line.\nNone provided\n\nSecond line.")).toBe(
      "First line.\n\nSecond line.",
    );
  });

  it("checks repeated openers and sentence variety", () => {
    expect(avoidsRepeatedOpeners("This starts one way. This starts the same way. This repeats again.")).toBe(false);
    expect(hasSentenceVariety("Tiny sentence. This one is much longer and changes the pace clearly. Another short line.")).toBe(true);
  });

  it("blocks em dashes and contrast-template phrasing", () => {
    expect(avoidsEmDashes("This line stays simple.")).toBe(true);
    expect(avoidsEmDashes("This line uses an em dash — which should fail.")).toBe(false);
    expect(avoidsContrastTemplates("This version feels direct and clear.")).toBe(true);
    expect(avoidsContrastTemplates("It is not weak, but polished.")).toBe(false);
    expect(avoidsContrastTemplates("It is not just calm, but sharp.")).toBe(false);
  });

  it("blocks indirect framing and AI-coded vocabulary", () => {
    expect(avoidsIndirectFraming("The point comes through clearly.")).toBe(true);
    expect(avoidsIndirectFraming("Ultimately, the article presents a clear view.")).toBe(false);
    expect(avoidsIndirectFraming("It is important to note that the point is clear.")).toBe(false);
    expect(avoidsIndirectFraming("In a world where change is constant, the essay makes its case.")).toBe(false);
    expect(avoidsIndirectFraming("The policy became a testament to patient organizing.")).toBe(false);
    expect(avoidsAiVocabulary("The language stays plain and direct.")).toBe(true);
    expect(avoidsAiVocabulary("The essay uses nuanced and robust language.")).toBe(false);
    expect(avoidsAiVocabulary("The groundbreaking roadmap became a testament to change.")).toBe(false);
  });

  it("checks lexical variety, generic verbs, and abstract noun clusters", () => {
    expect(avoidsRepeatedGenericVerbs("The story shows a fear that shows in how it shows control.")).toBe(false);
    expect(avoidsAbstractNounClusters("The discussion centers on imagination, transformation, and isolation in society.")).toBe(false);
    expect(hasEnoughLexicalVariety("This paragraph repeats the same words again and again. The same words repeat again and again in the same paragraph. The same words keep repeating again and again to show the same repeated pattern. The same words repeat again and again because the paragraph keeps using the same words in the same order, with the same repeated rhythm, and the same repeated pattern showing up again and again.", 90)).toBe(false);
    expect(staysWithinExpectedDiction("middle_school", "The quintessential paradigm will facilitate a multifaceted shift.")).toBe(false);
  });

  it("checks burstiness and transition density", () => {
    expect(
      hasSufficientBurstiness(
        "Short line. This sentence runs much longer than the first one and clearly changes the pace. Tiny. This is another sentence with a very different length from the one before it. Brief.",
      ),
    ).toBe(true);
    expect(
      hasSufficientBurstiness(
        "This sentence stays close in length to the next one. Here is another sentence with nearly the same number of words. The next sentence follows that same steady rhythm again. This sentence also keeps the pace very even. One more sentence lands with almost the same length.",
      ),
    ).toBe(false);
    expect(
      hasAcceptableTransitionDensity(
        "However the point still lands because the prose stays light and the paragraph keeps moving without leaning on another formal connector, stacked transition cue, or recycled signpost phrase anywhere else in the sentence, which leaves the overall transition density low enough to pass the human-like threshold.",
      ),
    ).toBe(true);
    expect(
      hasAcceptableTransitionDensity(
        "Furthermore moreover additionally consequently therefore however nevertheless nonetheless subsequently accordingly hence thus meanwhile conversely similarly likewise.",
      ),
    ).toBe(false);
    expect(
      hasPerParagraphBurstiness(
        "Short line. This sentence runs much longer than the first one and clearly changes the pace. Tiny.\n\nAnother brief sentence. This paragraph stretches out with a much longer sentence that breaks the rhythm on purpose. Brief again.",
      ),
    ).toBe(true);
    expect(
      hasConsecutiveSentenceVariance(
        "Tiny line. This sentence runs much longer than the first one and clearly changes the pace. Brief. This sentence runs much longer than the first one and clearly changes the pace again.",
      ),
    ).toBe(true);
    expect(
      hasAcceptableContentFunctionRatio(
        "This sentence has enough connective tissue because it keeps the phrasing balanced and easy to follow for readers.",
      ),
    ).toBe(true);
    expect(
      hasShortAndLongSentences(
        "Short line. This sentence runs much longer than the first one and clearly changes the pace for readers who need more detail and a fuller explanation of the point at hand. Tiny. Another sentence grows much longer than the short ones before it, which helps the paragraph sound less even because it keeps unfolding past the reader's first expectation. Brief. Another quick line.",
      ),
    ).toBe(true);
    expect(
      avoidsParagraphTemplateRepetition(
        "The policy matters. It shapes the school.\n\nThe routine matters. It shapes the day.\n\nThe message matters. It shapes the class.",
      ),
    ).toBe(false);
    expect(
      avoidsTransitionOpenerOveruse(
        "However the point lands. However the point still lands. However the point keeps landing. The rest of the paragraph stays simple.",
      ),
    ).toBe(false);
  });

  it("requires stronger rewriting at higher rewrite strengths", () => {
    const original =
      "Students should revise carefully before submitting their essays. Clear writing helps readers follow the main point.\n\nTeachers often value specific examples and strong evidence in each paragraph.";
    const tooClose =
      "Students should revise carefully before turning in their essays. Clear writing helps readers follow the main point.\n\nTeachers often value specific examples and strong evidence in each paragraph.";
    const rewritten =
      "Before handing in an essay, students should take time to revise it with care. When the writing stays clear, readers can track the main idea without getting lost.\n\nIn most classrooms, teachers respond best when each paragraph uses concrete examples and solid support.";

    expect(hasEnoughSentenceLevelRewriting(original, tooClose, 85)).toBe(false);
    expect(hasEnoughParagraphLevelRewriting(original, tooClose, 85)).toBe(false);
    expect(hasEnoughSentenceLevelRewriting(original, rewritten, 85)).toBe(true);
    expect(hasEnoughParagraphLevelRewriting(original, rewritten, 85)).toBe(true);
  });
});

describe("rewrite validation", () => {
  const request: HumanizeRequest = {
    text: "Students should revise carefully (Smith, 2023).\n\nClear writing helps readers.",
    protectedTerms: ["Clear writing"],
    tone: "formal",
    gradeLevel: "high_school",
    wordDelta: 12,
    humanLikeLevel: 70,
  };

  it("accepts a compliant rewrite", () => {
    const output =
      "Students should revise with care (Smith, 2023).\n\nClear writing helps readers stay focused while the message remains easy to follow.";

    expect(validateRewrite(request, output)).toEqual({
      isValid: true,
      violations: [],
    });

    expect(buildConstraintReport(request, output)).toEqual({
      paragraphCountMatched: true,
      citationsPreserved: true,
      protectedTermsPreserved: true,
      wordRangeMatched: true,
      readabilityMatched: true,
      naturalnessScore: expect.any(Number),
      sentenceLengthCV: expect.any(Number),
      contentFunctionRatio: expect.any(Number),
      shortSentencePercent: expect.any(Number),
      longSentencePercent: expect.any(Number),
      medianConsecutiveDiff: expect.any(Number),
      paragraphLengthCV: expect.any(Number),
      unmetConstraints: [],
    });
  });

  it("flags broken constraints", () => {
    const output =
      "Students should revise with care.\nClear prose helps readers.\nA third paragraph appears here.";
    const result = validateRewrite(request, output);

    expect(result.isValid).toBe(false);
    expect(result.violations).toContain("Paragraph count changed from the original essay.");
    expect(result.violations).toContain("At least one citation was changed or removed.");
    expect(result.violations).toContain("One or more protected words or phrases were changed.");
  });
});

describe("config handling", () => {
  it("returns a structured setup status when OpenAI is missing", () => {
    const previous = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;

    expect(() => getHumanizerConfig()).toThrowError(HumanizerError);
    expect(getHumanizerStatus()).toEqual({
      aiConfigured: false,
      errorCode: "MODEL_NOT_CONFIGURED",
      setupMessage:
        "Create .env.local, add OPENAI_API_KEY=..., optionally add OPENAI_MODEL=..., then restart npm run dev.",
    });

    if (previous) {
      process.env.OPENAI_API_KEY = previous;
    }
  });

  it("returns configured status when the key exists", () => {
    const previous = process.env.OPENAI_API_KEY;
    const previousModel = process.env.OPENAI_MODEL;

    process.env.OPENAI_API_KEY = "test-key";
    process.env.OPENAI_MODEL = "test-model";

    expect(getHumanizerStatus()).toEqual({
      aiConfigured: true,
      modelName: "test-model",
    });

    if (previous) {
      process.env.OPENAI_API_KEY = previous;
    } else {
      delete process.env.OPENAI_API_KEY;
    }

    if (previousModel) {
      process.env.OPENAI_MODEL = previousModel;
    } else {
      delete process.env.OPENAI_MODEL;
    }
  });
});

describe("prompt design", () => {
  it("includes all guardrails and response tags", () => {
    const request: HumanizeRequest = {
      text: "First paragraph.\n\nSecond paragraph.",
      protectedTerms: ["three prongs"],
      tone: "formal",
      gradeLevel: "college",
      wordDelta: 20,
      humanLikeLevel: 85,
    };

    const prompt = buildHumanizerPrompt(request, request.text, ["__CITATION_0__"], 1, 7);

    expect(prompt).toContain("three prongs");
    expect(prompt).toContain("__CITATION_0__");
    expect(prompt).toContain("<rewritten_essay>");
    expect(prompt).toContain("<self_check>");
    expect(prompt).toContain("85/100");
    expect(prompt).toContain("Every pass should STAY CONSISTENT");
    expect(prompt).toContain("Research-informed guidance:");
    expect(prompt).toContain("Statistical naturalness targets:");
    expect(prompt).toContain("Vocabulary-diversification rule:");
    expect(prompt).toContain("Paragraph-level rewrite rule:");
    expect(prompt).toContain("Rewrite-distance target:");
    expect(prompt).toContain("Model-fingerprint mitigation:");
    expect(prompt).toContain("Entropy injection:");
    expect(prompt).toContain("Controlled imperfection:");
    expect(prompt).toContain('Avoid these vocabulary verbs: "delve", "underscore", "showcase"');
    expect(prompt).toContain("STEP 0 — WORD BUDGET PLAN");
    expect(prompt).toContain("PASS 1 — STRUCTURAL OVERHAUL:");
    expect(prompt).toContain("PASS 2 — VOCABULARY AND TRANSITIONS:");
    expect(prompt).toContain("PASS 3 — RHYTHM, BURSTINESS, AND FINAL POLISH:");
    expect(prompt).toContain("FORMAL-REGISTER NATURALNESS OVERRIDES");
    expect(prompt).toContain("Sentence length: target a mean of 18-22 words with standard deviation of 8-12 words PER PARAGRAPH.");
    expect(prompt).toContain("Sentence-length coefficient of variation (stddev / mean) must be >= 0.40 per paragraph.");
    expect(prompt).toContain("Transition word density must not exceed 3% of total word count.");
    expect(prompt).toContain("Paragraph-level paraphrasing changes discourse-level patterns more effectively than sentence-by-sentence editing.");
    expect(prompt).toContain("Per-paragraph word budget");
    expect(prompt).toContain("Paragraph 1: ~2 words");
    expect(prompt).toContain("Paragraph 2: ~2 words");
    expect(prompt).toContain("The essay has exactly 2 paragraphs.");
    expect(prompt).toContain("<p1>[paragraph 1 text]</p1>");
    expect(prompt).toContain("<p2>[paragraph 2 text]</p2>");
    expect(prompt).toContain("less common vocabulary");
    expect(prompt).toContain('Do not use three or more parallel items in the same grammatical form ("X, Y, and Z" triads) more than once per 500 words.');
    expect(prompt).toContain('Do not write sentences that all land at 15-20 words');
    expect(prompt).toContain('Do not use "From X to Y" overview constructions');
    expect(prompt).toContain("median word-count difference between consecutive sentences must be >= 6 words");
    expect(prompt).toContain("CRITICAL HARD CONSTRAINT: The final output MUST be between");
    expect(prompt).toContain("Do not start every paragraph with a topic sentence");
    expect(prompt).toContain("No transition word may be used as a sentence opener more than twice in the entire essay.");
    expect(prompt).toContain("Output only the final version from PASS 3");
  });

  it("changes intensity guidance clearly across rewrite-strength settings", () => {
    const lowPrompt = buildHumanizerPrompt(
      {
        text: "One paragraph only.",
        protectedTerms: [],
        tone: "formal",
        gradeLevel: "college",
        wordDelta: 20,
        humanLikeLevel: 0,
      },
      "One paragraph only.",
      [],
      1,
      2,
    );

    const strongPrompt = buildHumanizerPrompt(
      {
        text: "One paragraph only.",
        protectedTerms: [],
        tone: "formal",
        gradeLevel: "college",
        wordDelta: 20,
        humanLikeLevel: 70,
      },
      "One paragraph only.",
      [],
      1,
      6,
    );

    const veryStrongPrompt = buildHumanizerPrompt(
      {
        text: "One paragraph only.",
        protectedTerms: [],
        tone: "formal",
        gradeLevel: "college",
        wordDelta: 20,
        humanLikeLevel: 85,
      },
      "One paragraph only.",
      [],
      1,
      7,
    );

    const highPrompt = buildHumanizerPrompt(
      {
        text: "One paragraph only.",
        protectedTerms: [],
        tone: "formal",
        gradeLevel: "college",
        wordDelta: 20,
        humanLikeLevel: 100,
      },
      "One paragraph only.",
      [],
      1,
      8,
    );

    expect(lowPrompt).toContain("0/100");
    expect(lowPrompt).toContain("minimal");
    expect(lowPrompt).toContain("Keep the rewrite very close to the original.");
    expect(strongPrompt).toContain("70/100");
    expect(strongPrompt).toContain("strong");
    expect(strongPrompt).toContain("start pushing statistical naturalness too");
    expect(strongPrompt).toContain("reduce repeated structural templates");
    expect(veryStrongPrompt).toContain("85/100");
    expect(veryStrongPrompt).toContain("very strong");
    expect(veryStrongPrompt).toContain("focus on statistical naturalness");
    expect(veryStrongPrompt).toContain("include occasional unexpected structural choices");
    expect(highPrompt).toContain("100/100");
    expect(highPrompt).toContain("maximum");
    expect(highPrompt).toContain("Aim for the maximum rewrite distance");
    expect(highPrompt).toContain("The higher the rewrite-strength setting, the more the result should differ in wording and sentence construction from the source.");
    expect(highPrompt).toContain("maximize statistical naturalness");
    expect(highPrompt).toContain("inject natural imperfections and unexpected structural choices");
  });

  it("does not tell the model to print None provided when no optional guards exist", () => {
    const request: HumanizeRequest = {
      text: "Only one paragraph here.",
      protectedTerms: [],
      tone: "formal",
      gradeLevel: "college",
      wordDelta: 20,
      humanLikeLevel: 85,
    };

    const prompt = buildHumanizerPrompt(request, request.text, [], 1, 7);

    expect(prompt).not.toContain("None provided");
    expect(prompt).toContain("do not insert any placeholder text or mention that none were provided");
  });

  it("builds a paragraph-only prompt with structural rotation", () => {
    const request: HumanizeRequest = {
      text: "First paragraph.\n\nSecond paragraph.",
      protectedTerms: [],
      tone: "formal",
      gradeLevel: "college",
      wordDelta: 20,
      humanLikeLevel: 70,
    };

    const prompt = buildParagraphPrompt(
      request,
      "A paragraph to rewrite.",
      ["__CITATION_0__"],
      1,
      2,
      "The first paragraph ends here.",
    );

    expect(prompt).toContain("paragraph 2 of 2");
    expect(prompt).toContain('The preceding paragraph ends with: "The first paragraph ends here."');
    expect(prompt).toContain("STRUCTURAL DIRECTIVE FOR THIS PARAGRAPH:");
    expect(prompt).toContain("Return ONLY the rewritten paragraph text.");
  });
});
