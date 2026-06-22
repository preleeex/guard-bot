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

export function GroupDetail({ chatId, onBack }: { chatId: string; onBack: () => void }) {
  const [loading, setLoading] = useState(true);
  const [group, setGroup] = useState<Group | null>(null);
  const [blocks, setBlocks] = useState<ScenarioBlock[]>([]);
  const [chatUsername, setChatUsername] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("scenario");
  const [preview, setPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    api
      .get<{ group: Group; scenario: ScenarioBlock[]; chatUsername: string | null }>(
        `/api/owner/groups/${chatId}`
      )
      .then((data) => {
        setGroup(data.group);
        setBlocks(data.scenario);
        setChatUsername(data.chatUsername);
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
        <SettingsForm group={group} setGroup={setGroup} setPolicy={setPolicy} onSave={saveSettings} saving={saving} />
      ) : null}

      {tab === "journal" ? <JournalList chatId={chatId} decisionLabel={decisionLabel} /> : null}
    </div>
  );
}

function SettingsForm({
  group,
  setGroup,
  setPolicy,
  onSave,
  saving,
}: {
  group: Group;
  setGroup: (g: Group) => void;
  setPolicy: (p: Partial<ResultPolicy>) => void;
  onSave: () => void;
  saving: boolean;
}) {
  const policy = group.resultPolicy;
  const useThreshold = policy.queueThreshold != null;
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
          <label className="hint">Порог, % (ниже порога: ручная проверка)</label>
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
        placeholder="секунды, 0 — выкл"
        value={String(group.cooldownSeconds ?? 0)}
        onChange={(e) =>
          setGroup({ ...group, cooldownSeconds: Math.max(0, Number(e.target.value) || 0) })
        }
      />

      <Button disabled={saving} onClick={onSave}>
        Сохранить
      </Button>
    </Card>
  );
}

function JournalList({
  chatId,
  decisionLabel,
}: {
  chatId: string;
  decisionLabel: Record<string, string>;
}) {
  const [entries, setEntries] = useState<JournalEntry[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    api.get<{ entries: JournalEntry[] }>(`/api/owner/groups/${chatId}/journal`).then((d) => setEntries(d.entries));
  }, [chatId]);

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
        return (
          <Card key={e.id}>
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
