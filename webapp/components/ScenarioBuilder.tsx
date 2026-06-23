"use client";

import type {
  CaptchaConfig,
  CaptchaKind,
  MediaConfig,
  MediaKind,
  QuizConfig,
  QuizQuestion,
  RulesConfig,
  ScenarioBlock,
} from "@/lib/types";
import { Button, IconButton } from "./ui";
import {
  ArrowUpIcon,
  ArrowDownIcon,
  TrashIcon,
  ShieldIcon,
  QuizIcon,
  JournalIcon,
  UploadIcon,
  CheckIcon,
} from "./icons";
import { pickImage } from "@/lib/image";
import { t } from "@/lib/i18n";

function blockIcon(type: string) {
  if (type === "captcha") return <ShieldIcon size={18} />;
  if (type === "quiz") return <QuizIcon size={18} />;
  if (type === "rules") return <JournalIcon size={18} />;
  return null;
}

function blockLabel(type: string): string {
  if (type === "captcha") return t("b_captcha");
  if (type === "quiz") return t("b_quiz");
  if (type === "rules") return t("b_rules");
  return type;
}

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

function newBlock(type: string): ScenarioBlock {
  if (type === "captcha") {
    return { id: uid(), type, config: { kind: "math" } as CaptchaConfig };
  }
  if (type === "quiz") {
    return { id: uid(), type, config: { passCount: 1, questions: [] } as QuizConfig };
  }
  if (type === "media") {
    return { id: uid(), type, config: { kind: "image", url: "" } as MediaConfig };
  }
  return { id: uid(), type: "rules", config: { text: "" } as RulesConfig };
}

// The no-code scenario constructor. Add, edit, reorder and delete blocks of any
// type and in any number.
export function ScenarioBuilder({
  blocks,
  onChange,
}: {
  blocks: ScenarioBlock[];
  onChange: (blocks: ScenarioBlock[]) => void;
}) {
  const update = (idx: number, patch: Partial<ScenarioBlock>) => {
    onChange(blocks.map((b, i) => (i === idx ? { ...b, ...patch } : b)));
  };
  const setConfig = (idx: number, config: ScenarioBlock["config"]) => update(idx, { config });
  const remove = (idx: number) => onChange(blocks.filter((_, i) => i !== idx));
  const move = (idx: number, dir: -1 | 1) => {
    const j = idx + dir;
    if (j < 0 || j >= blocks.length) return;
    const next = blocks.slice();
    [next[idx], next[j]] = [next[j], next[idx]];
    onChange(next);
  };

  return (
    <div className="col">
      {blocks.map((block, idx) => (
        <div className="card" key={block.id}>
          <div className="row">
            <p className="subtitle icon-row">
              <span className="block-ico">{blockIcon(block.type)}</span>
              {idx + 1}. {blockLabel(block.type)}
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <IconButton onClick={() => move(idx, -1)} disabled={idx === 0} aria-label={t("aria_up")}>
                <ArrowUpIcon size={18} />
              </IconButton>
              <IconButton
                onClick={() => move(idx, 1)}
                disabled={idx === blocks.length - 1}
                aria-label={t("aria_down")}
              >
                <ArrowDownIcon size={18} />
              </IconButton>
              <IconButton variant="danger" onClick={() => remove(idx)} aria-label={t("aria_delete")}>
                <TrashIcon size={18} />
              </IconButton>
            </div>
          </div>

          {block.type === "captcha" ? (
            <CaptchaEditor config={block.config as CaptchaConfig} onChange={(c) => setConfig(idx, c)} />
          ) : null}
          {block.type === "quiz" ? (
            <QuizEditor config={block.config as QuizConfig} onChange={(c) => setConfig(idx, c)} />
          ) : null}
          {block.type === "rules" ? (
            <RulesEditor config={block.config as RulesConfig} onChange={(c) => setConfig(idx, c)} />
          ) : null}
          {block.type === "media" ? (
            <MediaEditor config={block.config as MediaConfig} onChange={(c) => setConfig(idx, c)} />
          ) : null}
        </div>
      ))}

      <div className="add-block-grid">
        <button className="add-block" onClick={() => onChange([...blocks, newBlock("captcha")])}>
          <ShieldIcon size={24} />
          <span>{t("b_captcha")}</span>
        </button>
        <button className="add-block" onClick={() => onChange([...blocks, newBlock("quiz")])}>
          <QuizIcon size={24} />
          <span>{t("b_quiz")}</span>
        </button>
        <button className="add-block" onClick={() => onChange([...blocks, newBlock("rules")])}>
          <JournalIcon size={24} />
          <span>{t("b_rules")}</span>
        </button>
      </div>
    </div>
  );
}

