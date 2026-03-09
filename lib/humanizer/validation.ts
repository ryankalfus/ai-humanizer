import { extractCitations } from "@/lib/humanizer/citations";
import { scoreNaturalness } from "@/lib/humanizer/naturalness";
import type { GradeLevel, HumanizeRequest, ValidationResult } from "@/lib/humanizer/types";
import { countWords, estimateGradeBand, escapeRegExp, splitParagraphs } from "@/lib/humanizer/text";

const GRADE_RANK: Record<GradeLevel, number> = {
  middle_school: 1,
  high_school: 2,
  college: 3,
  graduate: 4,
};

export function citationsPreserved(original: string, output: string) {
  const citations = extractCitations(original).map((item) => item.original);
  return citations.every((citation) => output.includes(citation));
}

export function protectedTermsPreserved(terms: string[], output: string) {
  return terms.every((term) => {
    const pattern = new RegExp(escapeRegExp(term), "g");
    return pattern.test(output);
  });
}

export function paragraphCountMatched(original: string, output: string) {
  return splitParagraphs(original).length === splitParagraphs(output).length;
}

export function withinWordRange(original: string, output: string, delta: number) {
  const originalWords = countWords(original);
  const outputWords = countWords(output);
  return Math.abs(outputWords - originalWords) <= delta;
}

export function readabilityFitsTarget(target: GradeLevel, output: string) {
  const estimated = estimateGradeBand(output);

  if (estimated === "unknown") {
    return false;
  }

  return Math.abs(GRADE_RANK[estimated as GradeLevel] - GRADE_RANK[target]) <= 1;
}

export function validateRewrite(
  request: HumanizeRequest,
  output: string,
): ValidationResult {
  const violations: string[] = [];

  if (!paragraphCountMatched(request.text, output)) {
    violations.push("Paragraph count changed from the original essay.");
  }

  if (!citationsPreserved(request.text, output)) {
    violations.push("At least one citation was changed or removed.");
  }

  if (!protectedTermsPreserved(request.protectedTerms, output)) {
    violations.push("One or more protected words or phrases were changed.");
  }

  if (!withinWordRange(request.text, output, request.wordDelta)) {
    violations.push("The rewrite is outside the allowed word-count range.");
  }

  if (!readabilityFitsTarget(request.gradeLevel, output)) {
    violations.push("The rewrite does not match the requested writing level closely enough.");
  }

  if (scoreNaturalness(output) < 65) {
    violations.push("The rewrite sounds too forced or overly thesaurus-heavy.");
  }

  return {
    isValid: violations.length === 0,
    violations,
  };
}
