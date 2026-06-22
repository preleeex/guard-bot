"use client";

import React from "react";
import type {
  CaptchaConfig,
  MediaConfig,
  QuizConfig,
  RulesConfig,
  ScenarioBlock,
} from "@/lib/types";

export type Payload = Record<string, unknown>;

// Render one scenario block for the applicant and report its answer payload.
export function BlockForm({
  block,
  payload,
  onChange,
}: {
  block: ScenarioBlock;
  payload: Payload;
  onChange: (p: Payload) => void;
}) {
  if (block.type === "captcha") {
    const cfg = block.config as CaptchaConfig;
    if (cfg.kind === "button") {
      const pressed = payload.pressed === true;
      return (
        <div className="col">
          <p className="subtitle">Подтверждение</p>
          <button
            className={`option ${pressed ? "selected" : ""}`}
            onClick={() => onChange({ pressed: true })}
          >
            {cfg.buttonLabel || "Я не робот"}
          </button>
        </div>
      );
    }
    return (
      <div className="col">
        <p className="subtitle">Капча</p>
        {cfg.kind === "visual" && cfg.code ? (
          <div className="captcha-code">{cfg.code}</div>
        ) : (
          <p className="title center">{cfg.prompt}</p>
        )}
        <input
          className="field"
          inputMode={cfg.kind === "math" ? "numeric" : "text"}
          placeholder={cfg.kind === "math" ? "Ответ" : "Введите код"}
          value={String(payload.value ?? "")}
          onChange={(e) => onChange({ value: e.target.value })}
        />
      </div>
    );
  }

  if (block.type === "quiz") {
    const cfg = block.config as QuizConfig;
    const selected = (payload.selected ?? {}) as Record<string, number[]>;
    const toggle = (qid: string, idx: number) => {
      const cur = new Set(selected[qid] ?? []);
      if (cur.has(idx)) cur.delete(idx);
      else cur.add(idx);
      onChange({ selected: { ...selected, [qid]: Array.from(cur).sort((a, b) => a - b) } });
    };
    return (
      <div className="col">
        <p className="subtitle">Вопросы</p>
        {(cfg.questions ?? []).map((q) => (
          <div className="col" key={q.id}>
            {q.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className={`q-img q-img-${q.imageSize ?? "l"}`} src={q.image} alt="" />
            ) : null}
            <p style={{ margin: 0 }}>{q.text}</p>
            {q.options.map((opt, idx) => {
              const isSel = (selected[q.id] ?? []).includes(idx);
              const optImg = (q.optionImages ?? [])[idx];
              return (
                <div
                  key={idx}
                  className={`option ${isSel ? "selected" : ""}`}
                  onClick={() => toggle(q.id, idx)}
                >
                  {optImg ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="opt-img" src={optImg} alt="" />
                  ) : null}
                  <span>{opt}</span>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    );
  }

  if (block.type === "media") {
    const cfg = block.config as MediaConfig;
    return (
      <div className="col">
        {cfg.kind === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="media-img" src={cfg.url} alt="" />
        ) : null}
        {cfg.kind === "video" ? (
          <video className="media-video" src={cfg.url} controls playsInline />
        ) : null}
        {cfg.kind === "voice" ? (
          <audio src={cfg.url} controls style={{ width: "100%" }} />
        ) : null}
        {cfg.caption ? <p style={{ margin: 0 }}>{cfg.caption}</p> : null}
      </div>
    );
  }

  if (block.type === "rules") {
    const cfg = block.config as RulesConfig;
    const agreed = payload.agreed === true;
    return (
      <div className="col">
        <p className="subtitle">Правила</p>
        <p className="rules-text">{cfg.text}</p>
        <button
          className={`option ${agreed ? "selected" : ""}`}
          onClick={() => onChange({ agreed: true })}
        >
          {cfg.agreeLabel || "Согласен"}
        </button>
      </div>
    );
  }

  return (
    <div className="col">
      <p className="hint">Неизвестный тип блока: {block.type}</p>
    </div>
  );
}

// Whether a block's current payload is sufficient to proceed.
export function isBlockAnswered(block: ScenarioBlock, payload: Payload): boolean {
  if (block.type === "captcha") {
    const cfg = block.config as CaptchaConfig;
    if (cfg.kind === "button") return payload.pressed === true;
    return String(payload.value ?? "").trim().length > 0;
  }
  if (block.type === "quiz") {
    const cfg = block.config as QuizConfig;
    const selected = (payload.selected ?? {}) as Record<string, number[]>;
    return (cfg.questions ?? []).every((q) => (selected[q.id] ?? []).length > 0);
  }
  if (block.type === "rules") return payload.agreed === true;
  // media and unknown display blocks: nothing to answer
  return true;
}
