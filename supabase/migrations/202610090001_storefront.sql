begin;

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  access_token_hash text not null unique check (access_token_hash ~ '^[a-f0-9]{64}$'),
  access_expires_at timestamptz not null default (now() + interval '1 year'),
  request_hash text not null check (request_hash ~ '^[a-f0-9]{64}$'),
  customer_name text not null check (length(customer_name) between 2 and 120),
  customer_email text not null check (length(customer_email) between 3 and 254 and customer_email = lower(customer_email)),
  customer_mobile text not null check (length(customer_mobile) between 7 and 20),
  status text not null default 'created' check (status in ('created','payment_pending','paid','failed','refunded')),
  payment_mode text not null check (payment_mode in ('test','live')),
  currency text not null default 'INR' check (currency = 'INR'),
  subtotal integer not null check (subtotal > 0),
  total integer not null check (total > 0 and total <= subtotal),
  pricing jsonb not null check (jsonb_typeof(pricing) = 'object'),
  razorpay_order_id text unique check (razorpay_order_id ~ '^order_[A-Za-z0-9]+$'),
  razorpay_payment_id text unique check (razorpay_payment_id ~ '^pay_[A-Za-z0-9]+$'),
  gateway_started_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  paid_at timestamptz,
  check (status not in ('paid','refunded') or (paid_at is not null and razorpay_payment_id is not null and razorpay_order_id is not null))
);
create index orders_email_paid_idx on public.orders(customer_email) where status in ('paid','refunded');
create index orders_created_idx on public.orders(created_at desc);

create table public.order_items (
  order_id uuid not null references public.orders(id) on delete restrict,
  product_id text not null check (product_id in ('the-first-table','the-full-table','behind-the-kitchen-door','the-math-behind-the-menu','empty-tables-to-full-house')),
  product_title text not null check (length(product_title) between 1 and 200),
  unit_price integer not null check (unit_price > 0),
  quantity integer not null default 1 check (quantity = 1),
  storage_path text not null check (storage_path ~ '^handbooks/[a-z0-9-]+\.pdf$'),
  primary key (order_id, product_id)
);

create table public.payments (
  id text primary key check (id ~ '^pay_[A-Za-z0-9]+$'),
  order_id uuid not null references public.orders(id) on delete restrict,
  razorpay_order_id text not null,
  amount integer not null check (amount > 0),
  currency text not null check (currency = 'INR'),
  status text not null check (status in ('captured','failed','refunded')),
  amount_refunded integer not null default 0 check (amount_refunded between 0 and amount),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, order_id)
);
create index payments_order_idx on public.payments(order_id);
alter table public.orders add constraint orders_payment_fk foreign key (razorpay_payment_id, id) references public.payments(id, order_id) deferrable initially deferred;

create table public.payment_events (
  event_key text primary key check (length(event_key) between 1 and 200),
  provider_event_id text check (length(provider_event_id) <= 200),
  event_type text not null check (length(event_type) between 1 and 100),
  order_id uuid not null references public.orders(id) on delete restrict,
  payment_id text not null references public.payments(id) deferrable initially deferred,
  received_at timestamptz not null default now()
);
create index payment_events_order_idx on public.payment_events(order_id);
create index payment_events_received_idx on public.payment_events(received_at);

create table public.download_entitlements (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null,
  product_id text not null,
  payment_id text not null,
  customer_email text not null,
  storage_path text not null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (order_id, product_id),
  foreign key (order_id, product_id) references public.order_items(order_id, product_id) on delete restrict,
  foreign key (payment_id, order_id) references public.payments(id, order_id) on delete restrict
);

-- Shared abuse counters work across serverless instances; no Redis or in-memory limiter.
create table public.rate_limits (
  key text primary key,
  hits integer not null check (hits > 0),
  expires_at timestamptz not null
);
create index rate_limits_expiry_idx on public.rate_limits(expires_at);

create function public.tkc_create_order(p jsonb) returns jsonb
language plpgsql set search_path = '' as $$
declare o public.orders; item jsonb; inserted boolean;
begin
  insert into public.orders(id, order_number, access_token_hash, request_hash, customer_name, customer_email, customer_mobile, subtotal, total, payment_mode, pricing)
  values ((p->>'id')::uuid, 'TKC-' || replace(p->>'id','-',''), p->>'access_token_hash', p->>'request_hash', p->>'customer_name', p->>'customer_email', p->>'customer_mobile', (p->>'subtotal')::int, (p->>'total')::int, p->>'payment_mode', p->'pricing')
  on conflict (access_token_hash) do nothing returning * into o;
  inserted := found;
  if not inserted then
    select * into strict o from public.orders where access_token_hash = p->>'access_token_hash';
    if o.request_hash <> p->>'request_hash' then raise exception 'idempotency_conflict'; end if;
  else
    if jsonb_array_length(p->'items') not between 1 and 5 then raise exception 'invalid_items'; end if;
    for item in select * from jsonb_array_elements(p->'items') loop
      insert into public.order_items(order_id, product_id, product_title, unit_price, quantity, storage_path)
      values (o.id, item->>'product_id', item->>'product_title', (item->>'unit_price')::int, (item->>'quantity')::int, item->>'storage_path');
    end loop;
    if (select sum(unit_price * quantity) from public.order_items where order_id=o.id) <> o.subtotal then raise exception 'subtotal_mismatch'; end if;
  end if;
  return to_jsonb(o);
end;
$$;

