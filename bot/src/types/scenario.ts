// Scenario block types. The block `type` is an open string so new types can be
// added without touching an enum. Each known type has a config and an answer
// shape; unknown types are tolerated (skipped at evaluation with a warning).

export type BlockType = "captcha" | "quiz" | "rules" | string;

// --- captcha ---------------------------------------------------------------
export type CaptchaKind = "visual" | "math" | "button";

export interface CaptchaConfig {
  kind: CaptchaKind;
  // math: backend generates the challenge; visual/button: text prompt shown.
  prompt?: string;
  // button captcha: the label the applicant must press.
  buttonLabel?: string;
}

// --- quiz ------------------------------------------------------------------
export interface QuizQuestion {
  id: string;
  text: string;
  image?: string; // data URL for the question image
  options: string[];
  optionImages?: (string | null)[]; // data URL per option
  // indexes of correct options (single or multiple correct)
  correct: number[];
}

export interface QuizConfig {
  questions: QuizQuestion[];
  // minimum number of correct answers required to pass this block
  passCount: number;
}

// --- rules -----------------------------------------------------------------
export interface RulesConfig {
  text: string;
  // label of the mandatory agreement button
  agreeLabel?: string;
}

// --- media (display-only: image / video / voice by URL) --------------------
export type MediaKind = "image" | "video" | "voice";

export interface MediaConfig {
  kind: MediaKind;
  url: string;
  caption?: string;
}

export interface ScenarioBlockDTO {
  id: string;
  order: number;
  type: BlockType;
  config: CaptchaConfig | QuizConfig | RulesConfig | Record<string, unknown>;
}

// Result policy controls how the aggregate outcome maps to a decision.
export interface ResultPolicy {
  passApprove: boolean; // auto-approve when the applicant passes
  failDecline: boolean; // auto-decline when the applicant fails
  // when set, results at/above threshold are auto-approved, below go to queue
  queueThreshold: number | null;
}

export type Decision = "approve" | "decline" | "queue";

// Answer submitted by the applicant for one block.
export interface BlockAnswer {
  blockId: string;
  type: BlockType;
  // captcha: { value: string }; quiz: { selected: Record<questionId, number[]> };
  // rules: { agreed: boolean }
  payload: Record<string, unknown>;
}
