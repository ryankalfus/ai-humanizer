import {
  applyProtectedSpans,
  extractCitations,
  restoreProtectedSpans,
  type ProtectedSpan,
} from "@/lib/humanizer/citations";
import { cleanupSurfacePatterns } from "@/lib/humanizer/naturalness";
import { HumanizerError } from "@/lib/humanizer/errors";
import {
  getCrossModelClient,
  getCrossModelName,
  getModelName,
  getOpenAIClient,
} from "@/lib/humanizer/openai";
import {
  buildFinalizationPrompt,
  buildHumanizerPrompt,
  buildParagraphPrompt,
  buildRefinementPrompt,
  buildRepairPrompt,
} from "@/lib/humanizer/prompt";
import type {
  HumanizeRequest,
  HumanizeResponse,
  ModelSelfCheck,
  ValidationResult,
} from "@/lib/humanizer/types";
import {
  computeSentenceLengthCV,
  countWords,
  estimateGradeBand,
  getLastSentence,
  getSentences,
  splitParagraphs,
} from "@/lib/humanizer/text";
import { buildConstraintReport, validateRewrite } from "@/lib/humanizer/validation";

interface GenerationAttempt {
  outputText: string;
  selfCheck: ModelSelfCheck;
}

interface Candidate {
  outputText: string;
  selfCheck: ModelSelfCheck;
  validation: ValidationResult;
}

const MAX_ATTEMPTS = 8;

const defaultSelfCheck: ModelSelfCheck = {
  protectedTermsKept: false,
  citationsKept: false,
  paragraphCountKept: false,
  wordRangeKept: false,
  toneMatched: false,
  readingLevelMatched: false,
  notes: [],
};

function buildProtectedTermSpans(terms: string[]) {
  return terms.map<ProtectedSpan>((term, index) => ({
    placeholder: `__PROTECTED_TERM_${index}__`,
    original: term,
  }));
}

function parseSelfCheck(raw?: string) {
  if (!raw) {
    return defaultSelfCheck;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<ModelSelfCheck>;

    return {
      protectedTermsKept: Boolean(parsed.protectedTermsKept),
      citationsKept: Boolean(parsed.citationsKept),
      paragraphCountKept: Boolean(parsed.paragraphCountKept),
      wordRangeKept: Boolean(parsed.wordRangeKept),
      toneMatched: Boolean(parsed.toneMatched),
      readingLevelMatched: Boolean(parsed.readingLevelMatched),
      notes: Array.isArray(parsed.notes)
        ? parsed.notes.filter((item): item is string => typeof item === "string")
        : [],
    };
  } catch {
    return defaultSelfCheck;
  }
}

function parseModelResponse(raw: string): GenerationAttempt {
  const essayMatch = raw.match(/<rewritten_essay>\s*([\s\S]*?)\s*<\/rewritten_essay>/i);
  const selfCheckMatch = raw.match(/<self_check>\s*([\s\S]*?)\s*<\/self_check>/i);

  let outputText = "";

  if (essayMatch?.[1]) {
    const paragraphMatches = essayMatch[1].matchAll(/<p(\d+)>\s*([\s\S]*?)\s*<\/p\1>/gi);
    const paragraphs = [...paragraphMatches]
      .sort((left, right) => Number(left[1]) - Number(right[1]))
      .map((match) => match[2].trim())
      .filter(Boolean);

    if (paragraphs.length > 0) {
      outputText = paragraphs.join("\n\n");
    } else {
      outputText = essayMatch[1].trim();
    }
  } else {
    outputText = raw.trim();
  }

  return {
    outputText,
    selfCheck: parseSelfCheck(selfCheckMatch?.[1]),
  };
}

async function generateText(
  prompt: string,
  options?: {
    client?: ReturnType<typeof getOpenAIClient>;
    modelName?: string | null;
  },
) {
  try {
    const client = options?.client ?? getOpenAIClient();
    const model = options?.modelName ?? getModelName();
    const response = await client.responses.create({
      model,
      input: prompt,
    });

    return parseModelResponse(response.output_text.trim());
  } catch (error) {
    throw new HumanizerError(
      error instanceof Error ? error.message : "The model call failed.",
      "GENERATION_FAILED",
    );
  }
}

