import { FileDropZone } from "f1-media";

export function Default() {
  return (
    <div style={{ maxWidth: 440 }}>
      <FileDropZone />
    </div>
  );
}

export function SingleImage() {
  return (
    <div style={{ maxWidth: 440 }}>
      <FileDropZone
        name="logo"
        accept="image/*"
        multiple={false}
        label="Drop the client logo here"
        hint="PNG or SVG, square works best"
      />
    </div>
  );
}
