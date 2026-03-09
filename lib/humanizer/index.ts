import {
  applyProtectedSpans,
  extractCitations,
  restoreProtectedSpans,
  type ProtectedSpan,
} from "@/lib/humanizer/citations";
import { downgradeOverwrittenWords, scoreNaturalness } from "@/lib/humanizer/naturalness";
import { getModelName, getOpenAIClient } from "@/lib/humanizer/openai";
import { buildHumanizerPrompt, buildRepairPrompt } from "@/lib/humanizer/prompt";
import type { HumanizeRequest, HumanizeResponse } from "@/lib/humanizer/types";
import { countWords, estimateGradeBand } from "@/lib/humanizer/text";
import { validateRewrite } from "@/lib/humanizer/validation";

function buildProtectedTermSpans(terms: string[]) {
  return terms.map<ProtectedSpan>((term, index) => ({
    placeholder: `__PROTECTED_TERM_${index}__`,
    original: term,
  }));
}

async function generateText(input: string) {
  const client = getOpenAIClient();
  const response = await client.responses.create({
    model: getModelName(),
    input,
  });

  return response.output_text.trim();
}

export async function humanizeEssay(request: HumanizeRequest): Promise<HumanizeResponse> {
  const citationSpans = extractCitations(request.text);
  const protectedTermSpans = buildProtectedTermSpans(request.protectedTerms);
  const allProtectedSpans = [...citationSpans, ...protectedTermSpans];
  const protectedEssay = applyProtectedSpans(request.text, allProtectedSpans);

  const firstPass = await generateText(buildHumanizerPrompt(request, protectedEssay));
  let restoredOutput = restoreProtectedSpans(firstPass, allProtectedSpans);
  restoredOutput = downgradeOverwrittenWords(restoredOutput);

  let validation = validateRewrite(request, restoredOutput);

  if (!validation.isValid) {
    const repaired = await generateText(
      buildRepairPrompt(
        applyProtectedSpans(restoredOutput, allProtectedSpans),
        validation.violations,
        request,
      ),
    );

    restoredOutput = restoreProtectedSpans(repaired, allProtectedSpans);
    restoredOutput = downgradeOverwrittenWords(restoredOutput);
    validation = validateRewrite(request, restoredOutput);
  }

  return {
    outputText: restoredOutput,
    originalWordCount: countWords(request.text),
    outputWordCount: countWords(restoredOutput),
    paragraphCountMatched: validation.violations.every(
      (item) => item !== "Paragraph count changed from the original essay.",
    ),
    citationsPreserved: validation.violations.every(
      (item) => item !== "At least one citation was changed or removed.",
    ),
    protectedTermsPreserved: validation.violations.every(
      (item) => item !== "One or more protected words or phrases were changed.",
    ),
    warnings: validation.isValid
      ? []
      : [
          "The app repaired what it could, but one or more guardrails are still not perfect.",
          ...validation.violations,
        ],
    validation,
    readabilityBand: estimateGradeBand(restoredOutput),
    naturalnessScore: scoreNaturalness(restoredOutput),
  };
}
