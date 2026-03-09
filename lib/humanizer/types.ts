export type Tone = "casual" | "formal" | "academic";

export type GradeLevel =
  | "middle_school"
  | "high_school"
  | "college"
  | "graduate";

export interface HumanizeRequest {
  text: string;
  protectedTerms: string[];
  tone: Tone;
  gradeLevel: GradeLevel;
  wordDelta: number;
}

export interface ValidationResult {
  isValid: boolean;
  violations: string[];
}

export interface HumanizeResponse {
  outputText: string;
  originalWordCount: number;
  outputWordCount: number;
  paragraphCountMatched: boolean;
  citationsPreserved: boolean;
  protectedTermsPreserved: boolean;
  warnings: string[];
  validation: ValidationResult;
  readabilityBand: string;
  naturalnessScore: number;
}
