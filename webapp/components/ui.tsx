"use client";

import React from "react";

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

export function Loading({ text = "Загрузка" }: { text?: string }) {
  return (
    <div className="app">
      <p className="hint center">{text}</p>
    </div>
  );
}

export function Message({ title, text }: { title: string; text?: string }) {
  return (
    <div className="app">
      <Card>
        <p className="title">{title}</p>
        {text ? <p className="hint">{text}</p> : null}
      </Card>
    </div>
  );
}
