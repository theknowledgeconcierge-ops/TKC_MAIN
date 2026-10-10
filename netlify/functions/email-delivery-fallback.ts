// Netlify Scheduled Function: runs only on the published production deploy, every five
// minutes. It delivers books for paid orders whose buyer closed the tab before confirming.
export default async function emailDeliveryFallback() {
  const origin = process.env.APP_URL ?? process.env.URL;
  const secret = process.env.EMAIL_DELIVERY_CRON_SECRET;
  if (!origin || !secret) {
    console.error(JSON.stringify({ event: "email_fallback_not_configured" }));
    return;
  }
  try {
    const response = await fetch(new URL("/api/internal/email-deliveries", origin), {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(25000),
    });
    console.log(
      JSON.stringify({ event: "email_fallback_run", status: response.status }),
    );
  } catch {
    // The next run retries; delivery state lives in the database, not here.
    console.error(JSON.stringify({ event: "email_fallback_unreachable" }));
  }
}
export const config = { schedule: "*/5 * * * *" };
