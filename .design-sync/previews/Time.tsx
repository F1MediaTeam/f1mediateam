import { Time } from "f1-media";

const row: React.CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  gap: 12,
  fontSize: 14,
};
const label: React.CSSProperties = {
  width: 140,
  fontSize: 11,
  color: "var(--color-text-muted)",
  fontFamily: "var(--font-mono, monospace)",
};

export function DateTime() {
  return (
    <div style={row}>
      <span style={label}>last synced</span>
      <Time iso="2026-06-28T14:35:00Z" />
    </div>
  );
}

export function DateOnly() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={row}>
        <span style={label}>report period end</span>
        <Time iso="2026-06-30T12:00:00Z" dateOnly />
      </div>
      <div style={row}>
        <span style={label}>date-only string</span>
        <Time iso="2026-04-01" />
      </div>
    </div>
  );
}

export function Empty() {
  return (
    <div style={row}>
      <span style={label}>last login</span>
      <Time iso={null} />
    </div>
  );
}
