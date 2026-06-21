// Scenario types shared with the backend (kept in sync manually).

export type BlockType = "captcha" | "quiz" | "rules" | string;
export type CaptchaKind = "visual" | "math" | "button";

export interface CaptchaConfig {
  kind: CaptchaKind;
  prompt?: string;
  code?: string; // visual: text to render (applicant view only)
  buttonLabel?: string;
}

export interface QuizQuestion {
  id: string;
  text: string;
  options: string[];
  correct?: number[]; // present only in the owner builder, never to applicants
}

export interface QuizConfig {
  questions: QuizQuestion[];
  passScore: number;
}

export interface RulesConfig {
  text: string;
  agreeLabel?: string;
}

export type MediaKind = "image" | "video" | "voice";

export interface MediaConfig {
  kind: MediaKind;
  url: string;
  caption?: string;
}

export interface ScenarioBlock {
  id: string;
  order?: number;
  type: BlockType;
  config: CaptchaConfig | QuizConfig | RulesConfig | MediaConfig | Record<string, unknown>;
}

export interface ResultPolicy {
  passApprove: boolean;
  failDecline: boolean;
  queueThreshold: number | null;
}

export interface Group {
  chatId: string;
  ownerUserId: string;
  title: string | null;
  guardEnabled: boolean;
  resultPolicy: ResultPolicy;
  timeoutSeconds: number;
  timeoutAction: "queue" | "decline";
  _count?: { blocks: number };
}

export interface QuotaStatus {
  unlimited: boolean;
  usedGroups: number;
  freeSlots: number;
  manualExtraSlots: number;
  paidSlots: number;
  totalSlots: number | null;
  remaining: number | null;
}

export interface JournalEntry {
  id: string;
  applicantUserId: string;
  applicantUsername: string | null;
  applicantName: string | null;
  decision: string;
  reason: string | null;
  score: number | null;
  finishedAt: string;
}

export interface BlockAnswer {
  blockId: string;
  type: BlockType;
  payload: Record<string, unknown>;
}
