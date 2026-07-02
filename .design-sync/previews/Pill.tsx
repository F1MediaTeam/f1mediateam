import { Pill } from "f1-media";

const row: React.CSSProperties = { display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" };

export function Tones() {
  return (
    <div style={row}>
      <Pill tone="default">Draft</Pill>
      <Pill tone="accent">Posted</Pill>
      <Pill tone="ok">Approved</Pill>
      <Pill tone="warn">Pending review</Pill>
      <Pill tone="danger">Overdue</Pill>
    </div>
  );
}

export function ContentStages() {
  return (
    <div style={row}>
      <Pill tone="default">Proposed</Pill>
      <Pill tone="warn">Pending</Pill>
      <Pill tone="ok">Posted</Pill>
    </div>
  );
}
