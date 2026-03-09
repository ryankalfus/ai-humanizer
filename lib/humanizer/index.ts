import {
  applyProtectedSpans,
  extractCitations,
  restoreProtectedSpans,
  type ProtectedSpan,
} from "@/lib/humanizer/citations";
import { downgradeOverwrittenWords } from "@/lib/humanizer/naturalness";
import { HumanizerError } from "@/lib/humanizer/errors";
import { getModelName, getOpenAIClient } from "@/lib/humanizer/openai";
import { buildHumanizerPrompt, buildRepairPrompt } from "@/lib/humanizer/prompt";
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

  return {
    outputText: essayMatch?.[1]?.trim() || raw.trim(),
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
  return downgradeOverwrittenWords(restoreProtectedSpans(outputText, spans));
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

export async function humanizeEssay(request: HumanizeRequest): Promise<HumanizeResponse> {
  const citationSpans = extractCitations(request.text);
  const protectedTermSpans = buildProtectedTermSpans(request.protectedTerms);
  const allProtectedSpans = [...citationSpans, ...protectedTermSpans];
  const citationPlaceholders = citationSpans.map((span) => span.placeholder);
  const paragraphCountTarget = splitParagraphs(request.text).length;
  const originalWordCount = countWords(request.text);
  const candidates: Candidate[] = [];

  let currentProtectedEssay = applyProtectedSpans(request.text, allProtectedSpans);
  let latestValidation: ValidationResult | null = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const generation =
      attempt === 0
        ? await generateText(buildHumanizerPrompt(request, currentProtectedEssay, citationPlaceholders))
        : await generateText(
            buildRepairPrompt(
              request,
              currentProtectedEssay,
              latestValidation?.violations ?? ["The rewrite still needs to follow the hard rules."],
              citationPlaceholders,
            ),
          );

    const restoredOutput = finalizeOutput(generation.outputText, allProtectedSpans);
    const validation = validateRewrite(request, restoredOutput);

    candidates.push({
      outputText: restoredOutput,
      selfCheck: generation.selfCheck,
      validation,
    });

    if (validation.isValid) {
      const constraintReport = buildConstraintReport(request, restoredOutput);

      return {
        outputText: restoredOutput,
        originalWordCount,
        outputWordCount: countWords(restoredOutput),
        appliedSettings: {
          protectedTerms: request.protectedTerms,
          tone: request.tone,
          gradeLevel: request.gradeLevel,
          wordDelta: request.wordDelta,
          paragraphCountTarget,
          originalWordCount,
        },
        constraintReport,
        iterationCount: attempt + 1,
        status: "success",
        paragraphCountMatched: constraintReport.paragraphCountMatched,
        citationsPreserved: constraintReport.citationsPreserved,
        protectedTermsPreserved: constraintReport.protectedTermsPreserved,
        warnings: buildWarnings(validation, generation.selfCheck),
        validation,
        readabilityBand: estimateGradeBand(restoredOutput),
        naturalnessScore: constraintReport.naturalnessScore,
      };
    }

    latestValidation = validation;
    currentProtectedEssay = applyProtectedSpans(restoredOutput, allProtectedSpans);
  }

  const bestCandidate = chooseBestCandidate(candidates);

  throw new HumanizerError(
    "The app could not produce a rewrite that kept every required guardrail. Try loosening the word range or simplifying the protected terms list.",
    "CONSTRAINTS_NOT_MET",
    bestCandidate.validation.violations.join(" "),
  );
}
