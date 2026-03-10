import {
  countWords,
  getSentenceLengths,
  getSentenceOpeners,
  getSentences,
  splitParagraphs,
} from "@/lib/humanizer/text";

const OVER_ADVANCED_SWAPS: Record<string, string> = {
  utilize: "use",
  ameliorate: "improve",
  facilitate: "help",
  myriad: "many",
  plethora: "many",
  commence: "start",
  procure: "get",
  elucidate: "explain",
  showcase: "show",
  illuminate: "clarify",
  foster: "encourage",
  harness: "use",
  intertwine: "connect",
  reimagine: "rethink",
  revolutionize: "change",
  transcend: "go beyond",
  unleash: "release",
  unlock: "enable",
  unravel: "explain",
  embark: "start",
  craft: "write",
  navigate: "handle",
  furthermore: "also",
  henceforth: "from now on",
  delve: "go into",
  underscore: "show",
  meticulous: "careful",
  commendable: "good",
  groundbreaking: "new",
  exemplary: "strong",
  remarkable: "notable",
  invaluable: "very useful",
  indelible: "lasting",
  robust: "strong",
  seamless: "smooth",
  pivotal: "key",
  comprehensive: "complete",
  leverage: "use",
  intricate: "complex",
  tapestry: "mix",
  realm: "area",
  landscape: "field",
  facet: "side",
  interplay: "interaction",
  paradigm: "model",
  testament: "proof",
  nuanced: "subtle",
  transformative: "major",
  paramount: "main",
  quintessential: "typical",
  multifaceted: "varied",
  aforementioned: "earlier",
  juxtaposition: "contrast",
  heretofore: "previously",
  thusly: "so",
  underpinning: "basis",
  delineate: "outline",
  burgeoning: "growing",
  ubiquitous: "common",
  exacerbate: "worsen",
  necessitate: "require",
  underpin: "support",
  bolster: "strengthen",
  spearhead: "lead",
  galvanize: "motivate",
  epitomize: "represent",
  juxtapose: "compare",
  synergy: "cooperation",
  holistic: "complete",
  whilst: "while",
};

const FILLER_PHRASES = [
  "plays a crucial role",
  "at its core",
  "in today's world",
  "in today's landscape",
  "it is important to note",
  "it is worth noting",
  "this highlights",
  "this underscores",
  "a testament to",
  "the landscape of",
  "paving the way",
  "harness the power",
  "navigating the complexities",
  "in a world where",
  "gain a comprehensive understanding",
  "provide a valuable insight",
  "play a significant role",
  "serves as a reminder",
  "from this perspective",
  "not only ... but also",
  "left an indelible mark",
  "provide a valuable insight into",
  "gain a comprehensive understanding of",
  "it can be argued",
  "one may say",
  "one might argue",
  "it is crucial to",
  "it is essential to",
  "plays a vital role",
  "in the realm of",
  "serves as a cornerstone",
  "remains a critical",
  "offers a unique perspective",
  "stands as a testament",
  "has garnered significant",
  "continues to evolve",
  "a myriad of",
  "a plethora of",
];

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