function CaptchaEditor({
  config,
  onChange,
}: {
  config: CaptchaConfig;
  onChange: (c: CaptchaConfig) => void;
}) {
  return (
    <div className="col">
      <label className="hint">{t("cap_type")}</label>
      <select
        className="field"
        value={config.kind}
        onChange={(e) => onChange({ ...config, kind: e.target.value as CaptchaKind })}
      >
        <option value="math">{t("cap_math")}</option>
        <option value="visual">{t("cap_visual")}</option>
        <option value="button">{t("cap_button")}</option>
      </select>
      {config.kind === "button" ? (
        <input
          className="field"
          placeholder={t("cap_btn_ph")}
          value={config.buttonLabel ?? ""}
          onChange={(e) => onChange({ ...config, buttonLabel: e.target.value })}
        />
      ) : null}
    </div>
  );
}

function QuizEditor({
  config,
  onChange,
}: {
  config: QuizConfig;
  onChange: (c: QuizConfig) => void;
}) {
  const questions = config.questions ?? [];
  const setQuestions = (qs: QuizQuestion[]) => onChange({ ...config, questions: qs });
  const updateQ = (qi: number, patch: Partial<QuizQuestion>) =>
    setQuestions(questions.map((q, i) => (i === qi ? { ...q, ...patch } : q)));

  const setOptImage = (qi: number, oi: number, url: string | null) => {
    const imgs = (questions[qi].optionImages ?? []).slice();
    imgs[oi] = url;
    updateQ(qi, { optionImages: imgs });
  };

  return (
    <div className="col">
      <label className="hint">{t("quiz_need")}</label>
      <input
        className="field"
        inputMode="numeric"
        value={String(config.passCount ?? questions.length)}
        onChange={(e) =>
          onChange({
            ...config,
            passCount: Math.max(1, Math.min(Math.max(1, questions.length), Number(e.target.value) || 1)),
          })
        }
      />
      {questions.map((q, qi) => (
        <div className="card" key={q.id}>
          <input
            className="field"
            placeholder={t("quiz_qtext_ph")}
            value={q.text}
            onChange={(e) => updateQ(qi, { text: e.target.value })}
          />
          {q.image ? (
            <div className="col">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className={`q-img q-img-${q.imageSize ?? "l"}`} src={q.image} alt="" />
              <div className="row" style={{ gap: 8 }}>
                <select
                  className="field"
                  value={q.imageSize ?? "l"}
                  onChange={(e) => updateQ(qi, { imageSize: e.target.value as "s" | "m" | "l" })}
                >
                  <option value="s">{t("img_s")}</option>
                  <option value="m">{t("img_m")}</option>
                  <option value="l">{t("img_l")}</option>
                </select>
                <IconButton variant="danger" onClick={() => updateQ(qi, { image: undefined })} aria-label={t("remove")}>
                  <TrashIcon size={18} />
                </IconButton>
              </div>
            </div>
          ) : (
            <Button
              small
              variant="secondary"
              onClick={async () => {
                const url = await pickImage();
                if (url) updateQ(qi, { image: url });
              }}
            >
              <span className="btn-icon">
                <UploadIcon size={18} /> {t("quiz_photo_q")}
              </span>
            </Button>
          )}
          {q.options.map((opt, oi) => {
            const correct = q.correct ?? [];
            const isCorrect = correct.includes(oi);
            const optImg = (q.optionImages ?? [])[oi];
            return (
              <div className="opt-item" key={oi}>
                <input
                  className="field"
                  placeholder={`${t("quiz_option")} ${oi + 1}`}
                  value={opt}
                  onChange={(e) =>
                    updateQ(qi, {
                      options: q.options.map((o, i) => (i === oi ? e.target.value : o)),
                    })
                  }
                />
                <div className="opt-controls">
                  <button
                    type="button"
                    className={`check-box ${isCorrect ? "on" : ""}`}
                    aria-label={t("quiz_correct")}
                    onClick={() =>
                      updateQ(qi, {
                        correct: isCorrect ? correct.filter((c) => c !== oi) : [...correct, oi],
                      })
                    }
                  >
                    {isCorrect ? <CheckIcon size={16} /> : null}
                  </button>
                  <span className="hint">{t("quiz_correct")}</span>
                  <IconButton
                    aria-label={t("quiz_photo_q")}
                    onClick={async () => {
                      const url = await pickImage();
                      if (url) setOptImage(qi, oi, url);
                    }}
                  >
                    <UploadIcon size={18} />
                  </IconButton>
                  {optImg ? (
                    <IconButton variant="danger" onClick={() => setOptImage(qi, oi, null)} aria-label={t("remove")}>
                      <TrashIcon size={18} />
                    </IconButton>
                  ) : null}
                </div>
                {optImg ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className={`opt-img opt-img-${q.optionImageSize ?? "s"}`} src={optImg} alt="" />
                ) : null}
              </div>
            );
          })}
          {(q.optionImages ?? []).some(Boolean) ? (
            <select
              className="field"
              value={q.optionImageSize ?? "s"}
              onChange={(e) => updateQ(qi, { optionImageSize: e.target.value as "s" | "m" | "l" })}
            >
              <option value="s">{t("optimg_s")}</option>
              <option value="m">{t("optimg_m")}</option>
              <option value="l">{t("optimg_l")}</option>
            </select>
          ) : null}
          <Button small variant="secondary" onClick={() => updateQ(qi, { options: [...q.options, ""] })}>
            + {t("quiz_add_opt")}
          </Button>
          <Button small variant="danger" onClick={() => setQuestions(questions.filter((_, i) => i !== qi))}>
            {t("quiz_del_q")}
          </Button>
        </div>
      ))}
      <Button
        small
        variant="secondary"
        onClick={() => setQuestions([...questions, { id: uid(), text: "", options: ["", ""], correct: [] }])}
      >
        + {t("quiz_add_q")}
      </Button>
    </div>
  );
}

