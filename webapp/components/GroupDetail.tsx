"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { openExternal } from "@/lib/telegram";
import type { Group, JournalEntry, ResultPolicy, ScenarioBlock } from "@/lib/types";
import { Avatar, Button, Card, Loading, Toggle, InfoTip } from "./ui";
import { ExternalIcon } from "./icons";
import { ScenarioBuilder } from "./ScenarioBuilder";
import { Preview } from "./Preview";

type Tab = "scenario" | "settings" | "journal";

const decisionLabel: Record<string, string> = {
  approve: "Одобрено",
  decline: "Отклонено",
  queue: "Очередь",
  timeout: "Таймаут",
};

export function GroupDetail({
  chatId,
  onBack,
  initialJournalUserId,
}: {
  chatId: string;
  onBack: () => void;
  initialJournalUserId?: string;
}) {
  const [loading, setLoading] = useState(true);
  const [group, setGroup] = useState<Group | null>(null);
  const [blocks, setBlocks] = useState<ScenarioBlock[]>([]);
  const [chatUsername, setChatUsername] = useState<string | null>(null);
  const [premium, setPremium] = useState(false);
  const [tab, setTab] = useState<Tab>(initialJournalUserId ? "journal" : "scenario");
  const [preview, setPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    api
      .get<{ group: Group; scenario: ScenarioBlock[]; chatUsername: string | null; premium: boolean }>(
        `/api/owner/groups/${chatId}`
      )
      .then((data) => {
        setGroup(data.group);
        setBlocks(data.scenario);
        setChatUsername(data.chatUsername);
        setPremium(data.premium);
      })
      .finally(() => setLoading(false));
  }, [chatId]);

  if (loading || !group) return <Loading />;

  const policy = group.resultPolicy;
  const setPolicy = (p: Partial<ResultPolicy>) =>
    setGroup({ ...group, resultPolicy: { ...policy, ...p } });

  const saveScenario = async () => {
    setSaving(true);
    setStatus("");
    try {
      await api.put(`/api/owner/groups/${chatId}/scenario`, {
        blocks: blocks.map((b) => ({ type: b.type, config: b.config })),
      });
      setStatus("Сценарий сохранён.");
    } catch (e) {
      setStatus((e as ApiError).message || "Ошибка сохранения.");
    } finally {
      setSaving(false);
    }
  };

  const saveSettings = async () => {
    setSaving(true);
    setStatus("");
    try {
      const res = await api.patch<{ group: Group }>(`/api/owner/groups/${chatId}`, {
        guardEnabled: group.guardEnabled,
        resultPolicy: group.resultPolicy,
        timeoutSeconds: group.timeoutSeconds,
        timeoutAction: group.timeoutAction,
        cooldownSeconds: group.cooldownSeconds,
        voiceScreening: group.voiceScreening,
        voicePrompt: group.voicePrompt,
        emojiGate: group.emojiGate,
      });
      setGroup(res.group);
      setStatus("Настройки сохранены.");
    } catch (e) {
      setStatus((e as ApiError).message || "Ошибка сохранения.");
    } finally {
      setSaving(false);
    }
  };

  if (preview) {
    return (
      <div className="app">
        <Preview draft={blocks} policy={policy} onClose={() => setPreview(false)} />
      </div>
    );
  }

  return (
    <div className="app">
      <div className="row">
        <Button small variant="secondary" onClick={onBack}>
          Назад
        </Button>
        <p className="subtitle">{group.title ?? group.chatId}</p>
      </div>

      {chatUsername ? (
        <Button variant="secondary" onClick={() => openExternal(`https://t.me/${chatUsername}`)}>
          <span className="btn-icon">
            <ExternalIcon size={18} /> Перейти в группу
          </span>
        </Button>
      ) : null}

      <Card>
        <div className="row">
          <span className="icon-row">
            <p className="subtitle">Guard mode</p>
            <InfoTip text="Включает проверку при вступлении: человек проходит сценарий в Mini App, и только потом его впускают." />
          </span>
          <Toggle
            checked={group.guardEnabled}
            onChange={async (next) => {
              setGroup({ ...group, guardEnabled: next });
              await api.patch(`/api/owner/groups/${chatId}`, { guardEnabled: next });
            }}
          />
        </div>
      </Card>

      <SetupCheck chatId={chatId} />

      <div className="row" style={{ gap: 8 }}>
        <Button small variant={tab === "scenario" ? "primary" : "secondary"} onClick={() => setTab("scenario")}>
          Сценарий
        </Button>
        <Button small variant={tab === "settings" ? "primary" : "secondary"} onClick={() => setTab("settings")}>
          Настройки
        </Button>
        <Button small variant={tab === "journal" ? "primary" : "secondary"} onClick={() => setTab("journal")}>
          Журнал
        </Button>
      </div>

      {status ? <p className="hint">{status}</p> : null}

      {tab === "scenario" ? (
        <>
          <ScenarioBuilder blocks={blocks} onChange={setBlocks} />
          <Button variant="secondary" onClick={() => setPreview(true)}>
            Предпросмотр
          </Button>
          <Button disabled={saving} onClick={saveScenario}>
            Сохранить сценарий
          </Button>
        </>
      ) : null}

      {tab === "settings" ? (
        <SettingsForm
          group={group}
          setGroup={setGroup}
          setPolicy={setPolicy}
          onSave={saveSettings}
          saving={saving}
          premium={premium}
          chatId={chatId}
        />
      ) : null}

      {tab === "journal" ? (
        <>
          <StatsCard chatId={chatId} />
          <JournalList chatId={chatId} decisionLabel={decisionLabel} highlightUserId={initialJournalUserId} />
        </>
      ) : null}
    </div>
  );
}

