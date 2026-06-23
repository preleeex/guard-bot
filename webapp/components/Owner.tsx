"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { openExternal, getProfile, getInitData } from "@/lib/telegram";
import { ADD_TO_GROUP_LINK } from "@/lib/config";
import { t, setLang, initLang, getLang, type Lang } from "@/lib/i18n";
import { GIF } from "@/lib/assets";
import type { Group, QuotaStatus } from "@/lib/types";
import { Avatar, Button, Card, ErrorState, Loading, Message, SectionHeader, StateGif } from "./ui";
import { BannedScreen } from "./BannedScreen";
import { UsersIcon, PlusIcon, CoinIcon, StarIcon, ShieldIcon, GroupAddIcon, HelpIcon } from "./icons";
import { GroupDetail } from "./GroupDetail";
import { AdminPanel } from "./Admin";

type View = { name: "home" } | { name: "group"; chatId: string; journalUserId?: string };
type Tab = "groups" | "billing" | "admin" | "help";

interface Subscription {
  required: boolean;
  subscribed: boolean;
  username?: string;
  url?: string;
}

interface HomeData {
  isOperator: boolean;
  maintenance?: boolean;
  subscription?: Subscription;
  quota: QuotaStatus;
  groups: Group[];
  language?: string;
}

function SubscriptionGate({ sub, onCheck }: { sub: Subscription; onCheck: () => void }) {
  return (
    <div className="app">
      <Card>
        <p className="title center">{t("sub_title")}</p>
        <p className="hint center">{t("sub_panel_text")}</p>
        <Button onClick={() => sub.url && openExternal(sub.url)}>
          {t("open_channel")}{sub.username ? ` @${sub.username}` : ""}
        </Button>
        <Button variant="secondary" onClick={onCheck}>
          {t("check")}
        </Button>
      </Card>
    </div>
  );
}

