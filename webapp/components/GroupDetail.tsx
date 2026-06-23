"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { openExternal, getInitData } from "@/lib/telegram";
import { t, tDyn } from "@/lib/i18n";
import type { Group, JournalEntry, QuizConfig, ResultPolicy, ScenarioBlock } from "@/lib/types";
import { Avatar, Button, Card, Loading, Toggle, InfoTip } from "./ui";
import { ExternalIcon, ArrowDownIcon, ArrowUpIcon } from "./icons";
import { ScenarioBuilder } from "./ScenarioBuilder";
import { Preview } from "./Preview";

type Tab = "scenario" | "settings" | "queue" | "journal";

function decLabel(d: string): string {
  if (d === "approve") return t("dec_approve");
  if (d === "decline") return t("dec_decline");
  if (d === "queue") return t("dec_queue");
  if (d === "timeout") return t("dec_timeout");
  return d;
}

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
    // Every quiz question must have at least one correct answer.
    const quizBad = blocks.some(
      (b) =>
        b.type === "quiz" &&
        ((b.config as QuizConfig).questions ?? []).some((q) => !(q.correct && q.correct.length > 0))
    );
    if (quizBad) {
      setStatus(t("quiz_no_correct"));
      return;
    }
    setSaving(true);
    setStatus("");
    try {
      await api.put(`/api/owner/groups/${chatId}/scenario`, {
        blocks: blocks.map((b) => ({ type: b.type, config: b.config })),
      });
      setStatus(t("st_scenario_saved"));
    } catch (e) {
      setStatus((e as ApiError).message || t("save_error"));
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
        welcomeEnabled: group.welcomeEnabled,
        welcomeText: group.welcomeText,
        welcomeDeleteSeconds: group.welcomeDeleteSeconds,
        allowEditAnswers: group.allowEditAnswers,
      });
      setGroup(res.group);
      setStatus(t("st_settings_saved"));
    } catch (e) {
      setStatus((e as ApiError).message || t("save_error"));
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
          {t("back")}
        </Button>
        <p className="subtitle">{group.title ?? group.chatId}</p>
      </div>

      {chatUsername ? (
        <Button variant="secondary" onClick={() => openExternal(`https://t.me/${chatUsername}`)}>
          <span className="btn-icon">
            <ExternalIcon size={18} /> {t("go_to_group")}
          </span>
        </Button>
      ) : null}

      <Card>
        <div className="row">
          <span className="icon-row">
            <p className="subtitle">{t("guard_mode")}</p>
            <InfoTip text={t("tip_guard")} />
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

      <div className="group-tabs">
        <Button small variant={tab === "scenario" ? "primary" : "secondary"} onClick={() => setTab("scenario")}>
          {t("gd_scenario")}
        </Button>
        <Button small variant={tab === "settings" ? "primary" : "secondary"} onClick={() => setTab("settings")}>
          {t("gd_settings")}
        </Button>
        <Button small variant={tab === "queue" ? "primary" : "secondary"} onClick={() => setTab("queue")}>
          {t("queue_title")}
        </Button>
        <Button small variant={tab === "journal" ? "primary" : "secondary"} onClick={() => setTab("journal")}>
          {t("gd_journal")}
        </Button>
      </div>

      {status ? <p className="hint">{status}</p> : null}

      {tab === "scenario" ? (
        <>
          <ScenarioBuilder blocks={blocks} onChange={setBlocks} />
          <Button variant="secondary" onClick={() => setPreview(true)}>
            {t("btn_preview")}
          </Button>
          <Button disabled={saving} onClick={saveScenario}>
            {t("btn_save_scenario")}
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

      {tab === "queue" ? <QueueList chatId={chatId} /> : null}

      {tab === "journal" ? (
        <>
          <StatsCard chatId={chatId} />
          <JournalList chatId={chatId} highlightUserId={initialJournalUserId} />
          <GroupBansCard chatId={chatId} />
        </>
      ) : null}
    </div>
  );
}

interface SetupReport {
  items: { key: string; ok: boolean }[];
  ok: boolean;
}

// On-demand diagnostics so the owner can see why guard might do nothing. Each
// failing item shows a localized "how to fix" hint.
function SetupCheck({ chatId }: { chatId: string }) {
  const [report, setReport] = useState<SetupReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState(false);

  const run = async () => {
    setBusy(true);
    setErr("");
    try {
      setReport(await api.get<SetupReport>(`/api/owner/groups/${chatId}/check`));
    } catch (e) {
      setErr((e as ApiError).message || t("st_check_failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <button className="journal-head" onClick={() => setOpen((v) => !v)}>
        <span className="list-item-title">{t("checklist_title")}</span>
        {open ? <ArrowUpIcon size={18} /> : <ArrowDownIcon size={18} />}
      </button>
      {open ? (
        <>
          <Button small variant="secondary" disabled={busy} onClick={run}>
            {t("check_run")}
          </Button>
          {err ? <p className="hint">{err}</p> : null}
          {report ? (
            <div className="col" style={{ gap: 8, marginTop: 8 }}>
              {report.items.map((it) => (
                <div className="col" key={it.key} style={{ gap: 2 }}>
                  <div className="row">
                    <span className="hint">{tDyn(`check_${it.key}`)}</span>
                    <span className={`pill ${it.ok ? "approve" : "decline"}`}>
                      {it.ok ? t("check_ok") : t("check_bad")}
                    </span>
                  </div>
                  {!it.ok ? <p className="hint">{tDyn(`fix_${it.key}`)}</p> : null}
                </div>
              ))}
              {report.ok ? <p className="hint">{t("check_all_ok")}</p> : null}
            </div>
          ) : null}
        </>
      ) : null}
    </Card>
  );
}

interface GroupStats {
  period: string;
  total: number;
  approve: number;
  decline: number;
  queue: number;
  timeout: number;
  conversion: number;
}

type Period = "today" | "7d" | "all";

function StatsCard({ chatId }: { chatId: string }) {
  const [stats, setStats] = useState<GroupStats | null>(null);
  const [period, setPeriod] = useState<Period>("all");
  useEffect(() => {
    api
      .get<GroupStats>(`/api/owner/groups/${chatId}/stats?period=${period}`)
      .then(setStats)
      .catch(() => undefined);
  }, [chatId, period]);

  const rows: [string, number | string][] = stats
    ? [
        [t("stat_total"), stats.total],
        [t("stat_approve"), stats.approve],
        [t("stat_decline"), stats.decline],
        [t("stat_queue"), stats.queue],
        [t("stat_timeout"), stats.timeout],
        [t("stat_conversion"), `${stats.conversion}%`],
      ]
    : [];

  return (
    <Card>
      <p className="subtitle">{t("stats_title")}</p>
      <div className="row" style={{ gap: 8 }}>
        {(["today", "7d", "all"] as Period[]).map((p) => (
          <Button
            key={p}
            small
            variant={period === p ? "primary" : "secondary"}
            onClick={() => setPeriod(p)}
          >
            {p === "today" ? t("period_today") : p === "7d" ? t("period_7d") : t("period_all")}
          </Button>
        ))}
      </div>
      {stats
        ? rows.map(([label, value]) => (
            <div className="row" key={label}>
              <span className="hint">{label}</span>
              <span>{value}</span>
            </div>
          ))
        : null}
    </Card>
  );
}

interface QueueItem {
  id: string;
  kind: "voice" | "pending";
  applicantUserId: string;
  applicantUsername: string | null;
  applicantName: string | null;
  createdAt: string;
}

function QueueList({ chatId }: { chatId: string }) {
  const [items, setItems] = useState<QueueItem[] | null>(null);
  const [busy, setBusy] = useState<string>("");

  const load = () =>
    api.get<{ items: QueueItem[] }>(`/api/owner/groups/${chatId}/queue`).then((d) => setItems(d.items));
  useEffect(() => {
    load();
  }, [chatId]);

  const decide = async (item: QueueItem, decision: "approve" | "decline") => {
    setBusy(item.id);
    try {
      await api.post(`/api/owner/groups/${chatId}/queue/decision`, {
        kind: item.kind,
        id: item.id,
        decision,
      });
      await load();
    } catch {
      // ignore; the list reload reflects the real state
    } finally {
      setBusy("");
    }
  };

  const banInGroup = async (item: QueueItem) => {
    setBusy(item.id);
    try {
      await api.post(`/api/owner/groups/${chatId}/bans`, {
        userId: item.applicantUserId,
        username: item.applicantUsername ?? undefined,
        name: item.applicantName ?? undefined,
      });
      await api.post(`/api/owner/groups/${chatId}/queue/decision`, {
        kind: item.kind,
        id: item.id,
        decision: "decline",
      });
      await load();
    } catch {
      // ignore
    } finally {
      setBusy("");
    }
  };

  if (!items) return <Loading />;
  if (items.length === 0)
    return (
      <Card>
        <p className="hint center">{t("queue_empty")}</p>
      </Card>
    );

  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

  return (
    <div className="col">
      {items.map((item) => {
        const name = item.applicantUsername
          ? `@${item.applicantUsername}`
          : item.applicantName ?? item.applicantUserId;
        const voiceUrl =
          item.kind === "voice" && apiBase
            ? `${apiBase}/api/owner/groups/${chatId}/queue/voice/${item.id}?i=${encodeURIComponent(getInitData())}`
            : null;
        return (
          <Card key={`${item.kind}:${item.id}`}>
            <div className="row">
              <Avatar name={item.applicantName ?? item.applicantUsername ?? undefined} size={36} />
              <span className="list-item-title">{name}</span>
              <span className="pill">{item.kind === "voice" ? t("queue_voice") : t("queue_pending")}</span>
            </div>
            {voiceUrl ? (
              // eslint-disable-next-line jsx-a11y/media-has-caption
              <audio controls preload="none" src={voiceUrl} style={{ width: "100%", marginTop: 6 }} />
            ) : null}
            <div className="row" style={{ gap: 8, marginTop: 8 }}>
              <Button small disabled={busy === item.id} onClick={() => decide(item, "approve")}>
                {t("accept")}
              </Button>
              <Button
                small
                variant="secondary"
                disabled={busy === item.id}
                onClick={() => decide(item, "decline")}
              >
                {t("reject")}
              </Button>
              <Button
                small
                variant="danger"
                disabled={busy === item.id}
                onClick={() => banInGroup(item)}
              >
                {t("groupban_in_group")}
              </Button>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

interface GroupBan {
  userId: string;
  username: string | null;
  name: string | null;
  reason: string | null;
  createdAt: string;
}

function GroupBansCard({ chatId }: { chatId: string }) {
  const [bans, setBans] = useState<GroupBan[] | null>(null);
  const load = () =>
    api.get<{ bans: GroupBan[] }>(`/api/owner/groups/${chatId}/bans`).then((d) => setBans(d.bans));
  useEffect(() => {
    load();
  }, [chatId]);

  const unban = async (userId: string) => {
    try {
      await api.delete(`/api/owner/groups/${chatId}/bans/${userId}`);
    } catch {
      // ignore
    }
    await load();
  };

  if (!bans) return null;
  return (
    <Card>
      <p className="subtitle">{t("groupban_title")}</p>
      {bans.length === 0 ? (
        <p className="hint center">{t("groupban_empty")}</p>
      ) : (
        bans.map((b) => (
          <div className="row" key={b.userId}>
            <span className="hint">
              {b.username ? `@${b.username}` : b.name ?? b.userId}
              {b.reason ? ` · ${b.reason}` : ""}
            </span>
            <Button small variant="secondary" onClick={() => unban(b.userId)}>
              {t("unban")}
            </Button>
          </div>
        ))
      )}
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
      setEmojiMsg(clear ? t("emoji_cleared") : t("emoji_saved"));
    } catch (e) {
      setEmojiMsg((e as ApiError).message || t("emoji_failed"));
    } finally {
      setEmojiBusy(false);
    }
  };

  return (
    <Card>
      <span className="icon-row">
        <p className="subtitle">{t("res_title")}</p>
        <InfoTip text={t("tip_result")} />
      </span>
      <div className="row">
        <span>{t("res_auto_approve")}</span>
        <Toggle checked={policy.passApprove} onChange={(v) => setPolicy({ passApprove: v })} />
      </div>
      <div className="row">
        <span>{t("res_auto_decline")}</span>
        <Toggle checked={policy.failDecline} onChange={(v) => setPolicy({ failDecline: v })} />
      </div>
      <div className="row">
        <span>{t("res_queue_threshold")}</span>
        <Toggle
          checked={useThreshold}
          onChange={(v) => setPolicy({ queueThreshold: v ? 60 : null })}
        />
      </div>
      {useThreshold ? (
        <div className="col">
          <label className="hint">{t("res_threshold")}</label>
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
        <p className="subtitle">{t("timeout_title")}</p>
        <InfoTip text={t("tip_time")} />
      </span>
      <input
        className="field"
        inputMode="numeric"
        placeholder={t("secs_ph")}
        value={String(group.timeoutSeconds)}
        onChange={(e) => setGroup({ ...group, timeoutSeconds: Math.max(30, Number(e.target.value) || 600) })}
      />
      <select
        className="field"
        value={group.timeoutAction}
        onChange={(e) => setGroup({ ...group, timeoutAction: e.target.value as "queue" | "decline" })}
      >
        <option value="queue">{t("timeout_queue")}</option>
        <option value="decline">{t("timeout_decline")}</option>
      </select>

      <div className="divider" />
      <span className="icon-row">
        <p className="subtitle">{t("cooldown_title")}</p>
        <InfoTip text={t("tip_cooldown")} />
      </span>
      <input
        className="field"
        inputMode="numeric"
        placeholder={t("secs_off_ph")}
        value={String(group.cooldownSeconds ?? 0)}
        onChange={(e) =>
          setGroup({ ...group, cooldownSeconds: Math.max(0, Number(e.target.value) || 0) })
        }
      />

      <div className="divider" />
      <div className="row">
        <span className="icon-row">
          <span>{t("allow_edit_title")}</span>
          <InfoTip text={t("tip_allow_edit")} />
        </span>
        <Toggle
          checked={group.allowEditAnswers}
          onChange={(v) => setGroup({ ...group, allowEditAnswers: v })}
        />
      </div>

      <div className="divider" />
      <div className="row">
        <span className="icon-row">
          <span>{t("voice_set_title")}</span>
          <InfoTip text={t("tip_voice")} />
        </span>
        <Toggle
          checked={group.voiceScreening}
          onChange={(v) => setGroup({ ...group, voiceScreening: v })}
        />
      </div>
      {group.voiceScreening ? (
        <textarea
          className="field"
          placeholder={t("voice_prompt_ph")}
          value={group.voicePrompt ?? ""}
          onChange={(e) => setGroup({ ...group, voicePrompt: e.target.value })}
        />
      ) : null}

      <div className="divider" />
      <span className="icon-row">
        <p className="subtitle">{t("emoji_title")}</p>
        {!premium ? <span className="pill">{t("paid_badge")}</span> : null}
        <InfoTip text={t("tip_emoji")} />
      </span>
      {premium ? (
        <div className="col">
          <p className="center">
            <span className={`pill ${group.emojiStatusId ? "approve" : ""}`}>
              {group.emojiStatusId ? t("emoji_set") : t("emoji_unset")}
            </span>
          </p>
          <Button
            small
            variant="secondary"
            disabled={emojiBusy}
            onClick={() => setMyEmojiStatus(false)}
          >
            {t("emoji_use_current")}
          </Button>
          {group.emojiStatusId ? (
            <Button small variant="danger" disabled={emojiBusy} onClick={() => setMyEmojiStatus(true)}>
              {t("emoji_reset")}
            </Button>
          ) : null}
          {emojiMsg ? <p className="hint center">{emojiMsg}</p> : null}
        </div>
      ) : null}

      <div className="divider" />
      <div className="row">
        <span className="icon-row">
          <span>{t("welcome_title")}</span>
          <InfoTip text={t("tip_welcome")} />
        </span>
        <Toggle
          checked={group.welcomeEnabled}
          onChange={(v) => setGroup({ ...group, welcomeEnabled: v })}
        />
      </div>
      {group.welcomeEnabled ? (
        <div className="col">
          <textarea
            className="field"
            placeholder={t("welcome_text_ph")}
            value={group.welcomeText ?? ""}
            onChange={(e) => setGroup({ ...group, welcomeText: e.target.value })}
          />
          <input
            className="field"
            inputMode="numeric"
            placeholder={t("welcome_delete_ph")}
            value={group.welcomeDeleteSeconds == null ? "" : String(group.welcomeDeleteSeconds)}
            onChange={(e) => {
              const v = e.target.value.trim();
              setGroup({
                ...group,
                welcomeDeleteSeconds: v === "" ? null : Math.max(0, Number(v) || 0),
              });
            }}
          />
        </div>
      ) : null}

      <Button disabled={saving} onClick={onSave}>
        {t("save")}
      </Button>
    </Card>
  );
}

function JournalList({
  chatId,
  highlightUserId,
}: {
  chatId: string;
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
        <p className="hint center">{t("journal_empty")}</p>
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
              <span className={`pill ${e.decision}`}>{decLabel(e.decision)}</span>
            </button>
            {expanded ? (
              <div className="col" style={{ gap: 6 }}>
                <div className="divider" />
                {e.applicantName ? <p className="hint">{t("j_name")}: {e.applicantName}</p> : null}
                {e.applicantUsername ? <p className="hint">Username: @{e.applicantUsername}</p> : null}
                <p className="hint">ID: {e.applicantUserId}</p>
                <p className="hint">{t("j_when")}: {new Date(e.finishedAt).toLocaleString()}</p>
                {e.score != null ? <p className="hint">{t("j_score")}: {e.score}</p> : null}
                {e.reason ? <p className="hint">{t("j_reason")}: {e.reason}</p> : null}
                {e.applicantUsername ? (
                  <Button
                    small
                    variant="secondary"
                    onClick={() => openExternal(`https://t.me/${e.applicantUsername}`)}
                  >
                    {t("view_profile")}
                  </Button>
                ) : null}
                <Button
                  small
                  variant="danger"
                  onClick={async () => {
                    await api
                      .post(`/api/owner/groups/${chatId}/bans`, {
                        userId: e.applicantUserId,
                        username: e.applicantUsername ?? undefined,
                        name: e.applicantName ?? undefined,
                      })
                      .catch(() => undefined);
                  }}
                >
                  {t("groupban_in_group")}
                </Button>
              </div>
            ) : (
              <p className="hint">
                {new Date(e.finishedAt).toLocaleString("ru-RU")}
                {e.score != null ? ` · ${t("score_short")} ${e.score}` : ""}
              </p>
            )}
          </Card>
        );
      })}
    </div>
  );
}
