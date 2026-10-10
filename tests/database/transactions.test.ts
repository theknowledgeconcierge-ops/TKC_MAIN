import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { randomUUID } from "node:crypto";
import { catalogue } from "@/lib/catalog";
const pool = new pg.Pool({
  connectionString: process.env.TEST_DATABASE_URL,
  max: 8,
});
const rpc = async (name: string, input: unknown) =>
  (
    await pool.query(`select public.${name}($1::jsonb) as result`, [
      JSON.stringify(input),
    ])
  ).rows[0].result;
const input = (token = randomUUID().replaceAll("-", "").repeat(2)) => ({
  id: randomUUID(),
  access_token_hash: token,
  request_hash: "b".repeat(64),
  customer_name: "Buyer",
  customer_email: "buyer@example.com",
  customer_mobile: "9876543210",
  subtotal: 24900,
  total: 24900,
  payment_mode: "test",
  pricing: { book_count: 1, total_inr: 249 },
  items: [
    {
      product_id: "the-first-table",
      product_title: "The First Table",
      unit_price: 24900,
      quantity: 1,
      storage_path: "handbooks/the-first-table.pdf",
    },
  ],
});
beforeAll(async () => {
  await pool.query("select 1");
});
afterAll(async () => {
  await pool.end();
});

describe("real PostgreSQL transaction invariants", () => {
  it("snapshots and fulfills all five handbooks once under repeated captured events", async () => {
    const data = {
      ...input(),
      subtotal: 124500,
      total: 49900,
      pricing: { book_count: 5, total_inr: 499 },
      items: catalogue.map((book) => ({
        product_id: book.id,
        product_title: book.title,
        unit_price: book.price_paise,
        quantity: 1,
        storage_path: `handbooks/${book.id}.pdf`,
      })),
    };
    await rpc("tkc_create_order", data);
    const providerOrder = "order_" + data.id.replaceAll("-", "");
    await rpc("tkc_bind_gateway", {
      order_id: data.id,
      razorpay_order_id: providerOrder,
    });
    const event = {
      order_id: data.id,
      razorpay_order_id: providerOrder,
      payment_id: "pay_" + data.id.replaceAll("-", ""),
      amount: 49900,
      currency: "INR",
      status: "captured",
      amount_refunded: 0,
      event_key: "five:" + data.id,
      event_type: "payment.captured",
    };
    await Promise.all(
      Array.from({ length: 4 }, () => rpc("tkc_apply_payment", event)),
    );
    await rpc("tkc_apply_payment", {
      ...event,
      event_key: "repeat:" + data.id,
    });
    const rows = (
      await pool.query(
        "select product_id, storage_path from public.download_entitlements where order_id=$1",
        [data.id],
      )
    ).rows;
    expect(rows).toHaveLength(5);
    expect(rows).toContainEqual({
      product_id: "empty-tables-to-full-house",
      storage_path: "handbooks/empty-tables-to-full-house.pdf",
    });
    expect(
      (
        await pool.query(
          "select total, status from public.orders where id=$1",
          [data.id],
        )
      ).rows[0],
    ).toEqual({ total: 49900, status: "paid" });
  });
  it("atomically creates one order and snapshot for concurrent submissions", async () => {
    const data = input();
    const results = await Promise.all(
      Array.from({ length: 8 }, () => rpc("tkc_create_order", data)),
    );
    expect(new Set(results.map((row) => row.id)).size).toBe(1);
    expect(
      (
        await pool.query(
          "select count(*)::int as n from public.order_items where order_id=$1",
          [data.id],
        )
      ).rows[0].n,
    ).toBe(1);
  });
  it("rejects reuse of an idempotency token for different details", async () => {
    const data = input();
    await rpc("tkc_create_order", data);
    await expect(
      rpc("tkc_create_order", { ...data, request_hash: "c".repeat(64) }),
    ).rejects.toThrow("idempotency_conflict");
  });
  it("fulfills once under concurrent callbacks and webhooks, and never downgrades paid", async () => {
    const data = input();
    await rpc("tkc_create_order", data);
    await rpc("tkc_bind_gateway", {
      order_id: data.id,
      razorpay_order_id: "order_" + data.id.replaceAll("-", ""),
    });
    const event = {
      order_id: data.id,
      razorpay_order_id: "order_" + data.id.replaceAll("-", ""),
      payment_id: "pay_" + data.id.replaceAll("-", ""),
      amount: 24900,
      currency: "INR",
      status: "captured",
      amount_refunded: 0,
      event_key: "captured:" + data.id,
      event_type: "payment.captured",
    };
    const results = await Promise.all(
      Array.from({ length: 8 }, () => rpc("tkc_apply_payment", event)),
    );
    expect(results.filter((row) => !row.duplicate)).toHaveLength(1);
    await rpc("tkc_apply_payment", {
      ...event,
      event_key: "failed:" + data.id,
      status: "failed",
    });
    expect(
      (
        await pool.query("select status from public.orders where id=$1", [
          data.id,
        ])
      ).rows[0].status,
    ).toBe("paid");
    expect(
      (
        await pool.query(
          "select count(*)::int as n from public.download_entitlements where order_id=$1",
          [data.id],
        )
      ).rows[0].n,
    ).toBe(1);
    await rpc("tkc_apply_payment", {
      ...event,
      event_key: "refund:" + data.id,
      status: "refunded",
      amount_refunded: 100,
    });
    await rpc("tkc_apply_payment", {
      ...event,
      event_key: "latecapture:" + data.id,
    });
    expect(
      (
        await pool.query("select status from public.orders where id=$1", [
          data.id,
        ])
      ).rows[0].status,
    ).toBe("refunded");
    expect(
      (
        await pool.query(
          "select revoked_at from public.download_entitlements where order_id=$1",
          [data.id],
        )
      ).rows[0].revoked_at,
    ).not.toBeNull();
  });
  it("rolls back event insertion and fulfillment for a wrong amount", async () => {
    const data = input();
    await rpc("tkc_create_order", data);
    await rpc("tkc_bind_gateway", {
      order_id: data.id,
      razorpay_order_id: "order_wrongamount",
    });
    await expect(
      rpc("tkc_apply_payment", {
        order_id: data.id,
        razorpay_order_id: "order_wrongamount",
        payment_id: "pay_wrongamount",
        amount: 100,
        currency: "INR",
        status: "captured",
        amount_refunded: 0,
        event_key: "bad-amount",
        event_type: "test",
      }),
    ).rejects.toThrow("payment_mismatch");
    expect(
      (
        await pool.query(
          "select count(*)::int as n from public.payment_events where event_key='bad-amount'",
        )
      ).rows[0].n,
    ).toBe(0);
  });
  it("serializes distinct callback and webhook event keys without duplicate fulfillment", async () => {
    const data = input();
    await rpc("tkc_create_order", data);
    const gateway = "order_" + data.id.replaceAll("-", "");
    await rpc("tkc_bind_gateway", {
      order_id: data.id,
      razorpay_order_id: gateway,
    });
    await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        rpc("tkc_apply_payment", {
          order_id: data.id,
          razorpay_order_id: gateway,
          payment_id: "pay_" + data.id.replaceAll("-", ""),
          amount: 24900,
          currency: "INR",
          status: "captured",
          amount_refunded: 0,
          event_key: `${data.id}:${i}`,
          event_type: i % 2 ? "callback.verified" : "payment.captured",
        }),
      ),
    );
    expect(
      (
        await pool.query(
          "select count(*)::int as n from public.payment_events where order_id=$1",
          [data.id],
        )
      ).rows[0].n,
    ).toBe(8);
    expect(
      (
        await pool.query(
          "select count(*)::int as n from public.download_entitlements where order_id=$1",
          [data.id],
        )
      ).rows[0].n,
    ).toBe(1);
    expect(
      (
        await pool.query("select status from public.orders where id=$1", [
          data.id,
        ])
      ).rows[0].status,
    ).toBe("paid");
  });
  it("blocks anonymous/authenticated table reads and privileged RPCs", async () => {
    const client = await pool.connect();
    try {
      for (const role of ["anon", "authenticated"]) {
        await client.query(`set role ${role}`);
        await expect(
          client.query("select * from public.orders"),
        ).rejects.toThrow("permission denied");
        await expect(
          client.query("select public.tkc_apply_payment('{}')"),
        ).rejects.toThrow("permission denied");
        await client.query("reset role");
      }
    } finally {
      client.release();
    }
  });
  it("rolls back a failure after payment/event writes and retries fulfillment atomically", async () => {
    const data = input();
    await rpc("tkc_create_order", data);
    await rpc("tkc_bind_gateway", {
      order_id: data.id,
      razorpay_order_id: "order_rollback",
    });
    const event = {
      order_id: data.id,
      razorpay_order_id: "order_rollback",
      payment_id: "pay_rollback",
      amount: 24900,
      currency: "INR",
      status: "captured",
      amount_refunded: 0,
      event_key: "rollback-test",
      event_type: "test",
    };
    await pool.query(
      "create function public.test_fail_entitlement() returns trigger language plpgsql as $$ begin raise exception 'temporary_fulfillment_failure'; end; $$; create trigger test_fail before insert on public.download_entitlements for each row execute function public.test_fail_entitlement()",
    );
    try {
      await expect(rpc("tkc_apply_payment", event)).rejects.toThrow(
        "temporary_fulfillment_failure",
      );
      expect(
        (
          await pool.query("select status from public.orders where id=$1", [
            data.id,
          ])
        ).rows[0].status,
      ).toBe("payment_pending");
      expect(
        (
          await pool.query(
            "select count(*)::int as n from public.payment_events where event_key='rollback-test'",
          )
        ).rows[0].n,
      ).toBe(0);
      expect(
        (
          await pool.query(
            "select count(*)::int as n from public.payments where id='pay_rollback'",
          )
        ).rows[0].n,
      ).toBe(0);
    } finally {
      await pool.query(
        "drop trigger test_fail on public.download_entitlements; drop function public.test_fail_entitlement()",
      );
    }
    expect((await rpc("tkc_apply_payment", event)).duplicate).toBe(false);
    expect(
      (
        await pool.query(
          "select count(*)::int as n from public.download_entitlements where order_id=$1",
          [data.id],
        )
      ).rows[0].n,
    ).toBe(1);
  });
  it("creates a private PDF bucket and no public storage policies", async () => {
    expect(
      (
        await pool.query(
          "select public from storage.buckets where id='handbooks'",
        )
      ).rows[0].public,
    ).toBe(false);
    expect(
      (
        await pool.query(
          "select count(*)::int as n from pg_policies where schemaname in ('public','storage')",
        )
      ).rows[0].n,
    ).toBe(0);
  });
});
