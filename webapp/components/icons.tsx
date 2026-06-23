"use client";

import React from "react";

// Minimal inline SVG icon set. Strokes use currentColor so they follow the
// Telegram theme. Sized via the `size` prop (default 20).
type IconProps = { size?: number } & React.SVGProps<SVGSVGElement>;

function base(size: number, rest: React.SVGProps<SVGSVGElement>) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    ...rest,
  };
}

export function ShieldIcon({ size = 20, ...rest }: IconProps) {
  return (
    <svg {...base(size, rest)}>
      <path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

export function UsersIcon({ size = 20, ...rest }: IconProps) {
  return (
    <svg {...base(size, rest)}>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20c0-3 3-5 6-5s6 2 6 5" />
      <path d="M16 4a3 3 0 010 6" />
      <path d="M18 15c2 .5 3 2 3 5" />
    </svg>
  );
}

export function JournalIcon({ size = 20, ...rest }: IconProps) {
  return (
    <svg {...base(size, rest)}>
      <path d="M6 3h10a2 2 0 012 2v14a2 2 0 01-2 2H6z" />
      <path d="M6 3v18" />
      <path d="M9 8h6M9 12h6M9 16h4" />
    </svg>
  );
}

export function SettingsIcon({ size = 20, ...rest }: IconProps) {
  return (
    <svg {...base(size, rest)}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" />
    </svg>
  );
}

export function StarIcon({ size = 20, ...rest }: IconProps) {
  return (
    <svg {...base(size, rest)}>
      <path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9 6.8 19.2l1-5.8L3.5 9.2l5.9-.9L12 3z" />
    </svg>
  );
}

export function PlusIcon({ size = 20, ...rest }: IconProps) {
  return (
    <svg {...base(size, rest)}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function CoinIcon({ size = 20, ...rest }: IconProps) {
  return (
    <svg {...base(size, rest)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v10M9.5 9.5h4a1.5 1.5 0 010 3h-3a1.5 1.5 0 000 3h4" />
    </svg>
  );
}

export function ArrowUpIcon({ size = 20, ...rest }: IconProps) {
  return (
    <svg {...base(size, rest)}>
      <path d="M12 19V5M6 11l6-6 6 6" />
    </svg>
  );
}

export function ArrowDownIcon({ size = 20, ...rest }: IconProps) {
  return (
    <svg {...base(size, rest)}>
      <path d="M12 5v14M6 13l6 6 6-6" />
    </svg>
  );
}

export function TrashIcon({ size = 20, ...rest }: IconProps) {
  return (
    <svg {...base(size, rest)}>
      <path d="M4 7h16M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2M6 7l1 13a1 1 0 001 1h8a1 1 0 001-1l1-13" />
    </svg>
  );
}

export function GroupAddIcon({ size = 20, ...rest }: IconProps) {
  return (
    <svg {...base(size, rest)}>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20c0-3 3-5 6-5s6 2 6 5" />
      <path d="M18 7v6M21 10h-6" />
    </svg>
  );
}

export function QuizIcon({ size = 20, ...rest }: IconProps) {
  return (
    <svg {...base(size, rest)}>
      <path d="M4 6h10M4 12h10M4 18h6" />
      <path d="M17 6.5l1.4 1.4 2.6-2.9M17 13l1.4 1.4 2.6-2.9" />
    </svg>
  );
}

export function HelpIcon({ size = 20, ...rest }: IconProps) {
  return (
    <svg {...base(size, rest)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.5a2.5 2.5 0 113.5 2.3c-.8.4-1 .8-1 1.7" />
      <path d="M12 17h.01" />
    </svg>
  );
}

export function CheckIcon({ size = 20, ...rest }: IconProps) {
  return (
    <svg {...base(size, rest)}>
      <path d="M5 12l5 5L20 6" />
    </svg>
  );
}

export function UploadIcon({ size = 20, ...rest }: IconProps) {
  return (
    <svg {...base(size, rest)}>
      <path d="M12 16V5M8 9l4-4 4 4" />
      <path d="M5 19h14" />
    </svg>
  );
}

export function ExternalIcon({ size = 20, ...rest }: IconProps) {
  return (
    <svg {...base(size, rest)}>
      <path d="M14 4h6v6M20 4l-9 9" />
      <path d="M18 14v4a2 2 0 01-2 2H6a2 2 0 01-2-2V8a2 2 0 012-2h4" />
    </svg>
  );
}