function finalizeOutput(outputText: string, spans: ProtectedSpan[]) {
  return cleanupSurfacePatterns(restoreProtectedSpans(outputText, spans));
}

function computeCV(text: string) {
  return computeSentenceLengthCV(text);
}

function computeUniqueRatio(text: string) {
  const words = text.toLowerCase().match(/\b[a-z][a-z'-]*\b/g) ?? [];
  return words.length ? new Set(words).size / words.length : 0;
}

function chooseBestCandidate(candidates: Candidate[]) {
  return [...candidates].sort((left, right) => {
    if (left.validation.violations.length !== right.validation.violations.length) {
      return left.validation.violations.length - right.validation.violations.length;
    }

    const leftCV = computeCV(left.outputText);
    const rightCV = computeCV(right.outputText);

    if (Math.abs(leftCV - rightCV) > 0.05) {
      return rightCV - leftCV;
    }

    const leftLexical = computeUniqueRatio(left.outputText);
    const rightLexical = computeUniqueRatio(right.outputText);

    if (Math.abs(leftLexical - rightLexical) > 0.01) {
      return rightLexical - leftLexical;
    }

    return left.selfCheck.notes.length - right.selfCheck.notes.length;
  })[0];
}

function buildWarnings(validation: ValidationResult, selfCheck: ModelSelfCheck) {
  return [...new Set([...validation.violations, ...selfCheck.notes])];
}

function getIterationCount(level: number) {
  if (level <= 10) {
    return 2;
  }

  if (level <= 25) {
    return 3;
  }

  if (level <= 40) {
    return 4;
  }

  if (level <= 55) {
    return 5;
  }

  if (level <= 70) {
    return 6;
  }

  if (level <= 85) {
    return 7;
  }

  return MAX_ATTEMPTS;
}

function capitalizeSentenceStart(input: string) {
  return input.replace(/^\s*[a-z]/, (match) => match.toUpperCase());
}

function splitSentenceForBurstiness(sentence: string) {
  const splitters = [", and ", ", but ", ", which ", ", while ", "; ", ": "];

  for (const splitter of splitters) {
    const index = sentence.indexOf(splitter);

    if (index <= 0) {
      continue;
    }

    const left = sentence.slice(0, index).trim();
    const right = sentence.slice(index + splitter.length).trim();

    if (countWords(left) < 4 || countWords(right) < 4) {
      continue;
    }

    const normalizedRight = capitalizeSentenceStart(right.replace(/^[,;:]\s*/, ""));
    return [`${left}.`, normalizedRight];
  }

  return null;
}

function postProcessBurstiness(text: string): string {
  const paragraphs = splitParagraphs(text);

  return paragraphs
    .map((paragraph) => {
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

      if (cv >= 0.35) {
        return paragraph;
      }

      let longestIndex = 0;

      for (let index = 1; index < sentences.length; index += 1) {
        if (lengths[index] > lengths[longestIndex]) {
          longestIndex = index;
        }
      }

      const split = splitSentenceForBurstiness(sentences[longestIndex]);

      if (!split) {
        return paragraph;
      }

      const updated = [...sentences];
      updated.splice(longestIndex, 1, ...split);

      return updated.join(" ");
    })
    .join("\n\n");
}

async function humanizeParagraphByParagraph(
  request: HumanizeRequest,
  paragraphs: string[],
  citationPlaceholders: string[],
  allProtectedSpans: ProtectedSpan[],
): Promise<string[]> {
  const results: string[] = [];
  const crossClient = getCrossModelClient();
  const crossModelName = getCrossModelName();
  const paragraphGenerationOptions =
    crossClient && crossModelName
      ? {
          client: crossClient,
          modelName: crossModelName,
        }
      : undefined;

  for (let index = 0; index < paragraphs.length; index += 1) {
    const paraRequest: HumanizeRequest = {
      ...request,
      text: paragraphs[index],
      wordDelta: Math.max(10, Math.round((request.wordDelta / paragraphs.length) * 1.5)),
    };
    const prompt = buildParagraphPrompt(
      paraRequest,
      applyProtectedSpans(paragraphs[index], allProtectedSpans),
      citationPlaceholders,
      index,
      paragraphs.length,
      index > 0 ? getLastSentence(results[index - 1]) : null,
    );
    const generation = await generateText(prompt, paragraphGenerationOptions);
    const restored = finalizeOutput(generation.outputText, allProtectedSpans);
    results.push(restored);
  }

  return results;
}

function maybeMergeExtraParagraphs(output: string, paragraphCountTarget: number) {
  let correctedOutput = output;
  const outputParagraphs = splitParagraphs(output);

  if (outputParagraphs.length !== paragraphCountTarget && outputParagraphs.length > paragraphCountTarget) {
    while (splitParagraphs(correctedOutput).length > paragraphCountTarget) {
      const parts = splitParagraphs(correctedOutput);
      let shortestIndex = 0;
      let shortestLength = Infinity;

      for (let index = 0; index < parts.length; index += 1) {
        const length = countWords(parts[index]);

        if (length < shortestLength) {
          shortestLength = length;
          shortestIndex = index;
        }
      }

      const mergeWith = shortestIndex > 0 ? shortestIndex - 1 : 1;
      const lowIndex = Math.min(shortestIndex, mergeWith);
      const mergedParts = [...parts];
      mergedParts[lowIndex] = `${mergedParts[lowIndex]} ${mergedParts[lowIndex + 1]}`.trim();
      mergedParts.splice(lowIndex + 1, 1);
      correctedOutput = mergedParts.join("\n\n");
    }
  }

  return correctedOutput;
}

export async function humanizeEssay(request: HumanizeRequest): Promise<HumanizeResponse> {
  const citationSpans = extractCitations(request.text);
  const protectedTermSpans = buildProtectedTermSpans(request.protectedTerms);
  const allProtectedSpans = [...citationSpans, ...protectedTermSpans];
  const citationPlaceholders = citationSpans.map((span) => span.placeholder);
  const paragraphCountTarget = splitParagraphs(request.text).length;
  const originalWordCount = countWords(request.text);
  const iterationCount = getIterationCount(request.humanLikeLevel);
  const candidates: Candidate[] = [];
  let finalCandidate: Candidate | null = null;

  let currentProtectedEssay = applyProtectedSpans(request.text, allProtectedSpans);
  let latestValidation: ValidationResult | null = null;

  for (let attempt = 0; attempt < iterationCount; attempt += 1) {
    const generation =
      attempt === 0
        ? await generateText(
            buildHumanizerPrompt(
              request,
              currentProtectedEssay,
              citationPlaceholders,
              attempt + 1,
              iterationCount,
            ),
          )
        : attempt === iterationCount - 1
          ? await generateText(
              buildFinalizationPrompt(
                request,
                currentProtectedEssay,
                citationPlaceholders,
                latestValidation?.violations ?? [],
                iterationCount,
              ),
            )
          : latestValidation?.isValid
            ? await generateText(
                buildRefinementPrompt(
                  request,
                  currentProtectedEssay,
                  citationPlaceholders,
                  attempt + 1,
                  iterationCount,
                ),
              )
            : await generateText(
                buildRepairPrompt(
                  request,
                  currentProtectedEssay,
                  latestValidation?.violations ?? [
                    "The rewrite still needs to follow the hard rules.",
                  ],
                  citationPlaceholders,
                  attempt + 1,
                  iterationCount,
                ),
              );

    const restoredOutput = finalizeOutput(generation.outputText, allProtectedSpans);
    const finalOutput = maybeMergeExtraParagraphs(restoredOutput, paragraphCountTarget);
    const validation = validateRewrite(request, finalOutput);
    const wordCountDiff = Math.abs(countWords(finalOutput) - originalWordCount);

    if (wordCountDiff > request.wordDelta * 2) {
      candidates.push({
        outputText: finalOutput,
        selfCheck: generation.selfCheck,
        validation,
      });
      continue;
    }

    const candidate = {
      outputText: finalOutput,
      selfCheck: generation.selfCheck,
      validation,
    };

    candidates.push(candidate);
    finalCandidate = candidate;
    latestValidation = validation;
    currentProtectedEssay = applyProtectedSpans(finalOutput, allProtectedSpans);
  }

  if (finalCandidate && request.humanLikeLevel >= 60) {
    const paragraphs = splitParagraphs(finalCandidate.outputText);
    const refinedParagraphs = await humanizeParagraphByParagraph(
      request,
      paragraphs,
      citationPlaceholders,
      allProtectedSpans,
    );
    const refinedOutput = refinedParagraphs.join("\n\n");
    const refinedValidation = validateRewrite(request, refinedOutput);

    if (refinedValidation.violations.length <= finalCandidate.validation.violations.length) {
      finalCandidate = {
        outputText: refinedOutput,
        selfCheck: finalCandidate.selfCheck,
        validation: refinedValidation,
      };
    }
  }

  if (finalCandidate) {
    const postProcessedOutput = postProcessBurstiness(finalCandidate.outputText);
    finalCandidate = {
      ...finalCandidate,
      outputText: postProcessedOutput,
      validation: validateRewrite(request, postProcessedOutput),
    };
    const constraintReport = buildConstraintReport(request, finalCandidate.outputText);

    return {
      outputText: finalCandidate.outputText,
      originalWordCount,
      outputWordCount: countWords(finalCandidate.outputText),
      appliedSettings: {
        protectedTerms: request.protectedTerms,
        tone: request.tone,
        gradeLevel: request.gradeLevel,
        wordDelta: request.wordDelta,
        humanLikeLevel: request.humanLikeLevel,
        paragraphCountTarget,
        originalWordCount,
      },
      constraintReport,
      iterationCount,
      status: "success",
      paragraphCountMatched: constraintReport.paragraphCountMatched,
      citationsPreserved: constraintReport.citationsPreserved,
      protectedTermsPreserved: constraintReport.protectedTermsPreserved,
      warnings: buildWarnings(finalCandidate.validation, finalCandidate.selfCheck),
      validation: finalCandidate.validation,
      readabilityBand: estimateGradeBand(finalCandidate.outputText),
      naturalnessScore: constraintReport.naturalnessScore,
    };
  }

  const bestCandidate = chooseBestCandidate(candidates);
  const postProcessedOutput = postProcessBurstiness(bestCandidate.outputText);
  const finalBestCandidate: Candidate = {
    ...bestCandidate,
    outputText: postProcessedOutput,
    validation: validateRewrite(request, postProcessedOutput),
  };
  const constraintReport = buildConstraintReport(request, finalBestCandidate.outputText);

  return {
    outputText: finalBestCandidate.outputText,
    originalWordCount,
    outputWordCount: countWords(finalBestCandidate.outputText),
    appliedSettings: {
      protectedTerms: request.protectedTerms,
      tone: request.tone,
      gradeLevel: request.gradeLevel,
      wordDelta: request.wordDelta,
      humanLikeLevel: request.humanLikeLevel,
      paragraphCountTarget,
      originalWordCount,
    },
    constraintReport,
    iterationCount,
    status: "success",
    paragraphCountMatched: constraintReport.paragraphCountMatched,
    citationsPreserved: constraintReport.citationsPreserved,
    protectedTermsPreserved: constraintReport.protectedTermsPreserved,
    warnings: buildWarnings(finalBestCandidate.validation, finalBestCandidate.selfCheck),
    validation: finalBestCandidate.validation,
    readabilityBand: estimateGradeBand(finalBestCandidate.outputText),
    naturalnessScore: constraintReport.naturalnessScore,
  };
}
