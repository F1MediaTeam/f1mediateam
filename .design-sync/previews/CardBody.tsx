import { Card, CardHeader, CardBody, Stat, Divider } from "f1-media";

export function TextBody() {
  return (
    <Card className="max-w-xl">
      <CardHeader title="About this report" subtitle="Acme Roofing — organic search" />
      <CardBody>
        <p className="text-sm text-[var(--color-text-muted)]">
          This dashboard covers organic search performance only. Paid campaigns
          are reported separately in the Ads workspace. Data refreshes nightly
          at 2:00 AM Central.
        </p>
      </CardBody>
    </Card>
  );
}

export function StatGridBody() {
  return (
    <Card className="max-w-xl">
      <CardHeader title="Last 28 days" subtitle="Northwind HVAC" />
      <CardBody>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Stat label="Clicks" value="2,431" trend={{ direction: "up", label: "+8.1%" }} />
          <Stat label="Impressions" value="61.7K" trend={{ direction: "up", label: "+14.9%" }} />
        </div>
      </CardBody>
    </Card>
  );
}

export function StackedSectionsBody() {
  return (
    <Card className="max-w-xl">
      <CardHeader title="Open tasks" subtitle="2 items need attention" />
      <CardBody>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <div className="text-sm font-medium">Approve service-area pages</div>
            <div className="text-xs text-[var(--color-text-muted)]">
              5 city pages drafted — due Friday
            </div>
          </div>
          <Divider />
          <div>
            <div className="text-sm font-medium">Confirm Google Business hours</div>
            <div className="text-xs text-[var(--color-text-muted)]">
              Holiday hours flagged by the local listings sync
            </div>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
