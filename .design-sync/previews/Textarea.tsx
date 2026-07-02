import { Textarea } from "f1-media";

export function Placeholder() {
  return (
    <div style={{ maxWidth: 420 }}>
      <Textarea rows={3} placeholder="Add a note for the client…" />
    </div>
  );
}

export function Filled() {
  return (
    <div style={{ maxWidth: 420 }}>
      <Textarea
        rows={4}
        defaultValue={
          "Rankings for \"emergency roof repair\" moved from page 2 to position 6 after the service-area rebuild. Recommend expanding the same template to the Plymouth and Bloomington pages next sprint."
        }
      />
    </div>
  );
}

export function Disabled() {
  return (
    <div style={{ maxWidth: 420 }}>
      <Textarea
        rows={3}
        disabled
        defaultValue="Report notes are locked once the monthly report has been delivered."
      />
    </div>
  );
}
