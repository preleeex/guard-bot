"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { openExternal, getProfile } from "@/lib/telegram";
import { ADD_TO_GROUP_LINK } from "@/lib/config";
import type { Group, QuotaStatus } from "@/lib/types";
import { Avatar, Button, Card, ErrorState, Loading, SectionHeader } from "./ui";
import { UsersIcon, PlusIcon, CoinIcon, StarIcon, ShieldIcon, GroupAddIcon } from "./icons";
import { GroupDetail } from "./GroupDetail";
import { Admin } from "./Admin";

type View = { name: "home" } | { name: "group"; chatId: string } | { name: "admin" };

interface HomeData {
  isOperator: boolean;
  quota: QuotaStatus;
  groups: Group[];
}

export function OwnerApp() {
  const [view, setView] = useState<View>({ name: "home" });
  const [data, setData] = useState<HomeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      setData(await api.get<HomeData>("/api/owner/home"));
    } catch (e) {
      setError((e as ApiError).message || "Не удалось загрузить.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    // Credit any already-paid invoice in the background.
    api
      .post<{ credited: number }>("/api/payments/verify")
      .then((r) => {
        if (r.credited > 0) load();
      })
      .catch(() => undefined);
  }, [load]);

  // Reload when returning to the Mini App (e.g. after adding the bot to a group)
  // so a freshly auto-connected group shows up without a manual refresh.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [load]);

  if (loading && !data) return <Loading />;
  if (error && !data)
    return (
      <ErrorState
        text={error}
        onRetry={() => {
          setLoading(true);
          load();
        }}
      />
    );

  if (view.name === "group") {
    return (
      <GroupDetail
        chatId={view.chatId}
        onBack={() => {
          setView({ name: "home" });
          load();
        }}
      />
    );
  }
  if (view.name === "admin") {
    return <Admin onBack={() => setView({ name: "home" })} />;
  }
  return (
    <Home
      data={data!}
      reload={load}
      onOpenGroup={(chatId) => setView({ name: "group", chatId })}
      onOpenAdmin={() => setView({ name: "admin" })}
    />
  );
}

function Home({
  data,
  reload,
  onOpenGroup,
  onOpenAdmin,
}: {
  data: HomeData;
  reload: () => Promise<void>;
  onOpenGroup: (chatId: string) => void;
  onOpenAdmin: () => void;
}) {
  const { quota, groups, isOperator } = data;
  const profile = getProfile();
  const profileName = [profile?.firstName, profile?.lastName].filter(Boolean).join(" ");

  const [chat, setChat] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");
  const [buying, setBuying] = useState(false);
  const [awaiting, setAwaiting] = useState(false);
  const [checking, setChecking] = useState(false);
  const [showManual, setShowManual] = useState(false);

  const addGroup = async () => {
    setAdding(true);
    setError("");
    try {
      await api.post("/api/owner/groups", { chat: chat.trim() });
      setChat("");
      await reload();
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
        setAwaiting(true);
      }
    } catch (e) {
      setError((e as ApiError).message || "Оплата недоступна.");
    } finally {
      setBuying(false);
    }
  };

  const checkPayment = async () => {
    setChecking(true);
    try {
      await api.post("/api/payments/verify");
      await reload();
      setAwaiting(false);
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="app">
      <Card>
        <div className="profile-center">
          <Avatar photoUrl={profile?.photoUrl} name={profileName} size={64} />
          <p className="profile-name">{profileName || "Профиль"}</p>
          {profile?.username ? <p className="hint">@{profile.username}</p> : null}
        </div>
      </Card>

      <Card>
        <SectionHeader icon={<CoinIcon />} title="Квота" />
        <p className="big-number center">
          {quota.usedGroups}
          {quota.unlimited ? "" : ` / ${quota.totalSlots}`}
        </p>
        {quota.unlimited ? (
          <p className="center">
            <span className="pill">Безлимит</span>
          </p>
        ) : (
          <>
            <Button variant="secondary" disabled={buying} onClick={buySlots}>
              Купить +3 группы, 3.99$
            </Button>
            {awaiting ? (
              <Button variant="secondary" disabled={checking} onClick={checkPayment}>
                Проверить оплату
              </Button>
            ) : null}
          </>
        )}
      </Card>

      <Card>
        <SectionHeader icon={<UsersIcon />} title="Группы" />
        <div className="col">
          {groups.length === 0 ? (
            <p className="hint center">Групп пока нет. Добавь бота в группу ниже.</p>
          ) : (
            groups.map((g) => (
              <button key={g.chatId} className="list-item" onClick={() => onOpenGroup(g.chatId)}>
                <span className="list-item-icon">
                  <ShieldIcon />
                </span>
                <span className="list-item-title">{g.title ?? g.chatId}</span>
                <span className={`pill ${g.guardEnabled ? "approve" : ""}`}>
                  {g.guardEnabled ? "вкл" : "выкл"}
                </span>
              </button>
            ))
          )}
        </div>
        <button className="link-btn" onClick={() => reload()}>
          Обновить
        </button>
      </Card>

      <Card>
        <SectionHeader icon={<GroupAddIcon />} title="Добавить группу" />
        <Button onClick={() => openExternal(ADD_TO_GROUP_LINK)}>
          <span className="btn-icon">
            <PlusIcon size={18} /> Добавить бота с правами админа
          </span>
        </Button>
        <p className="hint center">Выбери группу и подтверди права. Группа появится здесь сама.</p>
        {showManual ? (
          <>
            <input
              className="field center"
              placeholder="@username или id"
              value={chat}
              onChange={(e) => setChat(e.target.value)}
            />
            <Button variant="secondary" disabled={adding || !chat.trim()} onClick={addGroup}>
              Подключить
            </Button>
          </>
        ) : (
          <button className="link-btn" onClick={() => setShowManual(true)}>
            Подключить вручную
          </button>
        )}
        {error ? (
          <p className="hint center" style={{ color: "var(--tg-destructive)" }}>
            {error}
          </p>
        ) : null}
      </Card>

      {isOperator ? (
        <Card>
          <SectionHeader icon={<StarIcon />} title="Оператор" />
          <Button variant="secondary" onClick={onOpenAdmin}>
            Админ-панель
          </Button>
        </Card>
      ) : null}
    </div>
  );
}
