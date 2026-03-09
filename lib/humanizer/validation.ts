import { extractCitations } from "@/lib/humanizer/citations";
import { scoreNaturalness } from "@/lib/humanizer/naturalness";
import type {
  ConstraintReport,
  GradeLevel,
  HumanizeRequest,
  ValidationResult,
} from "@/lib/humanizer/types";
import {
  countWords,
  estimateGradeBand,
  escapeRegExp,
  getSentenceLengths,
  getSentenceOpeners,
  splitParagraphs,
} from "@/lib/humanizer/text";

const GRADE_RANK: Record<GradeLevel, number> = {
  middle_school: 1,
  high_school: 2,
  college: 3,
  graduate: 4,
};

const TRANSITION_PATTERNS = [
  "furthermore",
  "moreover",
  "in conclusion",
  "on the other hand",
  "in addition",
  "therefore",
  "ultimately",
  "additionally",
  "consequently",
  "more specifically",
  "in today's world",
  "in today's landscape",
  "at its core",
];

const BANNED_PHRASE_PATTERNS = [
  /\bultimately,\b/i,
  /\bthe\s+[^.!?\n]{0,40}\s+presents\b/i,
  /\bthis\s+(essay|paper|article|piece|text)\s+(presents|explores|examines|delves into|discusses|highlights)\b/i,
  /\bit\s+is\s+important\s+to\s+note\b/i,
  /\bit\s+can\s+be\s+argued\b/i,
  /\bit\s+is\s+worth\s+noting\b/i,
  /\bone\s+may\s+say\b/i,
  /\bone\s+might\s+argue\b/i,
  /\bthis\s+highlights\b/i,
  /\bthis\s+underscores\b/i,
  /\bplays\s+a\s+crucial\s+role\b/i,
  /\bserves\s+as\s+a\s+testament\s+to\b/i,
  /\bnavigate\s+the\s+complexities\b/i,
  /\ba\s+nuanced\s+understanding\b/i,
  /\bfrom\s+this\s+perspective\b/i,
];

const BANNED_AI_VOCABULARY = [
  "delve",
  "underscore",
  "meticulous",
  "commendable",
  "robust",
  "seamless",
  "pivotal",
  "comprehensive",
  "leverage",
  "intricate",
  "realm",
  "landscape",
  "nuanced",
  "transformative",
  "paramount",
];

const GENERIC_VERBS = ["shows", "seems", "feels", "gives", "makes", "gets", "does", "says"];

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
  return Math.abs(countWords(output) - countWords(original)) <= delta;
}

export function readabilityFitsTarget(target: GradeLevel, output: string) {
  const estimated = estimateGradeBand(output);

  if (estimated === "unknown") {
    return false;
  }

  return Math.abs(GRADE_RANK[estimated as GradeLevel] - GRADE_RANK[target]) <= 1;
}

export function hasSentenceVariety(output: string) {
  const lengths = getSentenceLengths(output);

  if (lengths.length < 3) {
    return true;
  }

  const average = lengths.reduce((sum, value) => sum + value, 0) / lengths.length;
  const variance =
    lengths.reduce((sum, value) => sum + (value - average) ** 2, 0) / lengths.length;

  return variance >= 8;
}

export function avoidsRepeatedOpeners(output: string) {
  const openers = getSentenceOpeners(output);
  const counts = new Map<string, number>();

  for (const opener of openers) {
    counts.set(opener, (counts.get(opener) ?? 0) + 1);
  }

  return [...counts.values()].every((count) => count < 3);
}

export function avoidsFormulaicTransitions(output: string) {
  const lower = output.toLowerCase();
  return TRANSITION_PATTERNS.every((phrase) => (lower.match(new RegExp(`\\b${escapeRegExp(phrase)}\\b`, "g"))?.length ?? 0) < 2);
}

export function avoidsEmDashes(output: string) {
  return !output.includes("—");
}

export function avoidsContrastTemplates(output: string) {
  const lower = output.toLowerCase();
  const broadContrastPattern = /\bnot\b[^.!?\n]{0,80}\bbut\b/;
  const notJustPattern = /\bnot just\b[^.!?\n]{0,80}\bbut\b/;
  return !broadContrastPattern.test(lower) && !notJustPattern.test(lower);
}

export function avoidsIndirectFraming(output: string) {
  return BANNED_PHRASE_PATTERNS.every((pattern) => !pattern.test(output));
}

export function avoidsAiVocabulary(output: string) {
  const lower = output.toLowerCase();
  return BANNED_AI_VOCABULARY.every(
    (word) => !(new RegExp(`\\b${escapeRegExp(word)}\\b`, "i").test(lower)),
  );
}

export function avoidsRepeatedGenericVerbs(output: string) {
  const lower = output.toLowerCase();
  return GENERIC_VERBS.every(
    (word) => (lower.match(new RegExp(`\\b${escapeRegExp(word)}\\b`, "g"))?.length ?? 0) < 3,
  );
}

