-- M10 (#91): opts game_events into Supabase's realtime replication so
-- `postgres_changes` subscriptions actually receive INSERTs — without
-- this, RLS still protects the table but no change ever reaches a
-- connected client. No RLS change needed here: Realtime evaluates each
-- subscriber's own row-security context per row before forwarding a
-- change, so the owner-or-participant policies from the sharing
-- migration already scope who receives what.
alter publication supabase_realtime add table public.game_events;
