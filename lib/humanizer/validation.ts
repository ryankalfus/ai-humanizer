import { extractCitations } from "@/lib/humanizer/citations";
import { scoreNaturalness } from "@/lib/humanizer/naturalness";
import type {
  ConstraintReport,
  GradeLevel,
  HumanizeRequest,
  ValidationResult,
} from "@/lib/humanizer/types";
import {
  computeSentenceLengthCV,
  countWords,
  estimateGradeBand,
  escapeRegExp,
  getConsecutiveSentenceLengthDiffs,
  getSentenceLengths,
  getSentenceOpeners,
  getSentences,
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

const TRANSITION_WORDS = new Set([
  "furthermore",
  "moreover",
  "additionally",
  "consequently",
  "therefore",
  "however",
  "nevertheless",
  "nonetheless",
  "subsequently",
  "accordingly",
  "hence",
  "thus",
  "meanwhile",
  "conversely",
  "similarly",
  "likewise",
]);

const FUNCTION_WORDS = new Set([
  "a",
  "an",
  "the",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "have",
  "has",
  "had",
  "do",
  "does",
  "did",
  "will",
  "would",
  "shall",
  "should",
  "may",
  "might",
  "must",
  "can",
  "could",
  "to",
  "of",
  "in",
  "for",
  "on",
  "with",
  "at",
  "by",
  "from",
  "as",
  "into",
  "through",
  "during",
  "before",
  "after",
  "above",
  "below",
  "between",
  "out",
  "off",
  "over",
  "under",
  "again",
  "further",
  "then",
  "once",
  "here",
  "there",
  "when",
  "where",
  "why",
  "how",
  "all",
  "each",
  "every",
  "both",
  "few",
  "more",
  "most",
  "other",
  "some",
  "such",
  "no",
  "not",
  "only",
  "own",
  "same",
  "so",
  "than",
  "too",
  "very",
  "just",
  "because",
  "if",
  "or",
  "and",
  "but",
  "nor",
  "yet",
  "this",
  "that",
  "these",
  "those",
  "it",
  "its",
  "he",
  "she",
  "they",
  "them",
  "their",
  "we",
  "our",
  "you",
  "your",
  "i",
  "me",
  "my",
  "which",
  "who",
  "whom",
  "what",
]);

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
  /\ba\s+testament\s+to\b/i,
  /\bthe\s+landscape\s+of\b/i,
  /\bpaving\s+the\s+way\b/i,
  /\bharness\s+the\s+power\b/i,
  /\bgain\s+a\s+comprehensive\b/i,
  /\bprovide\s+a\s+valuable\s+insight\b/i,
  /\bleft\s+an\s+indelible\s+mark\b/i,
  /\bin\s+a\s+world\s+(of|where)\b/i,
];

const BANNED_AI_VOCABULARY = [
  "delve",
  "underscore",
  "showcase",
  "illuminate",
  "elucidate",
  "foster",
  "harness",
  "intertwine",
  "reimagine",
  "revolutionize",
  "transcend",
  "unleash",
  "unlock",
  "unravel",
  "weave",
  "embark",
  "craft",
  "navigate",
  "leverage",
  "commendable",
  "meticulous",
  "multifaceted",
  "pivotal",
  "nuanced",
  "indelible",
  "invaluable",
  "groundbreaking",
  "exemplary",
  "cutting-edge",
  "remarkable",
  "intricate",
  "robust",
  "seamless",
  "comprehensive",
  "transformative",
  "paramount",
  "seamlessly",
  "meticulously",
  "intricately",
  "profoundly",
  "pivotally",
  "relentlessly",
  "tirelessly",
  "vibrantly",
  "tapestry",
  "realm",
  "landscape",
  "facet",
  "interplay",
  "kaleidoscope",
  "symphony",
  "testament",
  "paradigm",
  "roadmap",
  "toolkit",
  "quest",
  "journey",
];

const GENERIC_VERBS = ["shows", "seems", "feels", "gives", "makes", "gets", "does", "says"];
const STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "but",
  "by",
  "for",
  "from",
  "has",
  "have",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "that",
  "the",
  "their",
  "this",
  "to",
  "was",
  "were",
  "will",
  "with",
]);

