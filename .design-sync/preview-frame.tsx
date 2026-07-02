// Preview-only wrapper: F1 Media is a dark-first system, but the preview
// harness renders stories on a white page. This frame recreates the app
// canvas (dark bg, brand text color, DM Sans) so every card shows components
// the way the product actually renders them. Wired via cfg.provider.
export function PreviewFrame({ children }: { children?: React.ReactNode }) {
  return (
    <div
      className="bg-[var(--color-bg)] text-[var(--color-text)] rounded-xl p-6"
      style={{ fontFamily: "var(--font-sans)", minHeight: 80 }}
    >
      {children}
    </div>
  );
}