interface SetupReport {
  botAdmin: boolean;
  canApprove: boolean;
  joinByRequest: boolean;
  guardEnabled: boolean;
  ok: boolean;
}

// On-demand diagnostics so the owner can see why guard might do nothing.
function SetupCheck({ chatId }: { chatId: string }) {
  const [report, setReport] = useState<SetupReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const run = async () => {
    setBusy(true);
    setErr("");
    try {
      setReport(await api.get<SetupReport>(`/api/owner/groups/${chatId}/check`));
    } catch (e) {
      setErr((e as ApiError).message || "Не удалось проверить.");
    } finally {
      setBusy(false);
    }
  };

  const Line = ({ ok, label }: { ok: boolean; label: string }) => (
    <div className="row">
      <span className="hint">{label}</span>
      <span className={`pill ${ok ? "approve" : "decline"}`}>{ok ? "ОК" : "Нет"}</span>
    </div>
  );

  return (
    <Card>
      <Button small variant="secondary" disabled={busy} onClick={run}>
        Проверить настройку
      </Button>
      {err ? <p className="hint">{err}</p> : null}
      {report ? (
        <div className="col" style={{ gap: 6, marginTop: 8 }}>
          <Line ok={report.botAdmin} label="Бот админ группы" />
          <Line ok={report.canApprove} label="Может одобрять заявки" />
          <Line ok={report.joinByRequest} label="Включён приём заявок" />
          {!report.ok ? (
            <p className="hint">
              Проверка не сработает, пока всё выше не ОК. Сделайте бота админом с правом
              добавлять участников и включите в группе «Заявки на вступление».
            </p>
          ) : (
            <p className="hint">Всё готово. Guard работает.</p>
          )}
        </div>
      ) : null}
    </Card>
  );
}

interface GroupStats {
  total: number;
  approve: number;
  decline: number;
  queue: number;
  timeout: number;
  last7d: number;
}

function StatsCard({ chatId }: { chatId: string }) {
  const [stats, setStats] = useState<GroupStats | null>(null);
  useEffect(() => {
    api.get<GroupStats>(`/api/owner/groups/${chatId}/stats`).then(setStats).catch(() => undefined);
  }, [chatId]);
  if (!stats) return null;
  return (
    <Card>
      <p className="subtitle">Статистика</p>
      <div className="row">
        <span className="hint">Всего заявок</span>
        <span>{stats.total}</span>
      </div>
      <div className="row">
        <span className="hint">За 7 дней</span>
        <span>{stats.last7d}</span>
      </div>
      <div className="row">
        <span className="hint">Одобрено</span>
        <span>{stats.approve}</span>
      </div>
      <div className="row">
        <span className="hint">Отклонено</span>
        <span>{stats.decline}</span>
      </div>
      <div className="row">
        <span className="hint">Очередь</span>
        <span>{stats.queue}</span>
      </div>
      <div className="row">
        <span className="hint">Таймаут</span>
        <span>{stats.timeout}</span>
      </div>
    </Card>
  );
}

