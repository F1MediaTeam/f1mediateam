// Renders the saved style overrides as a single <style> block.
//
// Mounted from src/app/admin/layout.tsx and nowhere else, which is what keeps
// the client portal untouched: the rules only exist in documents served under
// /admin/*. Failures are swallowed so a missing table (migration not yet
// applied) degrades to "no overrides" rather than a 500 on every admin page.

import { data } from "@/lib/data";
import { buildOverrideCss, type UiOverride } from "@/lib/ui-overrides";

export default async function AdminStyleOverrides() {
  let overrides: UiOverride[] = [];
  try {
    overrides = await data.listUiOverrides();
  } catch {
    return null;
  }

  const css = buildOverrideCss(overrides);
  if (!css) return null;

  // Values are validated by sanitizeOverride() before they're ever stored, so
  // nothing here can break out of the rule it belongs to.
  return <style id="admin-style-overrides" dangerouslySetInnerHTML={{ __html: css }} />;
}
