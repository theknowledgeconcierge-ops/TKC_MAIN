-- Expand valid titles and new-order capacity. Historical orders and entitlements are untouched.
begin;
alter table public.order_items drop constraint order_items_product_id_check;
alter table public.order_items add constraint order_items_product_id_check check (product_id in ('the-first-table', 'the-full-table', 'behind-the-kitchen-door', 'the-math-behind-the-menu', 'empty-tables-to-full-house', 'from-someday-to-sold', 'stop-scrolling-start-selling', 'sold-out-still-broke', 'nobody-told-me-this'));

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
    if jsonb_array_length(p->'items') not between 1 and 9 then raise exception 'invalid_items'; end if;
    for item in select * from jsonb_array_elements(p->'items') loop
      insert into public.order_items(order_id, product_id, product_title, unit_price, quantity, storage_path)
      values (o.id, item->>'product_id', item->>'product_title', (item->>'unit_price')::int, (item->>'quantity')::int, item->>'storage_path');
    end loop;
    if (select sum(unit_price * quantity) from public.order_items where order_id=o.id) <> o.subtotal then raise exception 'subtotal_mismatch'; end if;
  end if;
  return to_jsonb(o);
end;
$$;

commit;
