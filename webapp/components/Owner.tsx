"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { openExternal, getProfile } from "@/lib/telegram";
import { GIF } from "@/lib/assets";
import type { Group, QuotaStatus } from "@/lib/types";
import { Avatar, Button, Card, Loading, StateGif } from "./ui";
import { UsersIcon, PlusIcon, CoinIcon, StarIcon, ShieldIcon } from "./icons";
import { GroupDetail } from "./GroupDetail";
import { Admin } from "./Admin";

type View = { name: "home" } | { name: "group"; chatId: string } | { name: "admin" };

export function OwnerApp() {
  const [view, setView] = useState<View>({ name: "home" });

  if (view.name === "group") {
    return <GroupDetail chatId={view.chatId} onBack={() => setView({ name: "home" })} />;
  }
  if (view.name === "admin") {
    return <Admin onBack={() => setView({ name: "home" })} />;
  }
  return (
    <Home
      onOpenGroup={(chatId) => setView({ name: "group", chatId })}
      onOpenAdmin={() => setView({ name: "admin" })}
    />
  );
}

function Home({
  onOpenGroup,
  onOpenAdmin,
}: {
  onOpenGroup: (chatId: string) => void;
  onOpenAdmin: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState<Group[]>([]);
  const [quota, setQuota] = useState<QuotaStatus | null>(null);
  const [isOperator, setIsOperator] = useState(false);
  const [chat, setChat] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");
  const [buying, setBuying] = useState(false);
  const [awaitingPayment, setAwaitingPayment] = useState(false);
  const [checking, setChecking] = useState(false);
  const profile = getProfile();

  const load = async () => {
    const [g, q, me] = await Promise.all([
      api.get<{ groups: Group[] }>("/api/owner/groups"),
      api.get<QuotaStatus>("/api/owner/quota"),
      api.get<{ isOperator: boolean }>("/api/owner/me"),
    ]);
    setGroups(g.groups);
    setQuota(q);
    setIsOperator(me.isOperator);
  };

  useEffect(() => {
    // Credit any already-paid invoice on entry, then load.
    api
      .post("/api/payments/verify")
      .catch(() => undefined)
      .finally(() => load().finally(() => setLoading(false)));
  }, []);

  if (loading || !quota) return <Loading />;

  const profileName = [profile?.firstName, profile?.lastName].filter(Boolean).join(" ");

  const addGroup = async () => {
    setAdding(true);
    setError("");
    try {
      await api.post("/api/owner/groups", { chat: chat.trim() });
      setChat("");
      await load();
    } catch (e) {
      setError((e as ApiError).message || "Не удалось добавить группу.");
    } finally {
      setAdding(false);
    }
  };

  const buySlots = async () => {
    setBuying(true);
    setError("");
    try {
      const res = await api.post<{ payUrl: string }>("/api/payments/invoice");
      if (res.payUrl) {
        openExternal(res.payUrl);
        setAwaitingPayment(true);
      }
    } catch (e) {
      setError((e as ApiError).message || "Оплата недоступна.");
    } finally {
      setBuying(false);
    }
  };

  const checkPayment = async () => {
    setChecking(true);
    setError("");
    try {
      await api.post<{ credited: number }>("/api/payments/verify");
      await load();
      setAwaitingPayment(false);
    } catch (e) {
      setError((e as ApiError).message || "Не удалось проверить оплату.");
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="app">
      <Card>
        <div className="profile">
          <Avatar photoUrl={profile?.photoUrl} name={profileName} />
          <div>
            <p className="profile-name">{profileName || "Профиль"}</p>
            {profile?.username ? <p className="hint">@{profile.username}</p> : null}
          </div>
        </div>
        <div className="divider" />
        <div className="row">
          <span className="icon-row">
            <CoinIcon /> <span className="hint">Использовано</span>
          </span>
          <span>
            {quota.usedGroups}
            {quota.unlimited ? "" : ` / ${quota.totalSlots}`}
          </span>
        </div>
        {!quota.unlimited ? (
          <>
            <Button variant="secondary" disabled={buying} onClick={buySlots}>
              Купить +3 группы (3.99$)
            </Button>
            {awaitingPayment ? (
              <Button variant="secondary" disabled={checking} onClick={checkPayment}>
                Проверить оплату
              </Button>
            ) : null}
          </>
        ) : (
          <span className="pill">Безлимит</span>
        )}
      </Card>

      <div className="row">
        <span className="icon-row">
          <UsersIcon /> <p className="subtitle">Группы</p>
        </span>
      </div>

      <div className="col">
        {groups.length === 0 ? (
          <Card>
            <StateGif src={GIF.empty} alt="" />
            <p className="hint center">Групп пока нет. Добавьте первую ниже.</p>
          </Card>
        ) : (
          groups.map((g) => (
            <Card key={g.chatId}>
              <div
                className="row"
                onClick={() => onOpenGroup(g.chatId)}
                style={{ cursor: "pointer" }}
              >
                <div className="icon-row">
                  <ShieldIcon />
                  <div>
                    <p className="subtitle">{g.title ?? g.chatId}</p>
                    <p className="hint">
                      {g.guardEnabled ? "Guard включён" : "Guard выключен"} · блоков:{" "}
                      {g._count?.blocks ?? 0}
                    </p>
                  </div>
                </div>
                <span className="pill">Открыть</span>
              </div>
            </Card>
          ))
        )}
      </div>

      <Card>
        <span className="icon-row">
          <PlusIcon /> <p className="subtitle">Добавить группу</p>
        </span>
        <p className="hint">
          Добавьте бота в группу администратором с правом приглашать пользователей, затем укажите
          @username или id группы. Подключить может только владелец группы.
        </p>
        <input
          className="field"
          placeholder="@group_username или -100..."
          value={chat}
          onChange={(e) => setChat(e.target.value)}
        />
        <Button disabled={adding || !chat.trim()} onClick={addGroup}>
          Добавить
        </Button>
        {error ? (
          <p className="hint" style={{ color: "var(--tg-destructive)" }}>
            {error}
          </p>
        ) : null}
      </Card>

      {isOperator ? (
        <Button variant="secondary" onClick={onOpenAdmin}>
          <span className="icon-row" style={{ justifyContent: "center" }}>
            <StarIcon /> Админ-панель
          </span>
        </Button>
      ) : null}
    </div>
  );
}
