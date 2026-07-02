import { ThemeToggle } from "f1-media";

// Single icon button; reads data-theme from <html> (defaults to dark, so the
// Sun icon shows). Clicking it flips the whole page theme.

export function Default() {
  return <ThemeToggle />;
}
