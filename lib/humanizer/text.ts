import type { GradeLevel } from "@/lib/humanizer/types";

export function normalizeLineEndings(input: string) {
  return input.replace(/\r\n/g, "\n").trim();
}

export function splitParagraphs(input: string) {
  return normalizeLineEndings(input)
    .split(/\n\s*\n/g)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

export function joinParagraphs(paragraphs: string[]) {
  return paragraphs.join("\n\n");
}

export function countWords(input: string) {
  const matches = input.trim().match(/\b[\w'-]+\b/g);
  return matches ? matches.length : 0;
}

export function parseProtectedTerms(input: string) {
  return input
    .split(/\n|,/g)
    .map((term) => term.trim())
    .filter(Boolean);
}

export function escapeRegExp(input: string) {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function countSyllables(word: string) {
  const normalized = word.toLowerCase().replace(/[^a-z]/g, "");

  if (!normalized) {
    return 0;
  }

  if (normalized.length <= 3) {
    return 1;
  }

  const stripped = normalized
    .replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "")
    .replace(/^y/, "");
  const groups = stripped.match(/[aeiouy]{1,2}/g);
  return groups ? groups.length : 1;
}

export function estimateGradeBand(input: string) {
  const words = input.match(/\b[\w'-]+\b/g) ?? [];
  const sentences = input
    .split(/[.!?]+/g)
    .map((part) => part.trim())
    .filter(Boolean);
  const syllables = words.reduce((sum, word) => sum + countSyllables(word), 0);

  if (!words.length || !sentences.length) {
    return "unknown";
  }

  const fleschKincaid =
    0.39 * (words.length / sentences.length) +
    11.8 * (syllables / words.length) -
    15.59;

  if (fleschKincaid < 6) {
    return "middle_school";
  }

  if (fleschKincaid < 10) {
    return "high_school";
  }

  if (fleschKincaid < 14) {
    return "college";
  }

  return "graduate";
}

export function formatGradeLabel(level: GradeLevel) {
  switch (level) {
    case "middle_school":
      return "Middle school";
    case "high_school":
      return "High school";
    case "college":
      return "College";
    case "graduate":
      return "Graduate";
  }
}

export function getSentences(input: string) {
  return normalizeLineEndings(input)
    .split(/(?<=[.!?])\s+/g)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

export function getSentenceOpeners(input: string) {
  return getSentences(input)
    .map((sentence) => sentence.match(/\b[\w'-]+\b/i)?.[0]?.toLowerCase() ?? "")
    .filter(Boolean);
}

export function getSentenceLengths(input: string) {
  return getSentences(input).map((sentence) => countWords(sentence));
}