function normalizeComparisonWords(input: string) {
  return (input.toLowerCase().match(/\b[a-z][a-z'-]*\b/g) ?? []).filter(
    (word) => !STOPWORDS.has(word),
  );
}

function jaccardSimilarity(left: string[], right: string[]) {
  if (!left.length || !right.length) {
    return 0;
  }

  const leftSet = new Set(left);
  const rightSet = new Set(right);
  const shared = [...leftSet].filter((word) => rightSet.has(word)).length;
  const total = new Set([...leftSet, ...rightSet]).size;

  return total ? shared / total : 0;
}

function computeContentFunctionRatio(output: string) {
  const words = output.toLowerCase().match(/\b[a-z][a-z'-]*\b/g) ?? [];

  if (words.length === 0) {
    return 0;
  }

  let contentCount = 0;
  let functionCount = 0;

  for (const word of words) {
    if (FUNCTION_WORDS.has(word)) {
      functionCount += 1;
    } else {
      contentCount += 1;
    }
  }

  return functionCount > 0 ? contentCount / functionCount : 2;
}

function computeShortLongSentencePercents(output: string) {
  const lengths = getSentenceLengths(output);
  const total = lengths.length;

  if (total === 0) {
    return { shortSentencePercent: 0, longSentencePercent: 0 };
  }

  return {
    shortSentencePercent: lengths.filter((length) => length < 10).length / total,
    longSentencePercent: lengths.filter((length) => length > 25).length / total,
  };
}

function computeMedianConsecutiveDiff(output: string) {
  const diffs = getConsecutiveSentenceLengthDiffs(output).sort((left, right) => left - right);

  if (!diffs.length) {
    return 0;
  }

  return diffs[Math.floor(diffs.length / 2)];
}

function computeParagraphLengthCV(output: string) {
  const paragraphs = splitParagraphs(output);

  if (paragraphs.length < 2) {
    return 0;
  }

  const lengths = paragraphs.map((paragraph) => countWords(paragraph));
  const mean = lengths.reduce((sum, length) => sum + length, 0) / lengths.length;

  if (mean === 0) {
    return 0;
  }

  const stdDev = Math.sqrt(
    lengths.reduce((sum, length) => sum + (length - mean) ** 2, 0) / lengths.length,
  );

  return stdDev / mean;
}

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

export function hasSufficientBurstiness(output: string) {
  const lengths = getSentenceLengths(output);

  if (lengths.length < 5) {
    return true;
  }

  const mean = lengths.reduce((sum, value) => sum + value, 0) / lengths.length;

  if (mean === 0) {
    return true;
  }

  const stdDev = Math.sqrt(
    lengths.reduce((sum, value) => sum + (value - mean) ** 2, 0) / lengths.length,
  );
  const cv = stdDev / mean;

  return cv >= 0.4;
}

export function hasPerParagraphBurstiness(output: string) {
  const paragraphs = splitParagraphs(output);

  for (const paragraph of paragraphs) {
    const lens = getSentenceLengths(paragraph);

    if (lens.length < 3) {
      continue;
    }

    const mean = lens.reduce((sum, length) => sum + length, 0) / lens.length;

    if (mean === 0) {
      continue;
    }

    const stdDev = Math.sqrt(
      lens.reduce((sum, length) => sum + (length - mean) ** 2, 0) / lens.length,
    );
    const cv = stdDev / mean;

    if (cv < 0.3) {
      return false;
    }

    const allSimilar = lens.every((length) => Math.abs(length - mean) <= 5);

    if (allSimilar) {
      return false;
    }

    // Within each paragraph, check for runs of 3+ similar-length sentences
    for (let j = 0; j <= lens.length - 3; j++) {
      const a = lens[j], b = lens[j+1], c = lens[j+2];
      if (Math.abs(a - b) <= 4 && Math.abs(b - c) <= 4 && Math.abs(a - c) <= 4) {
        return false;  // Run of 3 uniform sentences within a paragraph
      }
    }

    // Check for monotone increasing or decreasing runs of 4+
    if (lens.length >= 4) {
      let increasing = true;
      let decreasing = true;
      for (let j = 0; j < lens.length - 1; j++) {
        if (lens[j+1] <= lens[j]) increasing = false;
        if (lens[j+1] >= lens[j]) decreasing = false;
      }
      if (increasing || decreasing) return false;  // Monotone ramp
    }
  }

  return true;
}

export function hasConsecutiveSentenceVariance(output: string) {
  const lengths = getSentenceLengths(output);

  if (lengths.length < 4) {
    return true;
  }

  for (let index = 0; index <= lengths.length - 3; index += 1) {
    const a = lengths[index];
    const b = lengths[index + 1];
    const c = lengths[index + 2];

    if (Math.abs(a - b) <= 5 && Math.abs(b - c) <= 5 && Math.abs(a - c) <= 5) {
      return false;
    }
  }

  const median = computeMedianConsecutiveDiff(output);
  return median >= 5;
}

export function hasAcceptableContentFunctionRatio(output: string) {
  const words = output.toLowerCase().match(/\b[a-z][a-z'-]*\b/g) ?? [];

  if (words.length < 50) {
    return true;
  }

  return computeContentFunctionRatio(output) <= 1.25;
}

export function hasShortAndLongSentences(output: string) {
  const lengths = getSentenceLengths(output);

  if (lengths.length < 5) {
    return true;
  }

  const shortCount = lengths.filter((length) => length < 10).length;
  const longCount = lengths.filter((length) => length > 25).length;
  const total = lengths.length;

  return shortCount / total >= 0.15 && longCount / total >= 0.10;
}

export function hasParagraphLengthVariety(output: string) {
  const paragraphs = splitParagraphs(output);
  if (paragraphs.length < 3) return true;
  
  const lengths = paragraphs.map(p => countWords(p));
  const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  if (mean === 0) return true;
  
  const stdDev = Math.sqrt(
    lengths.reduce((sum, l) => sum + (l - mean) ** 2, 0) / lengths.length
  );
  const cv = stdDev / mean;
  
  return cv >= 0.20;  // Minimum 20% CV for paragraph lengths
}

export function avoidsExcessiveTriadicLists(output: string) {
  // Match patterns like "X, Y, and Z" — three items in parallel
  const triadics = output.match(/\b\w+(?:\s+\w+)*,\s+\w+(?:\s+\w+)*,\s+and\s+\w+/g) ?? [];
  const totalWords = countWords(output);
  const maxAllowed = Math.max(1, Math.floor(totalWords / 500));
  
  return triadics.length <= maxAllowed;
}

export function avoidsParticipalOveruse(output: string) {
  const matches = output.match(/,\s*\w+ing\b/g) ?? [];
  const totalWords = countWords(output);
  const maxAllowed = Math.max(2, Math.floor(totalWords / 300));
  return matches.length <= maxAllowed;
}

export function avoidsParagraphTemplateRepetition(output: string) {
  const paragraphs = splitParagraphs(output);

  if (paragraphs.length < 3) {
    return true;
  }

  const patterns = paragraphs.map((paragraph) => {
    const firstSentence = getSentences(paragraph)[0] ?? "";

    if (/^(while|although|though|when|if|since|because|as)\b/i.test(firstSentence)) {
      return "subordinate";
    }

    if (
      /^(furthermore|moreover|additionally|however|therefore|consequently)\b/i.test(
        firstSentence,
      )
    ) {
      return "transition";
    }

    if (/^(the|a|an|this|these|that|those)\b/i.test(firstSentence)) {
      return "article";
    }

    if (/^(it|there)\b/i.test(firstSentence)) {
      return "expletive";
    }

    return "other";
  });

  for (let index = 0; index < patterns.length - 2; index += 1) {
    if (
      patterns[index] === patterns[index + 1] &&
      patterns[index + 1] === patterns[index + 2]
    ) {
      return false;
    }
  }

  return true;
}

export function avoidsTransitionOpenerOveruse(output: string) {
  const sentences = getSentences(output);
  let transitionOpenerCount = 0;

  for (const sentence of sentences) {
    const firstWord = (sentence.match(/\b[\w'-]+\b/i)?.[0] ?? "").toLowerCase();

    if (TRANSITION_WORDS.has(firstWord)) {
      transitionOpenerCount += 1;
    }
  }

  const totalWords = countWords(output);
  const maxAllowed = Math.max(2, Math.floor(totalWords / 500) * 2);

  return transitionOpenerCount <= maxAllowed;
}

export function avoidsRepeatedOpeners(output: string) {
  const openers = getSentenceOpeners(output);
  const counts = new Map<string, number>();

  for (const opener of openers) {
    counts.set(opener, (counts.get(opener) ?? 0) + 1);
  }

  const totalSentences = openers.length;
  // No opener should appear more than 10% of the time or more than 2 times, whichever is higher
  const maxAllowed = Math.max(2, Math.floor(totalSentences * 0.10));
  
  return [...counts.values()].every((count) => count <= maxAllowed);
}

export function avoidsFormulaicTransitions(output: string) {
  const lower = output.toLowerCase();

  return TRANSITION_PATTERNS.every(
    (phrase) =>
      (lower.match(new RegExp(`\\b${escapeRegExp(phrase)}\\b`, "g"))?.length ?? 0) < 2,
  );
}

export function hasAcceptableTransitionDensity(output: string) {
  const words = output.toLowerCase().match(/\b[\w'-]+\b/g) ?? [];
  const transitionCount = words.filter((word) => TRANSITION_WORDS.has(word)).length;

  return words.length === 0 || transitionCount / words.length < 0.03;
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
    (word) => !new RegExp(`\\b${escapeRegExp(word)}\\b`, "i").test(lower),
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

export function hasEnoughSentenceLevelRewriting(original: string, output: string, level: number) {
  if (level < 55) {
    return true;
  }

  const originalSentences = original
    .split(/(?<=[.!?])\s+/g)
    .map((sentence) => normalizeComparisonWords(sentence))
    .filter((sentence) => sentence.length >= 4);
  const outputSentences = output
    .split(/(?<=[.!?])\s+/g)
    .map((sentence) => normalizeComparisonWords(sentence))
    .filter((sentence) => sentence.length >= 4);

  if (!originalSentences.length || !outputSentences.length) {
    return true;
  }

  let exactMatches = 0;
  let highestAverage = 0;

  for (const sentence of outputSentences) {
    let best = 0;

    for (const sourceSentence of originalSentences) {
      const similarity = jaccardSimilarity(sentence, sourceSentence);
      best = Math.max(best, similarity);

      if (similarity === 1) {
        exactMatches += 1;
      }
    }

    highestAverage += best;
  }

  const averageSimilarity = highestAverage / outputSentences.length;

  if (level >= 85) {
    return exactMatches === 0 && averageSimilarity < 0.72;
  }

  if (level >= 70) {
    return exactMatches === 0 && averageSimilarity < 0.8;
  }

  return averageSimilarity < 0.86;
}

export function hasEnoughParagraphLevelRewriting(original: string, output: string, level: number) {
  if (level < 70) {
    return true;
  }

  const originalParagraphs = splitParagraphs(original).map(normalizeComparisonWords);
  const outputParagraphs = splitParagraphs(output).map(normalizeComparisonWords);

  if (originalParagraphs.length !== outputParagraphs.length || !originalParagraphs.length) {
    return true;
  }

  const threshold = level >= 90 ? 0.74 : level >= 80 ? 0.8 : 0.86;

  return outputParagraphs.every((paragraph, index) => {
    const similarity = jaccardSimilarity(paragraph, originalParagraphs[index] ?? []);
    return similarity < threshold;
  });
}

function getNaturalnessThreshold(target: GradeLevel) {
  switch (target) {
    case "middle_school":
      return 65;
    case "high_school":
      return 63;
    case "college":
      return 58;
    case "graduate":
      return 54;
  }
}

export function buildConstraintReport(
  request: HumanizeRequest,
  output: string,
): ConstraintReport {
  const sentenceLengthCV = computeSentenceLengthCV(output);
  const contentFunctionRatio = computeContentFunctionRatio(output);
  const { shortSentencePercent, longSentencePercent } = computeShortLongSentencePercents(output);
  const medianConsecutiveDiff = computeMedianConsecutiveDiff(output);
  const paragraphLengthCV = computeParagraphLengthCV(output);
  const report: ConstraintReport = {
    paragraphCountMatched: paragraphCountMatched(request.text, output),
    citationsPreserved: citationsPreserved(request.text, output),
    protectedTermsPreserved: protectedTermsPreserved(request.protectedTerms, output),
    wordRangeMatched: withinWordRange(request.text, output, request.wordDelta),
    readabilityMatched: readabilityFitsTarget(request.gradeLevel, output),
    naturalnessScore: scoreNaturalness(output),
    sentenceLengthCV,
    contentFunctionRatio,
    shortSentencePercent,
    longSentencePercent,
    medianConsecutiveDiff,
    paragraphLengthCV,
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
    report.unmetConstraints.push(
      "The rewrite does not match the requested writing level closely enough.",
    );
  }

  if (!avoidsRepeatedOpeners(output)) {
    report.unmetConstraints.push("Too many sentences start the same way.");
  }

  if (!hasSentenceVariety(output)) {
    report.unmetConstraints.push("Sentence lengths are too uniform.");
  }

  if (!hasSufficientBurstiness(output)) {
    report.unmetConstraints.push(
      "Sentence lengths are too uniform — need more variation between short and long sentences.",
    );
  }

  if (!hasParagraphLengthVariety(output)) {
    report.unmetConstraints.push(
      "Paragraph lengths are too uniform — redistribute words so some paragraphs are noticeably shorter and others noticeably longer.",
    );
  }

  if (!hasPerParagraphBurstiness(output)) {
    report.unmetConstraints.push(
      "At least one paragraph has sentences that are too uniform in length — need more short and long sentences within each paragraph.",
    );
  }

  if (!hasConsecutiveSentenceVariance(output)) {
    report.unmetConstraints.push(
      "Three or more consecutive sentences have similar word counts — break the rhythm by inserting a very short sentence (under 8 words) or a very long sentence (over 30 words) between similar-length sentences.",
    );
  }

  if (!avoidsFormulaicTransitions(output)) {
    report.unmetConstraints.push("The rewrite leans too hard on formulaic transitions.");
  }

  if (!hasAcceptableTransitionDensity(output)) {
    report.unmetConstraints.push(
      "Too many formal transition words — reduce transition density to feel more natural.",
    );
  }

  if (!hasAcceptableContentFunctionRatio(output)) {
    report.unmetConstraints.push(
      "The prose is too content-word-heavy (ratio above 1.25). Add natural hedges, qualifiers, epistemic markers, and connective function words to bring the ratio closer to 1.0.",
    );
  }

  if (!hasShortAndLongSentences(output)) {
    report.unmetConstraints.push(
      "Not enough very short sentences (under 10 words) or very long sentences (over 25 words) — need more sentence-length extremes.",
    );
  }

  if (!avoidsExcessiveTriadicLists(output)) {
    report.unmetConstraints.push(
      "Too many triadic parallel lists (X, Y, and Z). Maximum 1 per 500 words. Break lists across sentences or use different grammatical structures.",
    );
  }

  if (!avoidsParticipalOveruse(output)) {
    report.unmetConstraints.push(
      "Too many present participial phrases (comma + -ing verb). Maximum 1 per 300 words. Restructure some as separate sentences or use different clause types.",
    );
  }

  if (!avoidsParagraphTemplateRepetition(output)) {
    report.unmetConstraints.push(
      "Multiple consecutive paragraphs open with the same syntactic pattern — vary paragraph openings.",
    );
  }

  if (!avoidsTransitionOpenerOveruse(output)) {
    report.unmetConstraints.push(
      "Too many sentences begin with formal transition words — reduce transition-as-opener frequency.",
    );
  }

  if (!avoidsEmDashes(output)) {
    report.unmetConstraints.push("The rewrite still uses em dashes.");
  }

  if (!avoidsContrastTemplates(output)) {
    report.unmetConstraints.push("The rewrite still uses contrast-template phrasing.");
  }

  if (!avoidsIndirectFraming(output)) {
    report.unmetConstraints.push(
      "The rewrite still uses indirect framing or stock lead-in phrases.",
    );
  }

  if (!avoidsAiVocabulary(output)) {
    report.unmetConstraints.push(
      "The rewrite still uses overly AI-coded or technical stock vocabulary.",
    );
  }

  if (!avoidsRepeatedGenericVerbs(output)) {
    report.unmetConstraints.push(
      "The rewrite repeats too many generic verbs and weak sentence patterns.",
    );
  }

  if (!avoidsAbstractNounClusters(output)) {
    report.unmetConstraints.push("The rewrite still leans on stacked abstract noun clusters.");
  }

  if (!hasEnoughLexicalVariety(output, request.humanLikeLevel)) {
    report.unmetConstraints.push(
      "The rewrite does not vary its wording enough for the selected rewrite strength.",
    );
  }

  if (!hasEnoughSentenceLevelRewriting(request.text, output, request.humanLikeLevel)) {
    report.unmetConstraints.push(
      "Too many sentences still stay too close to the source for the selected rewrite strength.",
    );
  }

  if (!hasEnoughParagraphLevelRewriting(request.text, output, request.humanLikeLevel)) {
    report.unmetConstraints.push(
      "The paragraph-level rewrite still mirrors the source too closely for the selected rewrite strength.",
    );
  }

  if (!staysWithinExpectedDiction(request.gradeLevel, output)) {
    report.unmetConstraints.push(
      "The rewrite uses vocabulary that is too advanced for the selected writing level.",
    );
  }

  if (report.naturalnessScore < getNaturalnessThreshold(request.gradeLevel)) {
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
