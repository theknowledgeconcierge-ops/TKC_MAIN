begin;

-- One durable delivery record per paid order. orders.customer_email stays the immutable
-- checkout email; a buyer correction changes only delivery_email here.
create table public.email_deliveries (
  id uuid primary key,
  order_id uuid not null unique references public.orders(id) on delete restrict,
  delivery_email text not null check (
    length(delivery_email) between 3 and 254
    and delivery_email = lower(delivery_email)
    and delivery_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
  ),
  email_version integer not null default 1 check (email_version between 1 and 5),
  delivery_email_confirmed_at timestamptz,
  delivery_email_locked_at timestamptz,
  status text not null default 'pending' check (status in ('pending','sending','sent','failed')),
  provider text check (provider in ('resend','test')),
  provider_message_id text check (length(provider_message_id) between 1 and 200),
  attempt_count integer not null default 0 check (attempt_count between 0 and 5),
  -- Stable per address: a retry after an unknown outcome is deduplicated by the provider.
  idempotency_key text not null unique check (length(idempotency_key) between 1 and 256),
  claim_token uuid,
  lease_expires_at timestamptz,
  last_error text check (last_error ~ '^[a-z0-9_]{1,64}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz,
  failed_at timestamptz,
  check ((status = 'sending') = (claim_token is not null and lease_expires_at is not null)),
  check ((status = 'sent') = (delivery_email_locked_at is not null)),
  check (status <> 'sent' or (sent_at is not null and provider_message_id is not null)),
  check (status <> 'failed' or (failed_at is not null and last_error is not null))
);
create index email_deliveries_fallback_idx on public.email_deliveries(status, failed_at)
  where delivery_email_confirmed_at is null and status <> 'sent';
create index orders_paid_at_idx on public.orders(paid_at) where status = 'paid';

-- Paid, captured, unrefunded and fulfilled: the same evidence required before signing downloads.
create function public.tkc_deliverable_order(target uuid) returns boolean
language sql stable set search_path = '' as $$
  select exists (
    select 1 from public.orders o
    join public.payments pay on pay.id = o.razorpay_payment_id and pay.order_id = o.id
    where o.id = target and o.status = 'paid' and pay.status = 'captured' and pay.amount_refunded = 0
      and pay.razorpay_order_id = o.razorpay_order_id and pay.amount = o.total and pay.currency = o.currency
      and exists (select 1 from public.order_items where order_id = o.id)
      and not exists (
        select 1 from public.order_items i where i.order_id = o.id and not exists (
          select 1 from public.download_entitlements e where e.order_id = i.order_id and e.product_id = i.product_id
            and e.payment_id = o.razorpay_payment_id and e.revoked_at is null and e.storage_path = i.storage_path
        )
      )
  );
$$;

-- Buyer-initiated confirm/correct/retry. The purchase session is rechecked inside the lock.
create function public.tkc_claim_email_delivery(p jsonb) returns jsonb
language plpgsql set search_path = '' as $$
declare
  o public.orders;
  d public.email_deliveries;
  requested text := nullif(p->>'email', '');
  new_id uuid;
begin
  select * into o from public.orders where id = (p->>'order_id')::uuid for update;
  if not found or not exists (
    select 1 from public.purchase_sessions s
    where s.token_hash = p->>'session_hash' and s.order_id = o.id
      and s.payment_id = o.razorpay_payment_id and s.expires_at > now()
  ) then raise exception 'delivery_not_authorized'; end if;
  if not public.tkc_deliverable_order(o.id) then raise exception 'delivery_not_allowed'; end if;

  select * into d from public.email_deliveries where order_id = o.id for update;
  if not found then
    if coalesce(requested, o.customer_email) is null then raise exception 'delivery_email_required'; end if;
    new_id := gen_random_uuid();
    insert into public.email_deliveries(id, order_id, delivery_email, idempotency_key)
    values (new_id, o.id, coalesce(requested, o.customer_email), 'pnp-delivery-' || new_id || '-v1')
    returning * into d;
  end if;

  if d.status = 'sent' then
    if requested is not null and requested <> d.delivery_email then raise exception 'delivery_locked'; end if;
    return jsonb_build_object('outcome', 'sent');
  end if;
  -- An active or interrupted attempt must finish (or be retried unchanged) before the address changes.
  if d.status = 'sending' and (d.lease_expires_at > now() or (requested is not null and requested <> d.delivery_email)) then
    return jsonb_build_object('outcome', 'in_progress');
  end if;
  if d.attempt_count >= (p->>'max_attempts')::int then return jsonb_build_object('outcome', 'exhausted'); end if;
  if requested is not null and requested <> d.delivery_email then
    if d.email_version >= 5 then raise exception 'delivery_too_many_changes'; end if;
    update public.email_deliveries set delivery_email = requested, email_version = email_version + 1,
      idempotency_key = 'pnp-delivery-' || id || '-v' || (email_version + 1), updated_at = now()
    where id = d.id returning * into d;
  end if;

  update public.email_deliveries set status = 'sending', claim_token = gen_random_uuid(),
    lease_expires_at = now() + make_interval(secs => (p->>'lease_seconds')::int),
    attempt_count = attempt_count + 1, provider = p->>'provider',
    delivery_email_confirmed_at = coalesce(delivery_email_confirmed_at, now()), updated_at = now()
  where id = d.id returning * into d;
  return jsonb_build_object('outcome', 'claimed', 'delivery_id', d.id, 'claim_token', d.claim_token);
end;
$$;

-- Close-tab fallback: recent paid orders whose buyer never confirmed or corrected the address.
create function public.tkc_claim_fallback_deliveries(p jsonb) returns jsonb
language plpgsql set search_path = '' as $$
declare claimed jsonb;
begin
  insert into public.email_deliveries(id, order_id, delivery_email, idempotency_key)
  select x.id, x.order_id, x.email, 'pnp-delivery-' || x.id || '-v1'
  from (
    select gen_random_uuid() as id, o.id as order_id, o.customer_email as email
    from public.orders o
    where o.status = 'paid' and o.payment_mode = p->>'payment_mode' and o.customer_email is not null
      and o.paid_at <= now() - make_interval(secs => (p->>'grace_seconds')::int)
      and o.paid_at >= now() - make_interval(secs => (p->>'max_age_seconds')::int)
      and not exists (select 1 from public.email_deliveries d where d.order_id = o.id)
      and public.tkc_deliverable_order(o.id)
    order by o.paid_at
    limit (p->>'limit')::int
  ) x
  on conflict (order_id) do nothing;

  with due as (
    select d.id from public.email_deliveries d
    join public.orders o on o.id = d.order_id
    where d.delivery_email_confirmed_at is null and d.status <> 'sent'
      and d.attempt_count < (p->>'max_attempts')::int
      and (
        d.status = 'pending'
        or (d.status = 'failed' and d.failed_at <= now() - make_interval(secs => (p->>'retry_after_seconds')::int))
        or (d.status = 'sending' and d.lease_expires_at <= now())
      )
      and o.payment_mode = p->>'payment_mode'
      and o.paid_at <= now() - make_interval(secs => (p->>'grace_seconds')::int)
      and o.paid_at >= now() - make_interval(secs => (p->>'max_age_seconds')::int)
      and public.tkc_deliverable_order(o.id)
    order by o.paid_at
    limit (p->>'limit')::int
    for update of d skip locked
  ), updated as (
    update public.email_deliveries d set status = 'sending', claim_token = gen_random_uuid(),
      lease_expires_at = now() + make_interval(secs => (p->>'lease_seconds')::int),
      attempt_count = d.attempt_count + 1, provider = p->>'provider', updated_at = now()
    from due where d.id = due.id
    returning d.id, d.claim_token
  )
  select coalesce(jsonb_agg(jsonb_build_object('delivery_id', id, 'claim_token', claim_token)), '[]'::jsonb)
    into claimed from updated;
  return claimed;
end;
$$;

-- Server-derived message inputs for the claim holder only. Attachments come from active
-- entitlements matching the order's own item snapshots; callers never supply paths.
create function public.tkc_email_delivery_payload(p jsonb) returns jsonb
language plpgsql stable set search_path = '' as $$
declare d public.email_deliveries; o public.orders;
begin
  select * into d from public.email_deliveries
  where id = (p->>'delivery_id')::uuid and status = 'sending' and claim_token = (p->>'claim_token')::uuid;
  if not found then return null; end if;
  select * into o from public.orders where id = d.order_id;
  if not public.tkc_deliverable_order(o.id) then return null; end if;
  return jsonb_build_object(
    'delivery_email', d.delivery_email,
    'idempotency_key', d.idempotency_key,
    'order_id', o.id,
    'order_number', o.order_number,
    'customer_name', o.customer_name,
    'total', o.total,
    'currency', o.currency,
    'razorpay_payment_id', o.razorpay_payment_id,
    'item_count', (select count(*) from public.order_items where order_id = o.id),
    'attachments', coalesce((
      select jsonb_agg(jsonb_build_object('product_id', e.product_id, 'storage_path', e.storage_path) order by e.product_id)
      from public.download_entitlements e
      join public.order_items i on i.order_id = e.order_id and i.product_id = e.product_id and i.storage_path = e.storage_path
      where e.order_id = o.id and e.payment_id = o.razorpay_payment_id and e.revoked_at is null
    ), '[]'::jsonb)
  );
end;
$$;

-- Only the current claim holder may record an outcome; a stale worker's result is ignored.
create function public.tkc_finish_email_delivery(p jsonb) returns boolean
language plpgsql set search_path = '' as $$
declare sent boolean := p->>'outcome' = 'sent';
begin
  update public.email_deliveries set
    status = case when sent then 'sent' else 'failed' end,
    provider_message_id = case when sent then p->>'provider_message_id' else provider_message_id end,
    sent_at = case when sent then now() else sent_at end,
    delivery_email_locked_at = case when sent then now() else null end,
    failed_at = case when sent then failed_at else now() end,
    last_error = case when sent then null else p->>'error' end,
    claim_token = null, lease_expires_at = null, updated_at = now()
  where id = (p->>'delivery_id')::uuid and status = 'sending' and claim_token = (p->>'claim_token')::uuid;
  return found;
end;
$$;

alter table public.email_deliveries enable row level security;
revoke all on public.email_deliveries from public, anon, authenticated;
grant select, insert, update, delete on public.email_deliveries to service_role;
revoke all on function public.tkc_deliverable_order(uuid), public.tkc_claim_email_delivery(jsonb),
  public.tkc_claim_fallback_deliveries(jsonb), public.tkc_email_delivery_payload(jsonb),
  public.tkc_finish_email_delivery(jsonb) from public, anon, authenticated;
grant execute on function public.tkc_deliverable_order(uuid), public.tkc_claim_email_delivery(jsonb),
  public.tkc_claim_fallback_deliveries(jsonb), public.tkc_email_delivery_payload(jsonb),
  public.tkc_finish_email_delivery(jsonb) to service_role;

commit;