function escapeRegExp(input: string) {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildPhrasePattern(phrase: string) {
  if (phrase.includes("...")) {
    const [start, end] = phrase.split("...");
    return new RegExp(`${escapeRegExp(start.trim())}\\s+.*?\\s+${escapeRegExp(end.trim())}`, "g");
  }

  return new RegExp(escapeRegExp(phrase), "g");
}

export function downgradeOverwrittenWords(text: string) {
  let output = text.replace(/—/g, ", ");

  for (const [hardWord, simplerWord] of Object.entries(OVER_ADVANCED_SWAPS)) {
    const pattern = new RegExp(`\\b${hardWord}\\b`, "gi");
    output = output.replace(pattern, simplerWord);
  }

  return output;
}

function reduceParticipialPhraseDensity(text: string) {
  const words = countWords(text);
  const maxAllowed = Math.max(1, Math.floor(words / 300));
  const matches = [...text.matchAll(/,\s+([a-z]+ing\b[^.?!;]*)/gi)];

  if (matches.length <= maxAllowed) {
    return text;
  }

  let output = text;

  for (let index = matches.length - 1; index >= maxAllowed; index -= 1) {
    const match = matches[index];

    if (!match || typeof match.index !== "number") {
      continue;
    }

    const fullMatch = match[0];
    const replacement = ` while ${match[1]}`;
    output =
      output.slice(0, match.index) +
      replacement +
      output.slice(match.index + fullMatch.length);
  }

  return output.replace(/\s{2,}/g, " ");
}

function breakExcessTriadicLists(text: string): string {
  const triadPattern =
    /(\b\w+(?:\s+\w+){0,3}),\s+(\w+(?:\s+\w+){0,3}),\s+and\s+(\w+(?:\s+\w+){0,3})\b/gi;
  const matches = [...text.matchAll(triadPattern)];

  if (matches.length <= 1) {
    return text;
  }

  let output = text;
  for (let index = matches.length - 1; index >= 1; index -= 1) {
    const match = matches[index];

    if (!match || typeof match.index !== "number") {
      continue;
    }

    const replacement = `${match[1]} and ${match[2]}. ${match[3].charAt(0).toUpperCase() + match[3].slice(1)} also`;
    output =
      output.slice(0, match.index) +
      replacement +
      output.slice(match.index + match[0].length);
  }

  return output;
}

function reduceTransitionStacking(text: string): string {
  let output = text;

  output = output.replace(
    /\b(Furthermore|Moreover|Additionally|Consequently|Therefore|However|Nevertheless|Nonetheless|Subsequently|Accordingly|Hence|Thus|Meanwhile|Conversely|Similarly|Likewise),\s*(furthermore|moreover|additionally|consequently|therefore|however|nevertheless|nonetheless|subsequently|accordingly|hence|thus|meanwhile|conversely|similarly|likewise),?\s*/gi,
    "$1, ",
  );

  const paragraphs = splitParagraphs(output);
  const fixedParagraphs = paragraphs.map((paragraph) => {
    const sentences = getSentences(paragraph);

    if (sentences.length < 3) {
      return paragraph;
    }

    const transitionPattern =
      /^(Furthermore|Moreover|Additionally|Consequently|Therefore|However|Nevertheless|Nonetheless|Subsequently|Accordingly|Hence|Thus|Meanwhile|Conversely|Similarly|Likewise),?\s+/i;

    let consecutiveTransitions = 0;
    const fixed = sentences.map((sentence) => {
      if (transitionPattern.test(sentence)) {
        consecutiveTransitions += 1;

        if (consecutiveTransitions >= 2) {
          return sentence.replace(transitionPattern, "");
        }
      } else {
        consecutiveTransitions = 0;
      }

      return sentence;
    });

    return fixed.join(" ");
  });

  return fixedParagraphs.join("\n\n");
}

export function cleanupSurfacePatterns(text: string) {
  let output = text
    .replace(/—/g, ", ")
    .replace(/\bUltimately,\s*/gi, "")
    .replace(/\bIn conclusion,\s*/gi, "")
    .replace(/\bTo summarize,\s*/gi, "")
    .replace(/\bOverall,\s*/gi, "")
    .replace(/^\s*None provided\s*$/gim, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  output = output.replace(
    /\b(Furthermore|Moreover|Additionally|Consequently|Therefore),\s*(furthermore|moreover|additionally|consequently|therefore),?\s*/gi,
    "$1, ",
  );
  output = output.replace(/not only\s+([^,]+),?\s*but\s+also\s+/gi, "$1, and also ");
  output = output.replace(/^From\s+[^,]+\s+to\s+[^,]+,\s*/gim, "");
  output = reduceParticipialPhraseDensity(output);
  output = reduceTransitionStacking(output);
  output = breakExcessTriadicLists(output);
  output = output
    .replace(/\u202F/g, " ")
    .replace(/\u200B/g, "")
    .replace(/\u200C/g, "")
    .replace(/\u200D/g, "")
    .replace(/\uFEFF/g, "")
    .replace(/\u00A0/g, " ");

  return output.replace(/\n{3,}/g, "\n\n").trim();
}

export function injectEntropyPostProcess(text: string): string {
  const paragraphs = splitParagraphs(text);

  const processed = paragraphs.map((paragraph, paragraphIndex) => {
    const sentences = getSentences(paragraph);

    if (sentences.length < 3) {
      return paragraph;
    }

    const lengths = sentences.map((sentence) => countWords(sentence));
    const mean = lengths.reduce((sum, value) => sum + value, 0) / lengths.length;
    const stdDev = Math.sqrt(
      lengths.reduce((sum, value) => sum + (value - mean) ** 2, 0) / lengths.length,
    );
    const cv = mean > 0 ? stdDev / mean : 0;
    const modified = [...sentences];

    if (cv < 0.4 && sentences.length >= 3) {
      let longestIndex = 0;
      for (let index = 1; index < lengths.length; index += 1) {
        if (lengths[index] > lengths[longestIndex]) {
          longestIndex = index;
        }
      }

      const longest = modified[longestIndex];
      const breakPoints = [", and ", ", but ", ", so ", ", yet ", " — ", "; "];
      for (const breakPoint of breakPoints) {
        const breakIndex = longest.indexOf(breakPoint);
        if (breakIndex > 0) {
          const left = longest.slice(0, breakIndex).trim();
          const right = longest.slice(breakIndex + breakPoint.length).trim();
          if (countWords(left) >= 4 && countWords(right) >= 4) {
            const capitalRight = right.charAt(0).toUpperCase() + right.slice(1);
            modified[longestIndex] = `${left}.`;
            modified.splice(longestIndex + 1, 0, capitalRight);
            break;
          }
        }
      }
    }

    if (paragraphIndex % 2 === 0 && modified.length >= 4) {
      const targetIndex = Math.min(2, modified.length - 1);
      const sentence = modified[targetIndex];
      if (sentence && !/^(And|But|Or|So|Yet)\b/i.test(sentence)) {
        const transitionMatch = sentence.match(
          /^(However|Nevertheless|Nonetheless|Yet|Still),?\s+/i,
        );
        if (transitionMatch) {
          modified[targetIndex] = `But ${sentence.slice(transitionMatch[0].length)}`;
        }
      }
    }

    for (let index = 0; index < modified.length - 2; index += 1) {
      const leftLength = countWords(modified[index]);
      const middleLength = countWords(modified[index + 1]);
      const rightLength = countWords(modified[index + 2]);

      if (
        Math.abs(leftLength - middleLength) <= 5 &&
        Math.abs(middleLength - rightLength) <= 5 &&
        middleLength > 12
      ) {
        const middle = modified[index + 1];
        const commaIndex = middle.indexOf(", ");
        if (commaIndex > 0 && commaIndex < middle.length - 10) {
          const left = middle.slice(0, commaIndex).trim();
          const right = middle.slice(commaIndex + 2).trim();
          if (countWords(left) >= 3 && countWords(right) >= 3) {
            const capitalRight = right.charAt(0).toUpperCase() + right.slice(1);
            modified[index + 1] = `${left}.`;
            modified.splice(index + 2, 0, capitalRight);
            break;
          }
        }
      }
    }

    return modified.join(" ");
  });

  return processed.join("\n\n");
}

function measureContentFunctionRatioPenalty(text: string): number {
  const words = text.toLowerCase().match(/\b[a-z][a-z'-]*\b/g) ?? [];

  if (words.length < 30) {
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

  const ratio = functionCount > 0 ? contentCount / functionCount : 2;

  if (ratio > 1.35) {
    return 20;
  }

  if (ratio > 1.25) {
    return 12;
  }

  if (ratio > 1.15) {
    return 5;
  }

  return 0;
}

function measureTransitionDensityPenalty(text: string): number {
  const words = text.toLowerCase().match(/\b[\w'-]+\b/g) ?? [];

  if (words.length === 0) {
    return 0;
  }

  const count = words.filter((word) => TRANSITION_WORDS.has(word)).length;
  const density = count / words.length;

  if (density > 0.04) {
    return 12;
  }

  if (density > 0.03) {
    return 6;
  }

  return 0;
}

function measureParagraphUniformityPenalty(text: string): number {
  const paragraphs = splitParagraphs(text);

  if (paragraphs.length < 3) {
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
  const cv = stdDev / mean;

  if (cv < 0.15) {
    return 12;
  }

  if (cv < 0.25) {
    return 6;
  }

  return 0;
}

function measureRepeatedOpenerPenalty(text: string): number {
  const openers = getSentenceOpeners(text);

  if (openers.length < 5) {
    return 0;
  }

  const counts = new Map<string, number>();

  for (const opener of openers) {
    counts.set(opener, (counts.get(opener) ?? 0) + 1);
  }

  let penalty = 0;

  for (const count of counts.values()) {
    if (count >= 4) {
      penalty += 8;
    } else if (count >= 3) {
      penalty += 4;
    }
  }

  return Math.min(penalty, 20);
}

export function scoreNaturalness(text: string) {
  const lower = text.toLowerCase();
  const overAdvancedCount = Object.keys(OVER_ADVANCED_SWAPS).reduce(
    (count, word) => count + (lower.match(new RegExp(`\\b${escapeRegExp(word)}\\b`, "g"))?.length ?? 0),
    0,
  );
  const exotics =
    lower.match(/\b(quintessential|multifaceted|paradigm|juxtaposition|aforementioned)\b/g)
      ?.length ?? 0;
  const fillerCount = FILLER_PHRASES.reduce(
    (count, phrase) =>
      count + (lower.match(buildPhrasePattern(phrase))?.length ?? 0),
    0,
  );
  const sentenceLengths = getSentenceLengths(text);
  let burstinessPenalty = 0;

  if (sentenceLengths.length >= 3) {
    const mean = sentenceLengths.reduce((sum, length) => sum + length, 0) / sentenceLengths.length;

    if (mean > 0) {
      const stdDev = Math.sqrt(
        sentenceLengths.reduce((sum, length) => sum + (length - mean) ** 2, 0) /
          sentenceLengths.length,
      );
      const cv = stdDev / mean;

      if (cv < 0.25) {
        burstinessPenalty = 25;
      } else if (cv < 0.35) {
        burstinessPenalty = 15;
      } else if (cv < 0.4) {
        burstinessPenalty = 8;
      }
    }
  }

  const shortSentences = sentenceLengths.filter((length) => length < 10).length;
  const shortPct = sentenceLengths.length > 0 ? shortSentences / sentenceLengths.length : 0;
  const shortSentencePenalty = shortPct < 0.1 ? 10 : shortPct < 0.15 ? 5 : 0;
  const contentFunctionPenalty = measureContentFunctionRatioPenalty(text);
  const transitionPenalty = measureTransitionDensityPenalty(text);
  const paragraphUniformityPenalty = measureParagraphUniformityPenalty(text);
  const openerPenalty = measureRepeatedOpenerPenalty(text);

  return Math.max(
    0,
    100 -
      overAdvancedCount * 18 -
      exotics * 12 -
      fillerCount * 8 -
      burstinessPenalty -
      shortSentencePenalty -
      contentFunctionPenalty -
      transitionPenalty -
      paragraphUniformityPenalty -
      openerPenalty,
  );
}

export { FUNCTION_WORDS, TRANSITION_WORDS };
