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

// eslint-disable-next-line @next/next/no-img-element
export function StateGif({ src, alt = "" }: { src: string; alt?: string }) {
  return <img className="state-gif" src={src} alt={alt} />;
}

export function Loading({ text = "Загрузка" }: { text?: string }) {
  return (
    <div className="app center">
      <StateGif src={GIF.loading} alt="loading" />
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

// Telegram profile avatar with initials fallback.
export function Avatar({
  photoUrl,
  name,
  size = 44,
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
    return (
      <img
        className="avatar"
        src={photoUrl}
        alt=""
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div className="avatar avatar-fallback" style={{ width: size, height: size }}>
      {initials || "?"}
    </div>
  );
}
