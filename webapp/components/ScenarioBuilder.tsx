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
import { ArrowUpIcon, ArrowDownIcon, TrashIcon, ShieldIcon, QuizIcon, JournalIcon } from "./icons";
import { pickImage } from "@/lib/image";

function blockIcon(type: string) {
  if (type === "captcha") return <ShieldIcon size={18} />;
  if (type === "quiz") return <QuizIcon size={18} />;
  if (type === "rules") return <JournalIcon size={18} />;
  return null;
}

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

const BLOCK_LABELS: Record<string, string> = {
  captcha: "Капча",
  quiz: "Квиз",
  rules: "Правила",
  media: "Медиа",
};

function newBlock(type: string): ScenarioBlock {
  if (type === "captcha") {
    return { id: uid(), type, config: { kind: "math" } as CaptchaConfig };
  }
  if (type === "quiz") {
    return {
      id: uid(),
      type,
      config: { passScore: 100, questions: [] } as QuizConfig,
    };
  }
  if (type === "media") {
    return { id: uid(), type, config: { kind: "image", url: "" } as MediaConfig };
  }
  return { id: uid(), type: "rules", config: { text: "" } as RulesConfig };
}

// The no-code scenario constructor. Add, edit, reorder and delete blocks of any
// type and in any number. New block types only need a new editor branch here.
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
              {idx + 1}. {BLOCK_LABELS[block.type] ?? block.type}
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <IconButton onClick={() => move(idx, -1)} disabled={idx === 0} aria-label="Вверх">
                <ArrowUpIcon size={18} />
              </IconButton>
              <IconButton
                onClick={() => move(idx, 1)}
                disabled={idx === blocks.length - 1}
                aria-label="Вниз"
              >
                <ArrowDownIcon size={18} />
              </IconButton>
              <IconButton variant="danger" onClick={() => remove(idx)} aria-label="Удалить">
                <TrashIcon size={18} />
              </IconButton>
            </div>
          </div>

          {block.type === "captcha" ? (
            <CaptchaEditor
              config={block.config as CaptchaConfig}
              onChange={(c) => setConfig(idx, c)}
            />
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
          <span>Капча</span>
        </button>
        <button className="add-block" onClick={() => onChange([...blocks, newBlock("quiz")])}>
          <QuizIcon size={24} />
          <span>Квиз</span>
        </button>
        <button className="add-block" onClick={() => onChange([...blocks, newBlock("rules")])}>
          <JournalIcon size={24} />
          <span>Правила</span>
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
      <label className="hint">Тип капчи</label>
      <select
        className="field"
        value={config.kind}
        onChange={(e) => onChange({ ...config, kind: e.target.value as CaptchaKind })}
      >
        <option value="math">Математическая</option>
        <option value="visual">Визуальная (код)</option>
        <option value="button">Кнопочная</option>
      </select>
      {config.kind === "button" ? (
        <input
          className="field"
          placeholder="Текст кнопки (по умолчанию: Я не робот)"
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
      <label className="hint">Проходной балл, %</label>
      <input
        className="field"
        inputMode="numeric"
        value={String(config.passScore ?? 100)}
        onChange={(e) =>
          onChange({ ...config, passScore: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })
        }
      />
      {questions.map((q, qi) => (
        <div className="card" key={q.id}>
          <input
            className="field"
            placeholder="Текст вопроса"
            value={q.text}
            onChange={(e) => updateQ(qi, { text: e.target.value })}
          />
          {q.image ? (
            <div className="row">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="thumb" src={q.image} alt="" />
              <Button small variant="danger" onClick={() => updateQ(qi, { image: undefined })}>
                Убрать фото
              </Button>
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
              Фото вопроса
            </Button>
          )}
          {q.options.map((opt, oi) => {
            const correct = q.correct ?? [];
            const isCorrect = correct.includes(oi);
            const optImg = (q.optionImages ?? [])[oi];
            return (
              <div className="col" key={oi}>
                <div className="row">
                  <input
                    className="field"
                    placeholder={`Вариант ${oi + 1}`}
                    value={opt}
                    onChange={(e) =>
                      updateQ(qi, {
                        options: q.options.map((o, i) => (i === oi ? e.target.value : o)),
                      })
                    }
                  />
                  <Button
                    small
                    variant={isCorrect ? "primary" : "secondary"}
                    onClick={() =>
                      updateQ(qi, {
                        correct: isCorrect ? correct.filter((c) => c !== oi) : [...correct, oi],
                      })
                    }
                  >
                    {isCorrect ? "Верный" : "Неверный"}
                  </Button>
                </div>
                {optImg ? (
                  <div className="row">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img className="thumb" src={optImg} alt="" />
                    <Button small variant="danger" onClick={() => setOptImage(qi, oi, null)}>
                      Убрать
                    </Button>
                  </div>
                ) : (
                  <Button
                    small
                    variant="secondary"
                    onClick={async () => {
                      const url = await pickImage();
                      if (url) setOptImage(qi, oi, url);
                    }}
                  >
                    Фото варианта
                  </Button>
                )}
              </div>
            );
          })}
          <Button
            small
            variant="secondary"
            onClick={() => updateQ(qi, { options: [...q.options, ""] })}
          >
            + Вариант
          </Button>
          <Button small variant="danger" onClick={() => setQuestions(questions.filter((_, i) => i !== qi))}>
            Удалить вопрос
          </Button>
        </div>
      ))}
      <Button
        small
        variant="secondary"
        onClick={() => setQuestions([...questions, { id: uid(), text: "", options: ["", ""], correct: [] }])}
      >
        + Вопрос
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
        placeholder="Текст правил"
        value={config.text}
        onChange={(e) => onChange({ ...config, text: e.target.value })}
      />
      <input
        className="field"
        placeholder="Текст кнопки согласия (по умолчанию: Согласен)"
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
      <label className="hint">Тип медиа</label>
      <select
        className="field"
        value={config.kind}
        onChange={(e) => onChange({ ...config, kind: e.target.value as MediaKind })}
      >
        <option value="image">Картинка</option>
        <option value="video">Видео</option>
        <option value="voice">Голосовое</option>
      </select>
      <input
        className="field"
        placeholder="Ссылка на медиа, https://..."
        value={config.url}
        onChange={(e) => onChange({ ...config, url: e.target.value })}
      />
      <input
        className="field"
        placeholder="Подпись (необязательно)"
        value={config.caption ?? ""}
        onChange={(e) => onChange({ ...config, caption: e.target.value })}
      />
    </div>
  );
}
