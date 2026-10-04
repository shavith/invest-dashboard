import type { KeyboardEvent } from "react";

export function fmt(value: number | null | undefined, digits = 1): string {
  if (value == null || Number.isNaN(value)) return "n.a.";
  return value.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function fmtRank(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function fmtPct(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "n.a.";
  return `${(value * 100).toFixed(1)}%`;
}

export function Meter({ value }: { value: number | null }) {
  const width = value == null ? 0 : Math.max(0, Math.min(100, value));
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink" aria-hidden="true">
      <div className="h-full rounded-full bg-brass" style={{ width: `${width}%` }} />
    </div>
  );
}

export function Field({
  label,
  value,
  onChange,
  step = "any",
}: {
  label: string;
  value: number | null;
  onChange: (next: number | null) => void;
  step?: string;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-xs text-muted">{label}</span>
      <input
        inputMode="decimal"
        step={step}
        value={value ?? ""}
        onChange={(event) => {
          const text = event.target.value;
          if (text.trim() === "") {
            onChange(null);
            return;
          }
          const next = Number(text);
          if (Number.isFinite(next)) onChange(next);
        }}
        className="h-11 w-full min-w-0 rounded-md border border-line bg-ink px-3 font-mono text-sm text-fg"
      />
    </label>
  );
}

export function TextField({
  label,
  value,
  onChange,
  type = "text",
  autoComplete = "off",
  onKeyDown,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  type?: "text" | "password";
  autoComplete?: string;
  disabled?: boolean;
  onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-xs text-muted">{label}</span>
      <input
        type={type}
        autoComplete={autoComplete}
        disabled={disabled}
        spellCheck={false}
        value={value}
        onKeyDown={onKeyDown}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 w-full min-w-0 rounded-md border border-line bg-ink px-3 text-sm text-fg"
      />
    </label>
  );
}
