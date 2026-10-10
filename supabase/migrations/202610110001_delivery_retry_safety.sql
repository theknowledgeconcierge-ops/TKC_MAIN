begin;

-- Record uncertainty before an external call, so worker crashes are fenced too.
alter table public.email_deliveries
  add column send_window_started_at timestamptz,
  add column outcome_uncertain boolean not null default false,
  add column prior_outcome_uncertain boolean not null default false;
-- Historical unfinished attempts may already have been accepted. Fail closed.
update public.email_deliveries set send_window_started_at = created_at,
  outcome_uncertain = true, prior_outcome_uncertain = true
where attempt_count > 0 and status <> 'sent';
alter table public.email_deliveries add constraint email_uncertainty_window
  check (not outcome_uncertain or send_window_started_at is not null);

create or replace function public.tkc_claim_email_delivery(p jsonb) returns jsonb
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
  -- An accepted-but-unrecorded send must never acquire a new address/key.
  if requested is not null and requested <> d.delivery_email and d.outcome_uncertain then
    raise exception 'delivery_outcome_unknown';
  end if;
  -- Resend forgets keys after 24h. Leave an hour for request and clock headroom.
  if d.outcome_uncertain and d.send_window_started_at <= now() - interval '23 hours' then
    return jsonb_build_object('outcome', 'needs_reconciliation');
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
    send_window_started_at = case when outcome_uncertain then send_window_started_at else now() end,
    prior_outcome_uncertain = outcome_uncertain, outcome_uncertain = true,
    attempt_count = attempt_count + 1, provider = p->>'provider',
    delivery_email_confirmed_at = coalesce(delivery_email_confirmed_at, now()), updated_at = now()
  where id = d.id returning * into d;
  return jsonb_build_object('outcome', 'claimed', 'delivery_id', d.id, 'claim_token', d.claim_token);
end;
$$;

-- Close-tab fallback: recent paid orders whose buyer never confirmed or corrected the address.
create or replace function public.tkc_claim_fallback_deliveries(p jsonb) returns jsonb
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
      and (not d.outcome_uncertain or d.send_window_started_at > now() - interval '23 hours')
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
      send_window_started_at = case when d.outcome_uncertain then d.send_window_started_at else now() end,
      prior_outcome_uncertain = d.outcome_uncertain, outcome_uncertain = true,
      attempt_count = d.attempt_count + 1, provider = p->>'provider', updated_at = now()
    from due where d.id = due.id
    returning d.id, d.claim_token
  )
  select coalesce(jsonb_agg(jsonb_build_object('delivery_id', id, 'claim_token', claim_token)), '[]'::jsonb)
    into claimed from updated;
  return claimed;
end;
$$;

create or replace function public.tkc_finish_email_delivery(p jsonb) returns boolean
language plpgsql set search_path = '' as $$
declare sent boolean := p->>'outcome' = 'sent';
begin
  update public.email_deliveries set
    status = case when sent then 'sent' else 'failed' end,
    -- Only definite pre-acceptance failures can clear this attempt's uncertainty.
    -- A previous timeout stays uncertain even if a later attempt is rejected.
    outcome_uncertain = case
      when sent then false
      when p->>'error' in ('provider_rejected', 'provider_rate_limited',
        'storage_unavailable', 'invalid_attachment', 'attachments_too_large',
        'incomplete_entitlements', 'attachment_mapping_mismatch',
        'not_deliverable', 'payment_not_confirmed') then prior_outcome_uncertain
      else true end,
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

commit;
