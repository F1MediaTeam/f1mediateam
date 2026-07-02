import { Card, CardHeader, CardBody, Stat, Pill, Button } from "f1-media";

export function DashboardCard() {
  return (
    <Card className="max-w-xl">
      <CardHeader
        title="SEO Snapshot"
        subtitle="Northwind HVAC — last 30 days"
        right={<Pill tone="ok">Synced</Pill>}
      />
      <CardBody>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Stat
            label="Clicks"
            value="1,284"
            trend={{ direction: "up", label: "+12.4%" }}
            sub="vs previous period"
          />
          <Stat
            label="Avg position"
            value="8.2"
            trend={{ direction: "down", label: "−1.3" }}
            sub="lower is better"
          />
        </div>
      </CardBody>
    </Card>
  );
}

export function WithActions() {
  return (
    <Card className="max-w-xl">
      <CardHeader
        title="Content approval"
        subtitle="3 cards awaiting your review"
        right={<Button size="sm">Review all</Button>}
      />
      <CardBody>
        <p className="text-sm text-[var(--color-text-muted)]">
          New blog drafts and social posts land here first. Approve them to move
          them onto the publishing calendar, or request changes and the team
          will revise.
        </p>
      </CardBody>
    </Card>
  );
}
