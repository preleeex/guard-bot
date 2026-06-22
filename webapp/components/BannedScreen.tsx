"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { t } from "@/lib/i18n";
import { pickImage } from "@/lib/image";
import { GIF } from "@/lib/assets";
import { Button, Card, Loading } from "./ui";

type AppealStatus = "none" | "pending" | "approved" | "rejected";

interface AppealState {
  banned: boolean;
  reason: string | null;
  appealStatus: AppealStatus;
  canAppeal: boolean;
}

// Shown when the user is globally banned. Lets them submit one appeal (text +
// optional photo); a rejected appeal cannot be resubmitted.
export function BannedScreen() {
  const [state, setState] = useState<AppealState | null>(null);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [text, setText] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const data = await api.get<AppealState>("/api/appeals/status");
      setState(data);
    } catch (e) {
      setError((e as ApiError).message || t("appeal_load_failed"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      await api.post("/api/appeals/submit", { text, photo });
      setFormOpen(false);
      setText("");
      setPhoto(null);
      await load();
    } catch (e) {
      setError((e as ApiError).message || t("appeal_submit_failed"));
    } finally {
      setBusy(false);
    }
  };

  const addPhoto = async () => {
    const dataUrl = await pickImage(800);
    if (dataUrl) setPhoto(dataUrl);
  };

  if (loading) return <Loading text={t("loading")} />;

  const reasonLine = state?.reason ? `${t("appeal_ban_reason")}: ${state.reason}` : undefined;

  if (formOpen) {
    return (
      <div className="app">
        <Card>
          <p className="title center">{t("appeal_form_title")}</p>
          <p className="hint center">{t("appeal_form_hint")}</p>
          <textarea
            className="field appeal-text"
            rows={5}
            placeholder={t("appeal_text_ph")}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          {photo ? (
            <div className="appeal-photo-wrap">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo} alt="" className="appeal-photo-preview" />
              <Button variant="secondary" small onClick={() => setPhoto(null)}>
                {t("appeal_remove_photo")}
              </Button>
            </div>
          ) : (
            <Button variant="secondary" onClick={addPhoto}>
              {t("appeal_add_photo")}
            </Button>
          )}
          <Button disabled={busy || text.trim().length < 10} onClick={submit}>
            {t("appeal_submit")}
          </Button>
          <Button variant="secondary" disabled={busy} onClick={() => setFormOpen(false)}>
            {t("back")}
          </Button>
          {error ? <p className="hint center">{error}</p> : null}
        </Card>
      </div>
    );
  }

  const status = state?.appealStatus ?? "none";
  const subtitle =
    status === "pending"
      ? t("appeal_pending")
      : status === "rejected"
      ? t("appeal_rejected")
      : status === "approved"
      ? t("appeal_approved")
      : t("banned_text");

  return (
    <div className="app">
      <Card>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={GIF.ban} alt="" className="state-gif" />
        <p className="title center">{t("banned_title")}</p>
        <p className="hint center">{subtitle}</p>
        {reasonLine ? <p className="hint center">{reasonLine}</p> : null}
        {state?.canAppeal ? (
          <Button onClick={() => setFormOpen(true)}>{t("appeal_open")}</Button>
        ) : null}
        {error ? <p className="hint center">{error}</p> : null}
      </Card>
    </div>
  );
}
