/**
 * detector.ts — Surrogate AI-detection scorer
 *
 * Implements a local approximation of the statistical signals that GPTZero
 * (7-component ensemble) and Originality.ai (ELECTRA discriminator) use.
 *
 * The score ranges from 0 (certainly AI) to 100 (certainly human).
 * Candidates with higher scores are preferred during multi-candidate selection.
 *
 * Signals measured (per NeurIPS 2025 / EMNLP 2025 / PAN@CLEF 2025 research):
 *   1. Sentence-length CV (burstiness proxy)          — weight 20
 *   2. Vocabulary diversity / hapax legomena ratio    — weight 15
 *   3. Surprisal-variance proxy (word rarity spread)  — weight 15
 *   4. Transition density                             — weight 10
 *   5. Content-to-function word ratio                 — weight 10
 *   6. Sentence opener repetition                     — weight 10
 *   7. Paragraph-length uniformity                    — weight 10
 *   8. Consecutive sentence-length monotony           — weight 10
 */

import {
  computeSentenceLengthCV,
  countWords,
  getConsecutiveSentenceLengthDiffs,
  getSentenceLengths,
  getSentenceOpeners,
  splitParagraphs,
} from "@/lib/humanizer/text";

const COMMON_FUNCTION_WORDS = new Set([
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

const FORMAL_TRANSITIONS = new Set([
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

function scoreBurstiness(text: string): number {
  const cv = computeSentenceLengthCV(text);
  if (cv >= 0.55) return 20;
  if (cv >= 0.45) return 17;
  if (cv >= 0.4) return 14;
  if (cv >= 0.35) return 10;
  if (cv >= 0.3) return 6;
  if (cv >= 0.25) return 3;
  return 0;
}

function scoreVocabularyDiversity(text: string): number {
  const words = text.toLowerCase().match(/\b[a-z][a-z'-]*\b/g) ?? [];
  if (words.length < 30) return 10;

  const freq = new Map<string, number>();
  for (const word of words) {
    freq.set(word, (freq.get(word) ?? 0) + 1);
  }

  const uniqueCount = freq.size;
  const ttr = uniqueCount / words.length;

  let hapax = 0;
  for (const count of freq.values()) {
    if (count === 1) hapax += 1;
  }
  const hapaxRatio = hapax / uniqueCount;

  let score = 0;
  if (ttr >= 0.6) score += 8;
  else if (ttr >= 0.52) score += 5;
  else if (ttr >= 0.45) score += 2;

  if (hapaxRatio >= 0.55) score += 7;
  else if (hapaxRatio >= 0.48) score += 5;
  else if (hapaxRatio >= 0.4) score += 2;

  return score;
}

function scoreSurprisalVariance(text: string): number {
  const words = text.toLowerCase().match(/\b[a-z][a-z'-]*\b/g) ?? [];
  if (words.length < 30) return 8;

  const contentWords = words.filter((word) => !COMMON_FUNCTION_WORDS.has(word));
  if (contentWords.length < 10) return 5;

  const lengths = contentWords.map((word) => word.length);
  const mean = lengths.reduce((sum, value) => sum + value, 0) / lengths.length;
  const variance = lengths.reduce((sum, value) => sum + (value - mean) ** 2, 0) / lengths.length;
  const stdDev = Math.sqrt(variance);

  const veryShort = contentWords.filter((word) => word.length <= 3).length;
  const veryLong = contentWords.filter((word) => word.length >= 10).length;
  const extremeRatio = (veryShort + veryLong) / contentWords.length;

  let score = 0;
  if (stdDev >= 3) score += 8;
  else if (stdDev >= 2.5) score += 5;
  else if (stdDev >= 2) score += 2;

  if (extremeRatio >= 0.25) score += 7;
  else if (extremeRatio >= 0.15) score += 4;
  else if (extremeRatio >= 0.08) score += 2;

  return score;
}

function scoreTransitionDensity(text: string): number {
  const words = text.toLowerCase().match(/\b[\w'-]+\b/g) ?? [];
  if (words.length === 0) return 10;

  const count = words.filter((word) => FORMAL_TRANSITIONS.has(word)).length;
  const density = count / words.length;

  if (density <= 0.01) return 10;
  if (density <= 0.02) return 8;
  if (density <= 0.03) return 5;
  if (density <= 0.04) return 2;
  return 0;
}

function scoreContentFunctionRatio(text: string): number {
  const words = text.toLowerCase().match(/\b[a-z][a-z'-]*\b/g) ?? [];
  if (words.length < 30) return 7;

  let content = 0;
  let func = 0;
  for (const word of words) {
    if (COMMON_FUNCTION_WORDS.has(word)) func += 1;
    else content += 1;
  }

  const ratio = func > 0 ? content / func : 2;

  if (ratio >= 0.9 && ratio <= 1.15) return 10;
  if (ratio >= 0.85 && ratio <= 1.25) return 7;
  if (ratio >= 0.8 && ratio <= 1.35) return 4;
  return 0;
}

function scoreOpenerDiversity(text: string): number {
  const openers = getSentenceOpeners(text);
  if (openers.length < 5) return 8;

  const counts = new Map<string, number>();
  for (const opener of openers) {
    counts.set(opener, (counts.get(opener) ?? 0) + 1);
  }

  let maxRepeat = 0;
  for (const count of counts.values()) {
    if (count > maxRepeat) maxRepeat = count;
  }

  const repeatRatio = maxRepeat / openers.length;

  if (repeatRatio <= 0.15) return 10;
  if (repeatRatio <= 0.25) return 7;
  if (repeatRatio <= 0.35) return 4;
  return 0;
}

function scoreParagraphVariety(text: string): number {
  const paragraphs = splitParagraphs(text);
  if (paragraphs.length < 3) return 7;

  const lengths = paragraphs.map((paragraph) => countWords(paragraph));
  const mean = lengths.reduce((sum, value) => sum + value, 0) / lengths.length;
  if (mean === 0) return 5;

  const stdDev = Math.sqrt(
    lengths.reduce((sum, value) => sum + (value - mean) ** 2, 0) / lengths.length,
  );
  const cv = stdDev / mean;

  if (cv >= 0.4) return 10;
  if (cv >= 0.3) return 7;
  if (cv >= 0.2) return 4;
  return 0;
}

function scoreConsecutiveVariance(text: string): number {
  const diffs = getConsecutiveSentenceLengthDiffs(text);
  if (diffs.length < 3) return 7;

  const mean = diffs.reduce((sum, value) => sum + value, 0) / diffs.length;
  if (mean >= 8) return 10;
  if (mean >= 6) return 7;
  if (mean >= 4) return 4;
  return 0;
}

export interface DetectionScore {
  humanScore: number;
  components: {
    burstiness: number;
    vocabularyDiversity: number;
    surprisalVariance: number;
    transitionDensity: number;
    contentFunctionRatio: number;
    openerDiversity: number;
    paragraphVariety: number;
    consecutiveVariance: number;
  };
}

export function computeDetectionScore(text: string): DetectionScore {
  const components = {
    burstiness: scoreBurstiness(text),
    vocabularyDiversity: scoreVocabularyDiversity(text),
    surprisalVariance: scoreSurprisalVariance(text),
    transitionDensity: scoreTransitionDensity(text),
    contentFunctionRatio: scoreContentFunctionRatio(text),
    openerDiversity: scoreOpenerDiversity(text),
    paragraphVariety: scoreParagraphVariety(text),
    consecutiveVariance: scoreConsecutiveVariance(text),
  };

  const humanScore =
    components.burstiness +
    components.vocabularyDiversity +
    components.surprisalVariance +
    components.transitionDensity +
    components.contentFunctionRatio +
    components.openerDiversity +
    components.paragraphVariety +
    components.consecutiveVariance;

  return { humanScore, components };
}

export function computeParagraphDetectionScore(paragraph: string): number {
  const lengths = getSentenceLengths(paragraph);
  if (lengths.length < 2) return 50;

  const mean = lengths.reduce((sum, value) => sum + value, 0) / lengths.length;
  const stdDev = Math.sqrt(
    lengths.reduce((sum, value) => sum + (value - mean) ** 2, 0) / lengths.length,
  );
  const cv = mean > 0 ? stdDev / mean : 0;

  let score = 0;

  if (cv >= 0.5) score += 30;
  else if (cv >= 0.4) score += 23;
  else if (cv >= 0.35) score += 16;
  else if (cv >= 0.25) score += 8;

  const hasShort = lengths.some((length) => length <= 8);
  const hasLong = lengths.some((length) => length >= 25);
  if (hasShort && hasLong) score += 20;
  else if (hasShort || hasLong) score += 10;

  const diffs: number[] = [];
  for (let index = 1; index < lengths.length; index += 1) {
    diffs.push(Math.abs(lengths[index] - lengths[index - 1]));
  }
  if (diffs.length > 0) {
    const meanDiff = diffs.reduce((sum, value) => sum + value, 0) / diffs.length;
    if (meanDiff >= 8) score += 20;
    else if (meanDiff >= 5) score += 12;
    else if (meanDiff >= 3) score += 5;
  }

  const words = paragraph.toLowerCase().match(/\b[a-z][a-z'-]*\b/g) ?? [];
  if (words.length >= 15) {
    const unique = new Set(words).size;
    const ttr = unique / words.length;
    if (ttr >= 0.65) score += 15;
    else if (ttr >= 0.55) score += 10;
    else if (ttr >= 0.45) score += 5;
  } else {
    score += 8;
  }

  const openers = getSentenceOpeners(paragraph);
  const uniqueOpeners = new Set(openers).size;
  const openerRatio = openers.length > 0 ? uniqueOpeners / openers.length : 1;
  if (openerRatio >= 0.85) score += 15;
  else if (openerRatio >= 0.65) score += 10;
  else if (openerRatio >= 0.5) score += 5;

  return score;
}
