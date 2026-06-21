"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { openExternal } from "@/lib/telegram";
import type { Group, QuotaStatus } from "@/lib/types";
import { Button, Card, Loading } from "./ui";
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
  return <Home onOpenGroup={(chatId) => setView({ name: "group", chatId })} onOpenAdmin={() => setView({ name: "admin" })} />;
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
    load().finally(() => setLoading(false));
  }, []);

  if (loading || !quota) return <Loading />;

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
      if (res.payUrl) openExternal(res.payUrl);
    } catch (e) {
      setError((e as ApiError).message || "Оплата недоступна.");
    } finally {
      setBuying(false);
    }
  };

  return (
    <div className="app">
      <Card>
        <p className="title">Группы</p>
        <div className="row">
          <span className="hint">Использовано</span>
          <span>
            {quota.usedGroups}
            {quota.unlimited ? "" : ` / ${quota.totalSlots}`}
          </span>
        </div>
        {!quota.unlimited ? (
          <Button variant="secondary" disabled={buying} onClick={buySlots}>
            Купить +3 группы (3.99$)
          </Button>
        ) : (
          <span className="pill">Безлимит</span>
        )}
      </Card>

      <div className="col">
        {groups.length === 0 ? (
          <Card>
            <p className="hint">Групп пока нет. Добавьте первую ниже.</p>
          </Card>
        ) : (
          groups.map((g) => (
            <Card key={g.chatId}>
              <div className="row" onClick={() => onOpenGroup(g.chatId)} style={{ cursor: "pointer" }}>
                <div>
                  <p className="subtitle">{g.title ?? g.chatId}</p>
                  <p className="hint">
                    {g.guardEnabled ? "Guard включён" : "Guard выключен"} · блоков: {g._count?.blocks ?? 0}
                  </p>
                </div>
                <span className="pill">Открыть</span>
              </div>
            </Card>
          ))
        )}
      </div>

      <Card>
        <p className="subtitle">Добавить группу</p>
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
        {error ? <p className="hint" style={{ color: "var(--tg-destructive)" }}>{error}</p> : null}
      </Card>

      {isOperator ? (
        <Button variant="secondary" onClick={onOpenAdmin}>
          Админ-панель
        </Button>
      ) : null}
    </div>
  );
}
