import { Stat } from "f1-media";

export function TrendUp() {
  return (
    <div style={{ maxWidth: 260 }}>
      <Stat
        label="Clicks"
        value="1,284"
        trend={{ direction: "up", label: "+12.4%" }}
        sub="vs previous 28 days"
      />
    </div>
  );
}

export function TrendDown() {
  return (
    <div style={{ maxWidth: 260 }}>
      <Stat
        label="Avg position"
        value="8.2"
        trend={{ direction: "down", label: "−1.3" }}
        sub="lower is better"
      />
    </div>
  );
}

export function TrendFlat() {
  return (
    <div style={{ maxWidth: 260 }}>
      <Stat
        label="Indexed pages"
        value="146"
        trend={{ direction: "flat", label: "±0" }}
        sub="no change this period"
      />
    </div>
  );
}

export function NoTrend() {
  return (
    <div style={{ maxWidth: 260 }}>
      <Stat label="Impressions" value="48.2K" sub="last 28 days" />
    </div>
  );
}
