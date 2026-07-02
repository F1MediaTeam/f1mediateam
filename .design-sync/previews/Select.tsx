import { Select } from "f1-media";

export function DateRange() {
  return (
    <div style={{ maxWidth: 260 }}>
      <Select defaultValue="28d">
        <option value="7d">Last 7 days</option>
        <option value="28d">Last 28 days</option>
        <option value="90d">Last 90 days</option>
        <option value="12m">Last 12 months</option>
      </Select>
    </div>
  );
}

export function ClientPicker() {
  return (
    <div style={{ maxWidth: 260 }}>
      <Select defaultValue="">
        <option value="" disabled>
          Select a client…
        </option>
        <option value="northwind">Northwind HVAC</option>
        <option value="acme">Acme Roofing</option>
        <option value="lakeside">Lakeside Dental</option>
      </Select>
    </div>
  );
}

export function Disabled() {
  return (
    <div style={{ maxWidth: 260 }}>
      <Select disabled defaultValue="gsc">
        <option value="gsc">Google Search Console</option>
        <option value="ga4">Google Analytics 4</option>
      </Select>
    </div>
  );
}
