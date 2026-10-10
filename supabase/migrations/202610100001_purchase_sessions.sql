begin;

-- Existing checkout/link credentials are retained solely for checkout continuation.
-- No legacy cookie or fragment token is accepted as purchase authorization by the app.
alter table public.orders rename column access_token_hash to checkout_token_hash;
alter table public.orders rename column access_expires_at to checkout_expires_at;
alter table public.orders alter column checkout_expires_at set default (now() + interval '7 days');
update public.orders set checkout_expires_at=least(checkout_expires_at, now()+interval '7 days');
alter table public.orders alter column customer_email drop not null;
alter table public.download_entitlements alter column customer_email drop not null;
create index orders_mobile_paid_idx on public.orders(customer_mobile) where status in ('paid','refunded');

create table public.purchase_sessions (
  token_hash text primary key check (token_hash ~ '^[a-f0-9]{64}$'),
  order_id uuid not null references public.orders(id) on delete restrict,
  payment_id text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days'),
  check (expires_at > created_at),
  foreign key (payment_id, order_id) references public.payments(id, order_id) on delete restrict
);
create index purchase_sessions_order_idx on public.purchase_sessions(order_id);
create index purchase_sessions_expiry_idx on public.purchase_sessions(expires_at);

create or replace function public.tkc_create_order(p jsonb) returns jsonb
language plpgsql set search_path = '' as $$
declare o public.orders; item jsonb; inserted boolean;
begin
  insert into public.orders(id, order_number, checkout_token_hash, request_hash, customer_name, customer_email, customer_mobile, subtotal, total, payment_mode, pricing)
  values ((p->>'id')::uuid, 'TKC-' || replace(p->>'id','-',''), p->>'checkout_token_hash', p->>'request_hash', p->>'customer_name', p->>'customer_email', p->>'customer_mobile', (p->>'subtotal')::int, (p->>'total')::int, p->>'payment_mode', p->'pricing')
  on conflict (checkout_token_hash) do nothing returning * into o;
  inserted := found;
  if not inserted then
    select * into strict o from public.orders where checkout_token_hash = p->>'checkout_token_hash';
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

-- A caller cannot mint a session for an unpaid or partially fulfilled purchase.
create function public.tkc_create_purchase_session(p jsonb) returns jsonb
language plpgsql set search_path = '' as $$
declare o public.orders; s public.purchase_sessions;
begin
  select * into strict o from public.orders where id=(p->>'order_id')::uuid for update;
  if o.status <> 'paid' or o.razorpay_payment_id is distinct from p->>'payment_id' or not exists (
    select 1 from public.payments pay where pay.id=o.razorpay_payment_id and pay.order_id=o.id
      and pay.razorpay_order_id=o.razorpay_order_id and pay.amount=o.total and pay.currency=o.currency
      and pay.status='captured' and pay.amount_refunded=0
  ) or not exists (select 1 from public.order_items where order_id=o.id)
    or exists (
      select 1 from public.order_items i where i.order_id=o.id and not exists (
        select 1 from public.download_entitlements e where e.order_id=i.order_id and e.product_id=i.product_id
          and e.payment_id=o.razorpay_payment_id and e.revoked_at is null and e.storage_path=i.storage_path
          and e.customer_email is not distinct from o.customer_email
      )
    ) then raise exception 'purchase_not_fulfilled'; end if;
  insert into public.purchase_sessions(token_hash, order_id, payment_id)
    values (p->>'token_hash', o.id, o.razorpay_payment_id) returning * into s;
  return to_jsonb(s);
end;
$$;

-- Recheck the complete authorization relationship in one database statement before signing.
create function public.tkc_authorize_download(p jsonb) returns text
language plpgsql set search_path = '' as $$
declare path text;
begin
  select e.storage_path into path
    from public.orders o
    join public.purchase_sessions s on s.order_id=o.id and s.payment_id=o.razorpay_payment_id
    join public.payments pay on pay.id=o.razorpay_payment_id and pay.order_id=o.id
    join public.download_entitlements e on e.order_id=o.id and e.payment_id=pay.id
    join public.order_items i on i.order_id=e.order_id and i.product_id=e.product_id and i.storage_path=e.storage_path
    where o.id=(p->>'order_id')::uuid and s.token_hash=p->>'session_hash' and s.expires_at>now()
      and o.status='paid' and pay.status='captured' and pay.amount_refunded=0
      and pay.razorpay_order_id=o.razorpay_order_id and pay.amount=o.total and pay.currency=o.currency
      and e.id=(p->>'entitlement_id')::uuid and e.revoked_at is null
      and e.customer_email is not distinct from o.customer_email
    for share of o;
  return path;
end;
$$;

alter table public.purchase_sessions enable row level security;
revoke all on public.purchase_sessions from public, anon, authenticated;
grant select, insert, update, delete on public.purchase_sessions to service_role;
revoke all on function public.tkc_create_purchase_session(jsonb), public.tkc_authorize_download(jsonb) from public, anon, authenticated;
grant execute on function public.tkc_create_purchase_session(jsonb), public.tkc_authorize_download(jsonb) to service_role;

commit;
