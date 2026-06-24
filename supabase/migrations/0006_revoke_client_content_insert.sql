-- Reverse 0005 — customers should NOT be able to create content cards.
-- Admin remains the sole creator.

drop policy if exists content_client_insert on public.content_cards;