function SettingsForm({
  group,
  setGroup,
  setPolicy,
  onSave,
  saving,
  premium,
  chatId,
}: {
  group: Group;
  setGroup: (g: Group) => void;
  setPolicy: (p: Partial<ResultPolicy>) => void;
  onSave: () => void;
  saving: boolean;
  premium: boolean;
  chatId: string;
}) {
  const policy = group.resultPolicy;
  const useThreshold = policy.queueThreshold != null;
  const [emojiBusy, setEmojiBusy] = useState(false);
  const [emojiMsg, setEmojiMsg] = useState("");

  const setMyEmojiStatus = async (clear: boolean) => {
    setEmojiBusy(true);
    setEmojiMsg("");
    try {
      const res = await api.post<{ group: Group }>(`/api/owner/groups/${chatId}/emoji-status`, { clear });
      setGroup(res.group);
      setEmojiMsg(clear ? "Эмодзи-статус сброшен." : "Эмодзи-статус сохранён.");
    } catch (e) {
      setEmojiMsg((e as ApiError).message || "Не удалось.");
    } finally {
      setEmojiBusy(false);
    }
  };

  return (
    <Card>
      <span className="icon-row">
        <p className="subtitle">Результат проверки</p>
        <InfoTip text="Что делать с заявкой: авто-одобрить при успехе, авто-отклонить при провале, либо отправить в очередь на ручное решение при пороговом балле." />
      </span>
      <div className="row">
        <span>Авто-одобрение при успехе</span>
        <Toggle checked={policy.passApprove} onChange={(v) => setPolicy({ passApprove: v })} />
      </div>
      <div className="row">
        <span>Авто-отклонение при провале</span>
        <Toggle checked={policy.failDecline} onChange={(v) => setPolicy({ failDecline: v })} />
      </div>
      <div className="row">
        <span>Очередь при пороге</span>
        <Toggle
          checked={useThreshold}
          onChange={(v) => setPolicy({ queueThreshold: v ? 60 : null })}
        />
      </div>
      {useThreshold ? (
        <div className="col">
          <label className="hint">Порог, %</label>
          <input
            className="field"
            inputMode="numeric"
            value={String(policy.queueThreshold ?? 0)}
            onChange={(e) =>
              setPolicy({ queueThreshold: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })
            }
          />
        </div>
      ) : null}

      <div className="divider" />
      <span className="icon-row">
        <p className="subtitle">Время на прохождение</p>
        <InfoTip text="Сколько секунд даётся на прохождение. По истечении применяется действие ниже." />
      </span>
      <input
        className="field"
        inputMode="numeric"
        placeholder="секунды"
        value={String(group.timeoutSeconds)}
        onChange={(e) => setGroup({ ...group, timeoutSeconds: Math.max(30, Number(e.target.value) || 600) })}
      />
      <select
        className="field"
        value={group.timeoutAction}
        onChange={(e) => setGroup({ ...group, timeoutAction: e.target.value as "queue" | "decline" })}
      >
        <option value="queue">По таймауту: ручная проверка</option>
        <option value="decline">По таймауту: отклонить</option>
      </select>

      <div className="divider" />
      <span className="icon-row">
        <p className="subtitle">Кулдаун после отказа</p>
        <InfoTip text="Сколько секунд после отказа повторные заявки от этого человека авто-отклоняются, чтобы не спамил." />
      </span>
      <input
        className="field"
        inputMode="numeric"
        placeholder="секунды, 0 = выкл"
        value={String(group.cooldownSeconds ?? 0)}
        onChange={(e) =>
          setGroup({ ...group, cooldownSeconds: Math.max(0, Number(e.target.value) || 0) })
        }
      />

      <div className="divider" />
      <div className="row">
        <span className="icon-row">
          <span>Голосовая проверка</span>
          <InfoTip text="Вместо Mini App заявителя просят записать голосовое боту в личку. Вы получаете его с кнопками Принять и Отклонить. Заменяет сценарий." />
        </span>
        <Toggle
          checked={group.voiceScreening}
          onChange={(v) => setGroup({ ...group, voiceScreening: v })}
        />
      </div>
      {group.voiceScreening ? (
        <textarea
          className="field"
          placeholder="Что записать (например: коротко расскажите о себе)"
          value={group.voicePrompt ?? ""}
          onChange={(e) => setGroup({ ...group, voicePrompt: e.target.value })}
        />
      ) : null}

      <div className="divider" />
      <span className="icon-row">
        <p className="subtitle">Эмодзи-статус</p>
        <InfoTip text="Пускать только тех, у кого установлен нужный эмодзи-статус. Поставьте себе нужный статус и нажмите кнопку ниже, чтобы задать требование. Платная функция." />
      </span>
      {premium ? (
        <div className="col">
          <p className="hint">
            {group.emojiStatusId ? "Требование задано." : "Требование не задано."}
          </p>
          <Button
            small
            variant="secondary"
            disabled={emojiBusy}
            onClick={() => setMyEmojiStatus(false)}
          >
            Использовать мой текущий эмодзи-статус
          </Button>
          {group.emojiStatusId ? (
            <Button small variant="danger" disabled={emojiBusy} onClick={() => setMyEmojiStatus(true)}>
              Сбросить требование
            </Button>
          ) : null}
          {emojiMsg ? <p className="hint">{emojiMsg}</p> : null}
        </div>
      ) : (
        <p className="hint">Доступно на платном тарифе.</p>
      )}

      <Button disabled={saving} onClick={onSave}>
        Сохранить
      </Button>
    </Card>
  );
}

