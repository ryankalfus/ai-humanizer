export type Tone = "casual" | "formal";

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
  humanLikeLevel: number;
}

export interface ValidationResult {
  isValid: boolean;
  violations: string[];
}

export interface AppliedSettings {
  protectedTerms: string[];
  tone: Tone;
  gradeLevel: GradeLevel;
  wordDelta: number;
  humanLikeLevel: number;
  paragraphCountTarget: number;
  originalWordCount: number;
}

export interface ConstraintReport {
  paragraphCountMatched: boolean;
  citationsPreserved: boolean;
  protectedTermsPreserved: boolean;
  wordRangeMatched: boolean;
  readabilityMatched: boolean;
  naturalnessScore: number;
  unmetConstraints: string[];
}

export interface ModelSelfCheck {
  protectedTermsKept: boolean;
  citationsKept: boolean;
  paragraphCountKept: boolean;
  wordRangeKept: boolean;
  toneMatched: boolean;
  readingLevelMatched: boolean;
  notes: string[];
}

export interface HumanizeResponse {
  outputText: string;
  originalWordCount: number;
  outputWordCount: number;
  appliedSettings: AppliedSettings;
  constraintReport: ConstraintReport;
  iterationCount: number;
  status: "success";
  errorCode?: string;
  paragraphCountMatched: boolean;
  citationsPreserved: boolean;
  protectedTermsPreserved: boolean;
  warnings: string[];
  validation: ValidationResult;
  readabilityBand: string;
  naturalnessScore: number;
}

export interface AppStatusResponse {
  aiConfigured: boolean;
  modelName?: string;
  setupMessage?: string;
  errorCode?: string;
}

export interface ApiErrorResponse {
  error: string;
  code: string;
  details?: string;
}
