"use client";

import React from "react";
import { GIF } from "@/lib/assets";

export function Card({ children }: { children: React.ReactNode }) {
  return <div className="card">{children}</div>;
}

export function Button({
  children,
  variant = "primary",
  small,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger";
  small?: boolean;
}) {
  const cls = ["btn", variant !== "primary" ? variant : "", small ? "small" : ""]
    .filter(Boolean)
    .join(" ");
  return (
    <button className={cls} {...rest}>
      {children}
    </button>
  );
}

// Icon button (square), used for compact actions like reorder/delete.
export function IconButton({
  children,
  variant = "secondary",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "secondary" | "danger";
}) {
  return (
    <button className={`icon-btn ${variant}`} {...rest}>
      {children}
    </button>
  );
}

// Centered section header: SVG icon above a title.
export function SectionHeader({
  icon,
  title,
}: {
  icon: React.ReactNode;
  title: string;
}) {
  return (
    <div className="section-header">
      <span className="section-icon">{icon}</span>
      <p className="subtitle">{title}</p>
    </div>
  );
}

// eslint-disable-next-line @next/next/no-img-element
export function StateGif({ src, alt = "" }: { src: string; alt?: string }) {
  return <img className="state-gif" src={src} alt={alt} />;
}

// Custom animated progress bar (replaces the loading GIF).
export function Loading({ text = "Загрузка" }: { text?: string }) {
  return (
    <div className="app loading-wrap">
      <div className="progress">
        <div className="progress-bar" />
      </div>
      <p className="hint center">{text}</p>
    </div>
  );
}

export function Message({
  title,
  text,
  gif,
}: {
  title: string;
  text?: string;
  gif?: string;
}) {
  return (
    <div className="app">
      <Card>
        {gif ? <StateGif src={gif} alt="" /> : null}
        <p className="title center">{title}</p>
        {text ? <p className="hint center">{text}</p> : null}
      </Card>
    </div>
  );
}

// Error state with a retry action.
export function ErrorState({ text, onRetry }: { text: string; onRetry: () => void }) {
  return (
    <div className="app">
      <Card>
        <StateGif src={GIF.empty} alt="" />
        <p className="title center">Ошибка</p>
        <p className="hint center">{text}</p>
        <Button onClick={onRetry}>Повторить</Button>
      </Card>
    </div>
  );
}

// Telegram profile avatar with initials fallback.
export function Avatar({
  photoUrl,
  name,
  size = 48,
}: {
  photoUrl?: string;
  name?: string;
  size?: number;
}) {
  const initials = (name ?? "")
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  if (photoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img className="avatar" src={photoUrl} alt="" style={{ width: size, height: size }} />;
  }
  return (
    <div className="avatar avatar-fallback" style={{ width: size, height: size }}>
      {initials || "?"}
    </div>
  );
}