function RulesEditor({
  config,
  onChange,
}: {
  config: RulesConfig;
  onChange: (c: RulesConfig) => void;
}) {
  return (
    <div className="col">
      <textarea
        className="field"
        placeholder={t("rules_text_ph")}
        value={config.text}
        onChange={(e) => onChange({ ...config, text: e.target.value })}
      />
      <input
        className="field"
        placeholder={t("rules_agree_ph")}
        value={config.agreeLabel ?? ""}
        onChange={(e) => onChange({ ...config, agreeLabel: e.target.value })}
      />
    </div>
  );
}

function MediaEditor({
  config,
  onChange,
}: {
  config: MediaConfig;
  onChange: (c: MediaConfig) => void;
}) {
  return (
    <div className="col">
      <select
        className="field"
        value={config.kind}
        onChange={(e) => onChange({ ...config, kind: e.target.value as MediaKind })}
      >
        <option value="image">image</option>
        <option value="video">video</option>
        <option value="voice">voice</option>
      </select>
      <input
        className="field"
        placeholder="https://..."
        value={config.url}
        onChange={(e) => onChange({ ...config, url: e.target.value })}
      />
      <input
        className="field"
        placeholder="caption"
        value={config.caption ?? ""}
        onChange={(e) => onChange({ ...config, caption: e.target.value })}
      />
    </div>
  );
}
