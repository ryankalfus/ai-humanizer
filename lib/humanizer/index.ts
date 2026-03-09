import {
  applyProtectedSpans,
  extractCitations,
  restoreProtectedSpans,
  type ProtectedSpan,
} from "@/lib/humanizer/citations";
import { cleanupSurfacePatterns } from "@/lib/humanizer/naturalness";
import { HumanizerError } from "@/lib/humanizer/errors";
import { getModelName, getOpenAIClient } from "@/lib/humanizer/openai";
import {
  buildFinalizationPrompt,
  buildHumanizerPrompt,
  buildRefinementPrompt,
  buildRepairPrompt,
} from "@/lib/humanizer/prompt";
import type {
  HumanizeRequest,
  HumanizeResponse,
  ModelSelfCheck,
  ValidationResult,
} from "@/lib/humanizer/types";
import { countWords, estimateGradeBand, splitParagraphs } from "@/lib/humanizer/text";
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

const MIN_ATTEMPTS = 2;
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

async function generateText(prompt: string) {
  try {
    const client = getOpenAIClient();
    const response = await client.responses.create({
      model: getModelName(),
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

function chooseBestCandidate(candidates: Candidate[]) {
  return [...candidates].sort((left, right) => {
    if (left.validation.violations.length !== right.validation.violations.length) {
      return left.validation.violations.length - right.validation.violations.length;
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
                latestValidation?.violations ?? ["The rewrite still needs to follow the hard rules."],
                citationPlaceholders,
                attempt + 1,
                iterationCount,
              ),
            );

    const restoredOutput = finalizeOutput(generation.outputText, allProtectedSpans);
    const outputParagraphs = splitParagraphs(restoredOutput);
    let correctedOutput = restoredOutput;

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

    const finalOutput = correctedOutput;
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

    candidates.push({
      outputText: finalOutput,
      selfCheck: generation.selfCheck,
      validation,
    });

    finalCandidate = {
      outputText: finalOutput,
      selfCheck: generation.selfCheck,
      validation,
    };

    latestValidation = validation;
    currentProtectedEssay = applyProtectedSpans(finalOutput, allProtectedSpans);
  }

  if (finalCandidate) {
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
  const constraintReport = buildConstraintReport(request, bestCandidate.outputText);

  return {
    outputText: bestCandidate.outputText,
    originalWordCount,
    outputWordCount: countWords(bestCandidate.outputText),
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
    warnings: buildWarnings(bestCandidate.validation, bestCandidate.selfCheck),
    validation: bestCandidate.validation,
    readabilityBand: estimateGradeBand(bestCandidate.outputText),
    naturalnessScore: constraintReport.naturalnessScore,
  };
}
