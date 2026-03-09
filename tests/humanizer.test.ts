import { describe, expect, it } from "vitest";
import { extractCitations, applyProtectedSpans, restoreProtectedSpans } from "@/lib/humanizer/citations";
import { downgradeOverwrittenWords, scoreNaturalness } from "@/lib/humanizer/naturalness";
import {
  countWords,
  estimateGradeBand,
  joinParagraphs,
  parseProtectedTerms,
  splitParagraphs,
} from "@/lib/humanizer/text";
import { validateRewrite } from "@/lib/humanizer/validation";
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
});

describe("rewrite validation", () => {
  const request: HumanizeRequest = {
    text: "Students should revise carefully (Smith, 2023).\n\nClear writing helps readers.",
    protectedTerms: ["Clear writing"],
    tone: "formal",
    gradeLevel: "high_school",
    wordDelta: 12,
  };

  it("accepts a compliant rewrite", () => {
    const output =
      "Students should revise with care (Smith, 2023).\n\nClear writing helps readers stay focused.";

    expect(validateRewrite(request, output)).toEqual({
      isValid: true,
      violations: [],
    });
  });

  it("flags paragraph changes, citation changes, protected terms, and word range", () => {
    const output =
      "Students should revise with care.\nClear prose helps readers.\nA third paragraph appears here.";
    const result = validateRewrite(request, output);

    expect(result.isValid).toBe(false);
    expect(result.violations).toContain("Paragraph count changed from the original essay.");
    expect(result.violations).toContain("At least one citation was changed or removed.");
    expect(result.violations).toContain("One or more protected words or phrases were changed.");
  });
});
