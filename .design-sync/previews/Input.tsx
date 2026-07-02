import { Input } from "f1-media";

export function Placeholder() {
  return (
    <div style={{ maxWidth: 320 }}>
      <Input placeholder="Search keywords…" />
    </div>
  );
}

export function Filled() {
  return (
    <div style={{ maxWidth: 320 }}>
      <Input defaultValue="furnace repair minneapolis" />
    </div>
  );
}

export function Disabled() {
  return (
    <div style={{ maxWidth: 320 }}>
      <Input defaultValue="northwindhvac.com" disabled />
    </div>
  );
}

export function WithLabel() {
  return (
    <div style={{ maxWidth: 320, display: "flex", flexDirection: "column", gap: 6 }}>
      <label className="text-xs font-medium text-[var(--color-text-muted)]">
        Client contact email
      </label>
      <Input type="email" placeholder="ops@acmeroofing.com" />
    </div>
  );
}