export function avoidsAbstractNounClusters(output: string) {
  const words = output.toLowerCase().match(/\b[\w'-]+\b/g) ?? [];

  for (let index = 0; index <= words.length - 6; index += 1) {
    const window = words.slice(index, index + 6);
    const abstractCount = window.filter((word) =>
      /(tion|sion|ment|ness|ity|ism|ship)$/.test(word),
    ).length;

    if (abstractCount >= 3) {
      return false;
    }
  }

  return true;
}

export function hasEnoughLexicalVariety(output: string, level: number) {
  const words = output.toLowerCase().match(/\b[a-z][a-z'-]*\b/g) ?? [];

  if (words.length < 60 || level < 70) {
    return true;
  }

  const uniqueRatio = new Set(words).size / words.length;
  return uniqueRatio >= 0.42;
}

export function staysWithinExpectedDiction(target: GradeLevel, output: string) {
  const lower = output.toLowerCase();
  const advancedTerms =
    lower.match(
      /\b(facilitate|ameliorate|juxtaposition|aforementioned|multifaceted|paradigm|quintessential|heretofore|thusly)\b/g,
    )?.length ?? 0;

  if (target === "middle_school") {
    return advancedTerms < 2;
  }

  if (target === "high_school") {
    return advancedTerms < 4;
  }

  return true;
}

export function buildConstraintReport(
  request: HumanizeRequest,
  output: string,
): ConstraintReport {
  const report: ConstraintReport = {
    paragraphCountMatched: paragraphCountMatched(request.text, output),
    citationsPreserved: citationsPreserved(request.text, output),
    protectedTermsPreserved: protectedTermsPreserved(request.protectedTerms, output),
    wordRangeMatched: withinWordRange(request.text, output, request.wordDelta),
    readabilityMatched: readabilityFitsTarget(request.gradeLevel, output),
    naturalnessScore: scoreNaturalness(output),
    unmetConstraints: [],
  };

  if (!report.paragraphCountMatched) {
    report.unmetConstraints.push("Paragraph count changed from the original essay.");
  }

  if (!report.citationsPreserved) {
    report.unmetConstraints.push("At least one citation was changed or removed.");
  }

  if (!report.protectedTermsPreserved) {
    report.unmetConstraints.push("One or more protected words or phrases were changed.");
  }

  if (!report.wordRangeMatched) {
    report.unmetConstraints.push("The rewrite is outside the allowed word-count range.");
  }

  if (!report.readabilityMatched) {
    report.unmetConstraints.push("The rewrite does not match the requested writing level closely enough.");
  }

  if (!avoidsRepeatedOpeners(output)) {
    report.unmetConstraints.push("Too many sentences start the same way.");
  }

  if (!hasSentenceVariety(output)) {
    report.unmetConstraints.push("Sentence lengths are too uniform.");
  }

  if (!avoidsFormulaicTransitions(output)) {
    report.unmetConstraints.push("The rewrite leans too hard on formulaic transitions.");
  }

  if (!avoidsEmDashes(output)) {
    report.unmetConstraints.push("The rewrite still uses em dashes.");
  }

  if (!avoidsContrastTemplates(output)) {
    report.unmetConstraints.push("The rewrite still uses contrast-template phrasing.");
  }

  if (!avoidsIndirectFraming(output)) {
    report.unmetConstraints.push("The rewrite still uses indirect framing or stock lead-in phrases.");
  }

  if (!avoidsAiVocabulary(output)) {
    report.unmetConstraints.push("The rewrite still uses overly AI-coded or technical stock vocabulary.");
  }

  if (!avoidsRepeatedGenericVerbs(output)) {
    report.unmetConstraints.push("The rewrite repeats too many generic verbs and weak sentence patterns.");
  }

  if (!avoidsAbstractNounClusters(output)) {
    report.unmetConstraints.push("The rewrite still leans on stacked abstract noun clusters.");
  }

  if (!hasEnoughLexicalVariety(output, request.humanLikeLevel)) {
    report.unmetConstraints.push("The rewrite does not vary its wording enough for the selected rewrite strength.");
  }

  if (!staysWithinExpectedDiction(request.gradeLevel, output)) {
    report.unmetConstraints.push("The rewrite uses vocabulary that is too advanced for the selected writing level.");
  }

  if (report.naturalnessScore < 65) {
    report.unmetConstraints.push("The rewrite sounds too forced or overly thesaurus-heavy.");
  }

  return report;
}

export function validateRewrite(request: HumanizeRequest, output: string): ValidationResult {
  const report = buildConstraintReport(request, output);

  return {
    isValid: report.unmetConstraints.length === 0,
    violations: report.unmetConstraints,
  };
}
