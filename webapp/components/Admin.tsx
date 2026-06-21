"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { Button, Card, Loading } from "./ui";

interface Stats {
  owners: number;
  users: number;
  totalGroups: number;
  activeGroups: number;
  paidBundles: number;
  paidSlots: number;
  revenueByCurrency: Record<string, number>;
}

// Operator-only admin view: global stats and manual slot grants.
export function Admin({ onBack }: { onBack: () => void }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [userId, setUserId] = useState("");
  const [slots, setSlots] = useState("3");
  const [status, setStatus] = useState("");

  const load = () => api.get<Stats>("/api/admin/stats").then(setStats);
  useEffect(() => {
    load();
  }, []);

  if (!stats) return <Loading />;

  const grant = async () => {
    setStatus("");
    try {
      await api.post("/api/admin/grant-slots", { userId, slots: Number(slots) });
      setStatus("Слоты выданы.");
      setUserId("");
    } catch (e) {
      setStatus((e as ApiError).message || "Ошибка.");
    }
  };

  const revenue = Object.entries(stats.revenueByCurrency)
    .map(([cur, amt]) => `${amt.toFixed(2)} ${cur}`)
    .join(", ");

  return (
    <div className="app">
      <div className="row">
        <Button small variant="secondary" onClick={onBack}>
          Назад
        </Button>
        <p className="subtitle">Админ</p>
      </div>

      <Card>
        <p className="subtitle">Статистика</p>
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
      </Card>

      <Card>
        <p className="subtitle">Выдать слоты вручную</p>
        <input
          className="field"
          inputMode="numeric"
          placeholder="user_id"
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
        />
        <input
          className="field"
          inputMode="numeric"
          placeholder="Количество слотов"
          value={slots}
          onChange={(e) => setSlots(e.target.value)}
        />
        <Button disabled={!userId} onClick={grant}>
          Выдать
        </Button>
        {status ? <p className="hint">{status}</p> : null}
      </Card>
    </div>
  );
}
