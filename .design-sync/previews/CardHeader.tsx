import { Card, CardHeader, CardBody, Pill, Button } from "f1-media";

export function TitleOnly() {
  return (
    <Card className="max-w-xl">
      <CardHeader title="Keyword rankings" />
      <CardBody>
        <p className="text-sm text-[var(--color-text-muted)]">
          Tracking 42 keywords for Acme Roofing across Google US desktop and mobile.
        </p>
      </CardBody>
    </Card>
  );
}

export function WithSubtitle() {
  return (
    <Card className="max-w-xl">
      <CardHeader
        title="Search performance"
        subtitle="Northwind HVAC — May 1 to May 31"
      />
      <CardBody>
        <p className="text-sm text-[var(--color-text-muted)]">
          Clicks and impressions pulled nightly from Google Search Console.
        </p>
      </CardBody>
    </Card>
  );
}

export function WithStatusPill() {
  return (
    <Card className="max-w-xl">
      <CardHeader
        title="Monthly report"
        subtitle="June 2026 — ready for delivery"
        right={<Pill tone="ok">Synced</Pill>}
      />
      <CardBody>
        <p className="text-sm text-[var(--color-text-muted)]">
          All connectors refreshed 2 hours ago. Export as PDF or share the live link.
        </p>
      </CardBody>
    </Card>
  );
}

export function WithActionButton() {
  return (
    <Card className="max-w-xl">
      <CardHeader
        title="Content queue"
        subtitle="4 drafts awaiting approval"
        right={<Button size="sm">Review drafts</Button>}
      />
      <CardBody>
        <p className="text-sm text-[var(--color-text-muted)]">
          Approve drafts to move them onto the publishing calendar.
        </p>
      </CardBody>
    </Card>
  );
}