create function public.tkc_claim_gateway(p jsonb) returns boolean
language plpgsql set search_path = '' as $$
begin
  -- The receipt is stable and unique at Razorpay. Retry only after the HTTP timeout has elapsed.
  update public.orders set gateway_started_at=now(), updated_at=now()
  where id=(p->>'order_id')::uuid and razorpay_order_id is null
    and (gateway_started_at is null or gateway_started_at < now()-interval '60 seconds');
  return found;
end;
$$;

create function public.tkc_bind_gateway(p jsonb) returns void
language plpgsql set search_path = '' as $$
declare o public.orders;
begin
  select * into strict o from public.orders where id=(p->>'order_id')::uuid for update;
  if o.razorpay_order_id is not null and o.razorpay_order_id <> p->>'razorpay_order_id' then raise exception 'gateway_conflict'; end if;
  update public.orders set razorpay_order_id=p->>'razorpay_order_id',
    status=case when status='created' then 'payment_pending' else status end, updated_at=now() where id=o.id;
end;
$$;

create function public.tkc_apply_payment(p jsonb) returns jsonb
language plpgsql set search_path = '' as $$
declare o public.orders; new_event text; prior public.payments; next_status text; refunded integer;
begin
  select * into strict o from public.orders where id=(p->>'order_id')::uuid for update;
  if o.razorpay_order_id is distinct from p->>'razorpay_order_id' or o.total <> (p->>'amount')::int or o.currency <> p->>'currency'
    or p->>'status' not in ('captured','failed','refunded') then raise exception 'payment_mismatch'; end if;
  refunded := coalesce((p->>'amount_refunded')::int,0);
  if refunded < 0 or refunded > o.total or (p->>'status'='refunded' and refunded=0) then raise exception 'invalid_refund'; end if;

  insert into public.payment_events(event_key, provider_event_id, event_type, order_id, payment_id)
  values (p->>'event_key', p->>'provider_event_id', p->>'event_type', o.id, p->>'payment_id')
  on conflict do nothing returning event_key into new_event;
  if new_event is null then return jsonb_build_object('duplicate',true); end if;

  select * into prior from public.payments where id=p->>'payment_id';
  if found and prior.order_id <> o.id then raise exception 'payment_order_conflict'; end if;
  next_status := case when prior.status='refunded' then 'refunded' when prior.status='captured' and p->>'status'='failed' then 'captured' else p->>'status' end;
  insert into public.payments(id, order_id, razorpay_order_id, amount, currency, status, amount_refunded)
  values (p->>'payment_id', o.id, o.razorpay_order_id, o.total, o.currency, next_status, refunded)
  on conflict (id) do update set status=excluded.status, amount_refunded=greatest(public.payments.amount_refunded, excluded.amount_refunded), updated_at=now();

  if next_status in ('captured','refunded') then
    if o.razorpay_payment_id is not null and o.razorpay_payment_id <> p->>'payment_id' then raise exception 'multiple_paid_payments'; end if;
    if next_status='refunded' or o.status='refunded' then
      update public.orders set status='refunded', razorpay_payment_id=p->>'payment_id', paid_at=coalesce(paid_at,now()), updated_at=now() where id=o.id;
      update public.download_entitlements set revoked_at=coalesce(revoked_at,now()) where order_id=o.id;
    else
      update public.orders set status='paid', razorpay_payment_id=p->>'payment_id', paid_at=coalesce(paid_at,now()), updated_at=now() where id=o.id;
      insert into public.download_entitlements(order_id, product_id, payment_id, customer_email, storage_path)
      select o.id, product_id, p->>'payment_id', o.customer_email, storage_path from public.order_items where order_id=o.id
      on conflict (order_id, product_id) do nothing;
    end if;
  elsif o.status not in ('paid','refunded') then
    update public.orders set status='failed', updated_at=now() where id=o.id;
  end if;
  return jsonb_build_object('duplicate',false);
end;
$$;

create function public.tkc_rate_limit(p jsonb) returns boolean
language plpgsql set search_path = '' as $$
declare n integer;
begin
  delete from public.rate_limits where expires_at < now();
  insert into public.rate_limits(key,hits,expires_at) values(p->>'key',1,now()+make_interval(secs=>(p->>'seconds')::int))
  on conflict (key) do update set hits=public.rate_limits.hits+1 returning hits into n;
  return n <= (p->>'limit')::int;
end;
$$;

alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.payments enable row level security;
alter table public.payment_events enable row level security;
alter table public.download_entitlements enable row level security;
alter table public.rate_limits enable row level security;
-- Intentionally no browser policies. Only trusted server APIs access commerce data.
revoke all on public.orders, public.order_items, public.payments, public.payment_events, public.download_entitlements, public.rate_limits from public, anon, authenticated;
grant select, insert, update, delete on public.orders, public.order_items, public.payments, public.payment_events, public.download_entitlements, public.rate_limits to service_role;
revoke all on function public.tkc_create_order(jsonb), public.tkc_claim_gateway(jsonb), public.tkc_bind_gateway(jsonb), public.tkc_apply_payment(jsonb), public.tkc_rate_limit(jsonb) from public, anon, authenticated;
grant execute on function public.tkc_create_order(jsonb), public.tkc_claim_gateway(jsonb), public.tkc_bind_gateway(jsonb), public.tkc_apply_payment(jsonb), public.tkc_rate_limit(jsonb) to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('handbooks','handbooks',false,52428800,array['application/pdf'])
on conflict (id) do update set public=false, file_size_limit=excluded.file_size_limit, allowed_mime_types=excluded.allowed_mime_types;
-- No storage.objects policies are granted to anon/authenticated. Service role uploads/signs.
commit;
