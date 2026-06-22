"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { openExternal } from "@/lib/telegram";
import type { Group, JournalEntry, ResultPolicy, ScenarioBlock } from "@/lib/types";
import { Button, Card, Loading, Toggle } from "./ui";
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
          <p className="subtitle">Guard mode</p>
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
      <p className="subtitle">Результат проверки</p>
      <label className="option">
        <input
          type="checkbox"
          checked={policy.passApprove}
          onChange={(e) => setPolicy({ passApprove: e.target.checked })}
        />
        Авто-одобрение при успехе
      </label>
      <label className="option">
        <input
          type="checkbox"
          checked={policy.failDecline}
          onChange={(e) => setPolicy({ failDecline: e.target.checked })}
        />
        Авто-отклонение при провале
      </label>
      <label className="option">
        <input
          type="checkbox"
          checked={useThreshold}
          onChange={(e) => setPolicy({ queueThreshold: e.target.checked ? 60 : null })}
        />
        Очередь при пороговом результате
      </label>
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
      <p className="subtitle">Время на прохождение</p>
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
      <p className="subtitle">Кулдаун после отказа</p>
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
  useEffect(() => {
    api.get<{ entries: JournalEntry[] }>(`/api/owner/groups/${chatId}/journal`).then((d) => setEntries(d.entries));
  }, [chatId]);

  if (!entries) return <Loading />;
  if (entries.length === 0)
    return (
      <Card>
        <p className="hint">Журнал пуст.</p>
      </Card>
    );

  return (
    <div className="col">
      {entries.map((e) => (
        <Card key={e.id}>
          <div className="row">
            <p className="subtitle">
              {e.applicantUsername ? `@${e.applicantUsername}` : e.applicantName ?? e.applicantUserId}
            </p>
            <span className={`pill ${e.decision}`}>{decisionLabel[e.decision] ?? e.decision}</span>
          </div>
          <p className="hint">
            {new Date(e.finishedAt).toLocaleString("ru-RU")}
            {e.score != null ? ` · балл ${e.score}` : ""}
          </p>
          {e.reason ? <p className="hint">{e.reason}</p> : null}
        </Card>
      ))}
    </div>
  );
}
