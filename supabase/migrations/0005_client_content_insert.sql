-- Allow clients to add their own content proposals (start in `proposed`).
-- Admin still controls all stage transitions after creation.

drop policy if exists content_client_insert on public.content_cards;
create policy content_client_insert on public.content_cards
  for insert to authenticated
  with check (
    client_id = public.current_client_id()
    and stage = 'proposed'
  );
