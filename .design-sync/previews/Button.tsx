import { Button } from "f1-media";

const row: React.CSSProperties = { display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" };

export function Variants() {
  return (
    <div style={row}>
      <Button variant="primary">Create report</Button>
      <Button variant="secondary">Preview deck</Button>
      <Button variant="ghost">Cancel</Button>
      <Button variant="danger">Delete client</Button>
    </div>
  );
}

export function Sizes() {
  return (
    <div style={row}>
      <Button size="md">Sync now</Button>
      <Button size="sm">Sync now</Button>
      <Button size="sm" variant="secondary">
        Export CSV
      </Button>
    </div>
  );
}

export function Disabled() {
  return (
    <div style={row}>
      <Button disabled>Publishing…</Button>
      <Button variant="secondary" disabled>
        Awaiting approval
      </Button>
    </div>
  );
}