function JournalList({
  chatId,
  decisionLabel,
  highlightUserId,
}: {
  chatId: string;
  decisionLabel: Record<string, string>;
  highlightUserId?: string;
}) {
  const [entries, setEntries] = useState<JournalEntry[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    api.get<{ entries: JournalEntry[] }>(`/api/owner/groups/${chatId}/journal`).then((d) => {
      setEntries(d.entries);
      if (highlightUserId) {
        // Auto-expand this person's most recent record (entries are newest-first).
        const match = d.entries.find((e) => e.applicantUserId === highlightUserId);
        if (match) setOpen(match.id);
      }
    });
  }, [chatId, highlightUserId]);

  if (!entries) return <Loading />;
  if (entries.length === 0)
    return (
      <Card>
        <p className="hint center">Журнал пуст.</p>
      </Card>
    );

  return (
    <div className="col">
      {entries.map((e) => {
        const name = e.applicantUsername ? `@${e.applicantUsername}` : e.applicantName ?? e.applicantUserId;
        const expanded = open === e.id;
        const highlighted = highlightUserId != null && e.applicantUserId === highlightUserId;
        return (
          <Card key={e.id} className={highlighted ? "highlight" : undefined}>
            <button
              className="journal-head"
              onClick={() => setOpen(expanded ? null : e.id)}
            >
              <Avatar name={e.applicantName ?? e.applicantUsername ?? undefined} size={36} />
              <span className="list-item-title">{name}</span>
              <span className={`pill ${e.decision}`}>{decisionLabel[e.decision] ?? e.decision}</span>
            </button>
            {expanded ? (
              <div className="col" style={{ gap: 6 }}>
                <div className="divider" />
                {e.applicantName ? <p className="hint">Имя: {e.applicantName}</p> : null}
                {e.applicantUsername ? <p className="hint">Username: @{e.applicantUsername}</p> : null}
                <p className="hint">ID: {e.applicantUserId}</p>
                <p className="hint">Когда: {new Date(e.finishedAt).toLocaleString("ru-RU")}</p>
                {e.score != null ? <p className="hint">Балл: {e.score}</p> : null}
                {e.reason ? <p className="hint">Причина: {e.reason}</p> : null}
                {e.applicantUsername ? (
                  <Button
                    small
                    variant="secondary"
                    onClick={() => openExternal(`https://t.me/${e.applicantUsername}`)}
                  >
                    Посмотреть профиль
                  </Button>
                ) : null}
              </div>
            ) : (
              <p className="hint">
                {new Date(e.finishedAt).toLocaleString("ru-RU")}
                {e.score != null ? ` · балл ${e.score}` : ""}
              </p>
            )}
          </Card>
        );
      })}
    </div>
  );
}