export function OwnerApp({
  initialNav,
}: {
  initialNav?: { chatId: string; journalUserId?: string } | null;
}) {
  const [view, setView] = useState<View>(
    initialNav ? { name: "group", chatId: initialNav.chatId, journalUserId: initialNav.journalUserId } : { name: "home" }
  );
  const [data, setData] = useState<HomeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [banned, setBanned] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try {
      const home = await api.get<HomeData>(`/api/owner/home?lang=${getLang()}`);
      initLang(home.language);
      setData(home);
    } catch (e) {
      if ((e as ApiError).code === "banned") {
        setBanned(true);
        return;
      }
      setError((e as ApiError).message || t("st_load_failed"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    api
      .post<{ credited: number }>("/api/payments/verify")
      .then((r) => {
        if (r.credited > 0) load();
      })
      .catch(() => undefined);
  }, [load]);

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

  if (banned) return <BannedScreen />;
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

  // Maintenance: everyone except the operator sees a notice.
  if (data && data.maintenance && !data.isOperator) {
    return (
      <div className="app">
        <Card>
          <StateGif src={GIF.empty} alt="" />
          <p className="title center">{t("maint_title")}</p>
          <p className="hint center">{t("maint_text")}</p>
        </Card>
      </div>
    );
  }

  // Owner panel requires a subscription to the operator's channel.
  if (data && data.subscription?.required && !data.subscription.subscribed) {
    return (
      <SubscriptionGate
        sub={data.subscription}
        onCheck={() => {
          setLoading(true);
          load();
        }}
      />
    );
  }

  if (view.name === "group") {
    return (
      <GroupDetail
        chatId={view.chatId}
        initialJournalUserId={view.journalUserId}
        onBack={() => {
          setView({ name: "home" });
          load();
        }}
      />
    );
  }

  return <Home data={data!} reload={load} onOpenGroup={(chatId) => setView({ name: "group", chatId })} />;
}

function Home({
  data,
  reload,
  onOpenGroup,
}: {
  data: HomeData;
  reload: () => Promise<void>;
  onOpenGroup: (chatId: string) => void;
}) {
  const { quota, groups, isOperator } = data;
  const profile = getProfile();
  const profileName = [profile?.firstName, profile?.lastName].filter(Boolean).join(" ");
  // Telegram often omits photo_url in initData; fall back to the backend proxy
  // that fetches the user's real avatar via getUserProfilePhotos.
  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";
  const avatarUrl =
    profile?.photoUrl ||
    (apiBase ? `${apiBase}/api/owner/avatar?i=${encodeURIComponent(getInitData())}` : undefined);
  const [tab, setTab] = useState<Tab>("groups");

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
      setError((e as ApiError).message || t("st_add_failed"));
    } finally {
      setAdding(false);
    }
  };

  const buyPlan = async (plan: string) => {
    setBuying(true);
    setError("");
    try {
      const res = await api.post<{ payUrl: string }>("/api/payments/invoice", { plan });
      if (res.payUrl) {
        openExternal(res.payUrl);
        setAwaiting(true);
      }
    } catch (e) {
      setError((e as ApiError).message || t("st_pay_unavailable"));
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

  const switchLang = async (l: Lang) => {
    if (l === getLang()) return;
    setLang(l);
    try {
      await api.post("/api/owner/language", { language: l });
    } catch {
      // best effort: local choice still applies
    }
    window.location.reload();
  };

  return (
    <div className="app has-bottom-nav">
      <div className="profile-bar">
        <Avatar photoUrl={avatarUrl} name={profileName} size={40} />
        <div>
          <p className="profile-name" style={{ fontSize: 16 }}>
            {profileName || t("profile_default")}
          </p>
          {profile?.username ? <p className="hint">@{profile.username}</p> : null}
        </div>
      </div>

      {tab === "groups" ? (
        <>
          <Card>
            <SectionHeader icon={<UsersIcon />} title={t("nav_groups")} />
            <div className="col">
              {groups.length === 0 ? (
                <StateGif src={GIF.empty} alt="" />
              ) : (
                groups.map((g) => (
                  <button key={g.chatId} className="list-item" onClick={() => onOpenGroup(g.chatId)}>
                    <span className="list-item-icon">
                      <ShieldIcon />
                    </span>
                    <span className="list-item-title">{g.title ?? g.chatId}</span>
                    <span className={`pill ${g.guardEnabled ? "approve" : ""}`}>
                      {g.guardEnabled ? t("on_short") : t("off_short")}
                    </span>
                  </button>
                ))
              )}
            </div>
            <button className="link-btn" onClick={() => reload()}>
              {t("btn_refresh")}
            </button>
          </Card>

          <Card>
            <SectionHeader icon={<GroupAddIcon />} title={t("add_group_title")} />
            <Button onClick={() => openExternal(ADD_TO_GROUP_LINK)}>
              <span className="btn-icon">
                <PlusIcon size={18} /> {t("btn_add_bot_admin")}
              </span>
            </Button>
            {showManual ? (
              <>
                <input
                  className="field center"
                  placeholder={t("username_ph")}
                  value={chat}
                  onChange={(e) => setChat(e.target.value)}
                />
                <Button variant="secondary" disabled={adding || !chat.trim()} onClick={addGroup}>
                  {t("btn_connect")}
                </Button>
              </>
            ) : (
              <button className="link-btn" onClick={() => setShowManual(true)}>
                {t("btn_manual_connect")}
              </button>
            )}
            {error ? (
              <p className="hint center" style={{ color: "var(--tg-destructive)" }}>
                {error}
              </p>
            ) : null}
          </Card>
        </>
      ) : null}

      {tab === "billing" ? (
        <>
          <Card>
            <SectionHeader icon={<CoinIcon />} title={t("plan_your")} />
            <p className="big-number center">
              {quota.unlimited ? t("plan_unlimited") : `${quota.usedGroups} / ${quota.totalSlots}`}
            </p>
          </Card>

          {!quota.unlimited ? (
            <>
              <p className="subtitle center">{t("plan_change")}</p>
              {[
                {
                  key: "small",
                  title: t("plan_small"),
                  price: "2.99$",
                  perks: [t("perk_5groups"), t("perk_support_basic")],
                  best: false,
                },
                {
                  key: "big",
                  title: t("plan_big"),
                  price: "6.99$",
                  perks: [t("perk_15groups"), t("perk_priority_load"), t("perk_support_chat")],
                  best: true,
                },
                {
                  key: "unlimited",
                  title: t("plan_unlimited"),
                  price: "14.99$",
                  perks: [t("perk_unlim_groups"), t("perk_priority_max"), t("perk_support_24")],
                  best: false,
                },
              ].map((p) => (
                <button
                  key={p.key}
                  className={`plan-card ${p.best ? "best" : ""}`}
                  disabled={buying}
                  onClick={() => buyPlan(p.key)}
                >
                  <div className="plan-card-head">
                    <span className="plan-title">{p.title}</span>
                    {p.best ? <span className="plan-badge">{t("plan_best")}</span> : null}
                  </div>
                  <ul className="plan-perks">
                    {p.perks.map((perk) => (
                      <li key={perk}>{perk}</li>
                    ))}
                  </ul>
                  <div className="plan-cta">{p.price}</div>
                </button>
              ))}
              {awaiting ? (
                <Button variant="secondary" disabled={checking} onClick={checkPayment}>
                  {t("plan_check")}
                </Button>
              ) : null}
              {error ? (
                <p className="hint center" style={{ color: "var(--tg-destructive)" }}>
                  {error}
                </p>
              ) : null}
            </>
          ) : null}
        </>
      ) : null}

      {tab === "admin" && isOperator ? <AdminPanel /> : null}

      {tab === "help" ? (
        <>
        <Card>
          <p className="subtitle">{t("language")}</p>
          <div className="row" style={{ gap: 8 }}>
            <Button
              small
              variant={getLang() === "ru" ? "primary" : "secondary"}
              onClick={() => switchLang("ru")}
            >
              {t("lang_ru")}
            </Button>
            <Button
              small
              variant={getLang() === "en" ? "primary" : "secondary"}
              onClick={() => switchLang("en")}
            >
              {t("lang_en")}
            </Button>
          </div>
        </Card>
        <Card>
          <SectionHeader icon={<ShieldIcon />} title={t("setup_title")} />
          <ol className="steps">
            <li>{t("setup_step_join")}</li>
            <li>{t("setup_step_admin")}</li>
            <li>{t("setup_step_guard")}</li>
            <li>{t("setup_step_scenario")}</li>
          </ol>
        </Card>
        </>
      ) : null}

      <nav className="bottom-nav">
        <button className={tab === "groups" ? "active" : ""} onClick={() => setTab("groups")}>
          <UsersIcon size={22} />
          <span>{t("nav_groups")}</span>
        </button>
        <button className={tab === "billing" ? "active" : ""} onClick={() => setTab("billing")}>
          <CoinIcon size={22} />
          <span>{t("nav_billing")}</span>
        </button>
        <button className={tab === "help" ? "active" : ""} onClick={() => setTab("help")}>
          <HelpIcon size={22} />
          <span>{t("nav_help")}</span>
        </button>
        {isOperator ? (
          <button className={tab === "admin" ? "active" : ""} onClick={() => setTab("admin")}>
            <StarIcon size={22} />
            <span>{t("nav_admin")}</span>
          </button>
        ) : null}
      </nav>
    </div>
  );
}
