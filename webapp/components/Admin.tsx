"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { getInitData } from "@/lib/telegram";
import { Button, Card } from "./ui";
import { StarIcon } from "./icons";

interface Stats {
  owners: number;
  users: number;
  totalGroups: number;
  activeGroups: number;
  paidBundles: number;
  paidSlots: number;
  revenueByCurrency: Record<string, number>;
}

interface Banned {
  userId: string;
  reason: string | null;
  createdAt: string;
}

interface Appeal {
  id: string;
  userId: string;
  username: string | null;
  name: string | null;
  text: string;
  hasPhoto: boolean;
  createdAt: string;
}

interface SearchResult {
  user: {
    id: string;
    username: string | null;
    firstName: string | null;
    startedAt: string;
    manualExtraSlots: number;
  } | null;
  groups: { chatId: string; title: string | null; guardEnabled: boolean }[];
  banned: boolean;
  payments: { amount: string; currency: string; slotsAdded: number; paidAt: string | null }[];
}

function AppealPhoto({ appealId }: { appealId: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    const base = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";
    let objectUrl: string | null = null;
    fetch(`${base}/api/admin/appeals/${appealId}/photo`, {
      headers: { "X-Telegram-Init-Data": getInitData() },
    })
      .then((r) => (r.ok ? r.blob() : null))
      .then((blob) => {
        if (!blob) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      })
      .catch(() => undefined);
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [appealId]);
  if (!src) return null;
  return (
    <div className="appeal-photo-wrap">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" className="appeal-photo-preview" />
    </div>
  );
}

