-- Web push alerts for parents (redemption requests). Parents opt in per
-- device; subscriptions are stored here and pushed to via the web-push
-- library from /api/redeem/request.
--
-- The VAPID keypair lives in push_config (single row) rather than in env
-- vars or the repo: the app reads it with the service-role client, and a
-- fresh deploy needs no extra configuration. Neither table has RLS
-- policies — all access goes through API routes using the admin client.

create table public.push_config (
  id int primary key default 1 check (id = 1),
  vapid_public_key text not null,
  vapid_private_key text not null,
  created_at timestamptz not null default now()
);

alter table public.push_config enable row level security;

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;

create index idx_push_subscriptions_user on public.push_subscriptions(user_id);

-- The VAPID keypair itself is inserted directly into push_config in prod
-- (deliberately not committed here). To regenerate:
--   npx web-push generate-vapid-keys --json
--   insert into push_config (vapid_public_key, vapid_private_key) values (...);
