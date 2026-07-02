import { EmptyState, Button } from "f1-media";

export function TitleOnly() {
  return (
    <div style={{ maxWidth: 480 }}>
      <EmptyState title="No tasks open" />
    </div>
  );
}

export function WithDescription() {
  return (
    <div style={{ maxWidth: 480 }}>
      <EmptyState
        title="No keyword data yet"
        description="Search Console usually takes 24–48 hours to report data for a newly verified property."
      />
    </div>
  );
}

export function WithAction() {
  return (
    <div style={{ maxWidth: 480 }}>
      <EmptyState
        title="No clients connected"
        description="Connect a Google Search Console property to start pulling clicks, impressions, and position data."
        action={<Button size="sm">Connect Search Console</Button>}
      />
    </div>
  );
}
