-- F1 Pulse — the business profile behind every site.
--
-- Section 8 of the build script is a structural requirement, not a preference:
-- nothing in schema, code or UI may assume an industry, a platform, or a
-- location, and signing a client in a completely unrelated field must require
-- zero code changes. That only holds if the differences between clients live
-- in data rather than in branches.
--
-- So this is the data. Everything the system needs to generate a starter
-- keyword set, a set of buyer questions, and the right install instructions
-- for any business is here, as plain text a non-technical person can edit.
--
-- Deliberately free-text and arrays rather than enums. An enum of industries
-- is a promise that we thought of every industry, and the first client who
-- doesn't fit becomes a migration. `platform` carries presets in the UI but
-- accepts anything, because the install card's universal rule — paste before
-- </body> — is correct on every platform including ones that don't exist yet.

alter table public.pulse_sites
  -- A few plain words: "screen printing and custom apparel", "asset
  -- protection law", "dental practice". Drives keyword and prompt wording.
  add column if not exists industry text,
  -- The specific things they sell. These become the head of every generated
  -- keyword and the subject of every generated buyer question.
  add column if not exists services text[] not null default '{}',
  -- Where they sell it. EMPTY MEANS NATIONAL — that is the documented default
  -- from Section 8, not an oversight, and the generator relies on it.
  add column if not exists service_areas text[] not null default '{}',
  -- Preset or free text. Only decides which install quick-guide is shown.
  add column if not exists platform text,
  -- Anything that shapes the work and isn't captured above.
  add column if not exists profile_notes text;

comment on column public.pulse_sites.service_areas is
  'Towns/regions served. An empty array means national targeting — the documented default, relied on by the keyword generator.';
comment on column public.pulse_sites.platform is
  'Website platform. Presets exist in the UI but any text is valid; it only selects an install quick-guide.';

-- The AI prompt set is generated from the same profile. The table exists from
-- 0024 but has no admin read policy path used yet; ensure the index that the
-- management UI will read by.
create index if not exists pulse_ai_prompts_site_idx
  on public.pulse_ai_prompts (site_id, is_active);
