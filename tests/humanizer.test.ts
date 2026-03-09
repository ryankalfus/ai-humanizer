import { describe, expect, it } from "vitest";
import {
  applyProtectedSpans,
  extractCitations,
  restoreProtectedSpans,
} from "@/lib/humanizer/citations";
import { getHumanizerConfig, getHumanizerStatus } from "@/lib/humanizer/config";
import { HumanizerError } from "@/lib/humanizer/errors";
import { downgradeOverwrittenWords, scoreNaturalness } from "@/lib/humanizer/naturalness";
import { buildHumanizerPrompt } from "@/lib/humanizer/prompt";
import {
  countWords,
  estimateGradeBand,
  getSentenceLengths,
  getSentenceOpeners,
  joinParagraphs,
  parseProtectedTerms,
  splitParagraphs,
} from "@/lib/humanizer/text";
import {
  avoidsAiVocabulary,
  avoidsContrastTemplates,
  avoidsEmDashes,
  avoidsIndirectFraming,
  avoidsRepeatedOpeners,
  buildConstraintReport,
  hasSentenceVariety,
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
    expect(downgradeOverwrittenWords("We will utilize and elucidate the plan.")).toBe(
      "We will use and explain the plan.",
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
    expect(avoidsAiVocabulary("The language stays plain and direct.")).toBe(true);
    expect(avoidsAiVocabulary("The essay uses nuanced and robust language.")).toBe(false);
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
      tone: "academic",
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
    expect(prompt).toContain("Every iteration should STAY CONSISTENT");
    expect(prompt).toContain("a. Create version (a) from the original essay only.");
    expect(prompt).toContain("h. Create version (h) using ONLY version (g).");
    expect(prompt).toContain("i. Create version (i) using ONLY version (h).");
    expect(prompt).toContain("j. Now evaluate ONLY version (i) against all user guardrails");
    expect(prompt).toContain("Do not print steps (a) through (i).");
    expect(prompt).toContain("Output only the final corrected version from step (j)");
  });
});