// Operator-only admin content, rendered inside the bottom-nav "Админ" tab.
export function AdminPanel() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [userId, setUserId] = useState("");
  const [slots, setSlots] = useState("3");
  const [status, setStatus] = useState("");

  const [banId, setBanId] = useState("");
  const [banReason, setBanReason] = useState("");
  const [banStatus, setBanStatus] = useState("");
  const [banned, setBanned] = useState<Banned[]>([]);
  const [appeals, setAppeals] = useState<Appeal[]>([]);
  const [appealStatus, setAppealStatus] = useState("");

  const [feed, setFeed] = useState<{ kind: string; at: string; text: string }[]>([]);
  const [searchId, setSearchId] = useState("");
  const [searchRes, setSearchRes] = useState<SearchResult | null>(null);
  const [searchErr, setSearchErr] = useState("");
  const [bcText, setBcText] = useState("");
  const [bcStatus, setBcStatus] = useState("");

  const load = () => api.get<Stats>("/api/admin/stats").then(setStats);
  const loadBanned = () =>
    api.get<{ banned: Banned[] }>("/api/admin/banned").then((r) => setBanned(r.banned));
  const loadAppeals = () =>
    api.get<{ appeals: Appeal[] }>("/api/admin/appeals").then((r) => setAppeals(r.appeals));
  const loadFeed = () =>
    api.get<{ items: { kind: string; at: string; text: string }[] }>("/api/admin/feed").then((r) => setFeed(r.items));
  useEffect(() => {
    load();
    loadBanned();
    loadAppeals();
    loadFeed();
  }, []);

  const searchUser = async () => {
    setSearchErr("");
    setSearchRes(null);
    if (!/^\d+$/.test(searchId)) {
      setSearchErr("Введите числовой id.");
      return;
    }
    try {
      setSearchRes(await api.get<SearchResult>(`/api/admin/user/${searchId}`));
    } catch (e) {
      setSearchErr((e as ApiError).message || "Ошибка.");
    }
  };

  const sendBroadcast = async () => {
    setBcStatus("");
    if (!bcText.trim()) return;
    try {
      const r = await api.post<{ started: number }>("/api/admin/broadcast", { text: bcText });
      setBcStatus(`Рассылка запущена: ${r.started} получателей.`);
      setBcText("");
    } catch (e) {
      setBcStatus((e as ApiError).message || "Ошибка.");
    }
  };

  const grant = async () => {
    setStatus("");
    try {
      await api.post("/api/admin/grant-slots", { userId, slots: Number(slots) });
      setStatus("Слоты выданы.");
      setUserId("");
      load();
    } catch (e) {
      setStatus((e as ApiError).message || "Ошибка.");
    }
  };

  const ban = async () => {
    setBanStatus("");
    try {
      const r = await api.post<{ groupsLeft: number }>("/api/admin/ban", {
        userId: banId,
        reason: banReason,
      });
      setBanStatus(
        r.groupsLeft > 0 ? `Забанен. Бот вышел из групп: ${r.groupsLeft}.` : "Забанен."
      );
      setBanId("");
      setBanReason("");
      loadBanned();
    } catch (e) {
      setBanStatus((e as ApiError).message || "Ошибка.");
    }
  };

  const unban = async (id: string) => {
    try {
      await api.post("/api/admin/unban", { userId: id });
      loadBanned();
    } catch (e) {
      setBanStatus((e as ApiError).message || "Ошибка.");
    }
  };

  const resolveAppeal = async (id: string, action: "approve" | "reject") => {
    setAppealStatus("");
    try {
      await api.post(`/api/admin/appeals/${id}/${action}`);
      setAppealStatus(action === "approve" ? "Апелляция одобрена." : "Апелляция отклонена.");
      loadAppeals();
      loadBanned();
    } catch (e) {
      setAppealStatus((e as ApiError).message || "Ошибка.");
    }
  };

  const revenue = stats
    ? Object.entries(stats.revenueByCurrency)
        .map(([cur, amt]) => `${amt.toFixed(2)} ${cur}`)
        .join(", ")
    : "";

  return (
    <>
      <Card>
        <p className="subtitle center">Поиск пользователя</p>
        <div className="row" style={{ gap: 8 }}>
          <input
            className="field"
            inputMode="numeric"
            placeholder="user_id"
            value={searchId}
            onChange={(e) => setSearchId(e.target.value)}
          />
          <Button small onClick={searchUser}>
            Найти
          </Button>
        </div>
        {searchErr ? <p className="hint center">{searchErr}</p> : null}
        {searchRes ? (
          <div className="col" style={{ gap: 4 }}>
            <p className="hint">
              {searchRes.user
                ? `${searchRes.user.username ? "@" + searchRes.user.username : searchRes.user.firstName ?? ""} · id ${searchRes.user.id}`
                : "Пользователь не запускал бота"}
            </p>
            <p className="hint">Бан: {searchRes.banned ? "да" : "нет"}</p>
            <p className="hint">Групп: {searchRes.groups.length}</p>
            {searchRes.groups.map((g) => (
              <p className="hint" key={g.chatId}>
                {g.title ?? g.chatId} · {g.guardEnabled ? "guard вкл" : "guard выкл"}
              </p>
            ))}
            <p className="hint">Оплат: {searchRes.payments.length}</p>
            <div className="row" style={{ gap: 8 }}>
              <Button
                small
                onClick={() => {
                  setUserId(searchId);
                }}
              >
                Выдать слоты
              </Button>
              {searchRes.banned ? (
                <Button small variant="secondary" onClick={() => unban(searchId)}>
                  Разбанить
                </Button>
              ) : (
                <Button
                  small
                  variant="danger"
                  onClick={() => {
                    setBanId(searchId);
                  }}
                >
                  В бан
                </Button>
              )}
            </div>
          </div>
        ) : null}
      </Card>

      <Card>
        <p className="subtitle center">Рассылка всем</p>
        <textarea
          className="field"
          placeholder="Текст рассылки"
          value={bcText}
          onChange={(e) => setBcText(e.target.value)}
        />
        <Button disabled={!bcText.trim()} onClick={sendBroadcast}>
          Отправить всем
        </Button>
        {bcStatus ? <p className="hint center">{bcStatus}</p> : null}
      </Card>

      <Card>
        <p className="subtitle center">Лента событий</p>
        {feed.length === 0 ? (
          <p className="hint center">Событий пока нет</p>
        ) : (
          feed.map((it, i) => (
            <div className="row" key={i}>
              <span className="hint">{it.text}</span>
              <span className="hint">{new Date(it.at).toLocaleString("ru-RU")}</span>
            </div>
          ))
        )}
        <button className="link-btn" onClick={loadFeed}>
          Обновить
        </button>
      </Card>

      <div className="section-header">
        <span className="section-icon">
          <StarIcon />
        </span>
        <p className="subtitle">Статистика</p>
      </div>

      <Card>
        {!stats ? (
          <p className="hint center">Загрузка</p>
        ) : (
          <>
            <div className="row">
              <span className="hint">Владельцев</span>
              <span>{stats.owners}</span>
            </div>
            <div className="row">
              <span className="hint">Пользователей</span>
              <span>{stats.users}</span>
            </div>
            <div className="row">
              <span className="hint">Групп активных / всего</span>
              <span>
                {stats.activeGroups} / {stats.totalGroups}
              </span>
            </div>
            <div className="row">
              <span className="hint">Платных бандлов</span>
              <span>{stats.paidBundles}</span>
            </div>
            <div className="row">
              <span className="hint">Платных слотов</span>
              <span>{stats.paidSlots}</span>
            </div>
            <div className="row">
              <span className="hint">Доход</span>
              <span>{revenue || "0"}</span>
            </div>
          </>
        )}
      </Card>

      <Card>
        <p className="subtitle center">Выдать слоты вручную</p>
        <input
          className="field center"
          inputMode="numeric"
          placeholder="user_id"
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
        />
        <input
          className="field center"
          inputMode="numeric"
          placeholder="Количество слотов"
          value={slots}
          onChange={(e) => setSlots(e.target.value)}
        />
        <Button disabled={!userId} onClick={grant}>
          Выдать
        </Button>
        {status ? <p className="hint center">{status}</p> : null}
      </Card>

      <Card>
        <p className="subtitle center">Бан пользователя</p>
        <input
          className="field center"
          inputMode="numeric"
          placeholder="user_id"
          value={banId}
          onChange={(e) => setBanId(e.target.value)}
        />
        <input
          className="field center"
          placeholder="Причина (необязательно)"
          value={banReason}
          onChange={(e) => setBanReason(e.target.value)}
        />
        <Button variant="danger" disabled={!banId} onClick={ban}>
          Забанить
        </Button>
        {banStatus ? <p className="hint center">{banStatus}</p> : null}
      </Card>

      <Card>
        <p className="subtitle center">Апелляции</p>
        {appealStatus ? <p className="hint center">{appealStatus}</p> : null}
        {appeals.length === 0 ? (
          <p className="hint center">Нет ожидающих апелляций</p>
        ) : (
          appeals.map((a) => {
            const who = a.username ? `@${a.username}` : a.name ?? a.userId;
            return (
              <Card key={a.id}>
                <p className="subtitle">{who}</p>
                <p className="hint">id: {a.userId}</p>
                <p className="hint">{a.text}</p>
                {a.hasPhoto ? <AppealPhoto appealId={a.id} /> : null}
                <div className="row">
                  <Button small onClick={() => resolveAppeal(a.id, "approve")}>
                    Одобрить
                  </Button>
                  <Button small variant="danger" onClick={() => resolveAppeal(a.id, "reject")}>
                    Отклонить
                  </Button>
                </div>
              </Card>
            );
          })
        )}
      </Card>

      <Card>
        <p className="subtitle center">Забаненные</p>
        {banned.length === 0 ? (
          <p className="hint center">Список пуст</p>
        ) : (
          banned.map((b) => (
            <div className="row" key={b.userId}>
              <span className="hint">
                {b.userId}
                {b.reason ? ` · ${b.reason}` : ""}
              </span>
              <Button variant="secondary" onClick={() => unban(b.userId)}>
                Разбанить
              </Button>
            </div>
          ))
        )}
      </Card>
    </>
  );
}
