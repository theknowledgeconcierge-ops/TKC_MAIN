import "server-only";
import { z } from "zod";
import { formatInr } from "@/lib/catalog";

export const DEFAULT_EMAIL_FROM = "Pixel n Palm <books@pixelnpalm.com>";
// Resend rejects messages over 40MB including Base64-encoded attachments.
// Keep headroom for headers, the HTML/text body and JSON framing.
export const MAX_ATTACHMENT_BYTES = 38 * 1024 * 1024;

export interface EmailAttachment {
  filename: string;
  content: Buffer;
}
export interface EmailMessage {
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  attachments: EmailAttachment[];
  idempotencyKey: string;
}
export interface EmailProvider {
  readonly name: "resend" | "test";
  send(message: EmailMessage): Promise<{ id: string }>;
}
// Codes are stored and logged; they never contain addresses or provider payloads.
export class EmailDeliveryError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

export const encodedSize = (attachments: EmailAttachment[]) =>
  attachments.reduce(
    (total, file) => total + Math.ceil(file.content.length / 3) * 4,
    0,
  );
export function assertWithinEmailLimit(attachments: EmailAttachment[]) {
  if (encodedSize(attachments) > MAX_ATTACHMENT_BYTES)
    throw new EmailDeliveryError("attachments_too_large");
}

const resendResponse = z.object({ id: z.string().min(1).max(200) });
const resendError = z.object({ name: z.string().optional() }).passthrough();
export function createResendProvider(apiKey: string): EmailProvider {
  return {
    name: "resend",
    async send(message) {
      let response: Response;
      try {
        response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          cache: "no-store",
          signal: AbortSignal.timeout(25000),
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "Idempotency-Key": message.idempotencyKey,
            // Resend rejects requests without a User-Agent.
            "User-Agent": "pixelnpalm-store/1.0",
          },
          body: JSON.stringify({
            from: message.from,
            to: [message.to],
            subject: message.subject,
            html: message.html,
            text: message.text,
            attachments: message.attachments.map((file) => ({
              filename: file.filename,
              content: file.content.toString("base64"),
            })),
          }),
        });
      } catch {
        // Unknown outcome: the stable idempotency key makes a later retry safe.
        throw new EmailDeliveryError("provider_timeout");
      }
      if (!response.ok) {
        const name = resendError.safeParse(
          await response.json().catch(() => ({})),
        ).data?.name;
        console.error(
          JSON.stringify({
            event: "email_provider_http_failure",
            status: response.status,
          }),
        );
        throw new EmailDeliveryError(
          response.status === 409
            ? name === "concurrent_idempotent_requests"
              ? "provider_busy"
              : "provider_conflict"
            : response.status === 429
              ? "provider_rate_limited"
              : response.status >= 500
                ? "provider_unavailable"
                : "provider_rejected",
        );
      }
      const parsed = resendResponse.safeParse(
        await response.json().catch(() => null),
      );
      if (!parsed.success) throw new EmailDeliveryError("provider_invalid_response");
      return { id: parsed.data.id };
    },
  };
}

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character]!,
  );
// The full order number embeds the internal UUID; customers only need a short reference.
export const displayOrderNumber = (orderNumber: string) =>
  `TKC-${orderNumber.replace(/^TKC-/, "").slice(0, 8).toUpperCase()}`;

export function deliveryEmailContent(input: {
  customerName: string;
  orderNumber: string;
  amountPaise: number;
  paymentReference: string;
  titles: string[];
}) {
  const firstName = input.customerName.trim().split(/\s+/)[0] || "there";
  const order = displayOrderNumber(input.orderNumber);
  const amount = formatInr(input.amountPaise / 100);
  const subject = "Your Pixel n Palm books are here 📚";
  const text = [
    `Hi ${firstName},`,
    "",
    "Thank you for your purchase.",
    "",
    "Your Pixel n Palm books are attached to this email:",
    ...input.titles.map((title) => `- ${title}`),
    "",
    `Order: ${order}`,
    `Amount paid: ${amount}`,
    `Payment reference: ${input.paymentReference}`,
    "",
    "Keep this email safe so you can access your books again whenever you need them.",
    "",
    "Enjoy reading,",
    "Pixel n Palm",
  ].join("\n");
  const html = `<!doctype html><html><body style="margin:0;background:#f7f4ee;font-family:Georgia,'Times New Roman',serif;color:#29231f">
<div style="max-width:560px;margin:0 auto;padding:32px 24px">
<p style="font:600 11px/1.4 Arial,sans-serif;letter-spacing:.16em;text-transform:uppercase;color:#8c6d46;margin:0 0 20px">Pixel n Palm</p>
<p style="font-size:17px;line-height:1.6;margin:0 0 16px">Hi ${escapeHtml(firstName)},</p>
<p style="font-size:17px;line-height:1.6;margin:0 0 16px">Thank you for your purchase.</p>
<p style="font-size:17px;line-height:1.6;margin:0 0 8px">Your Pixel n Palm books are attached to this email:</p>
<ul style="font-size:16px;line-height:1.6;margin:0 0 20px;padding-left:20px">${input.titles.map((title) => `<li>${escapeHtml(title)}</li>`).join("")}</ul>
<table role="presentation" style="font:14px/1.6 Arial,sans-serif;color:#6e655e;border-top:1px solid #e3d9c8;border-bottom:1px solid #e3d9c8;padding:12px 0;margin:0 0 20px;width:100%">
<tr><td>Order</td><td style="text-align:right;color:#29231f">${escapeHtml(order)}</td></tr>
<tr><td>Amount paid</td><td style="text-align:right;color:#29231f">${escapeHtml(amount)}</td></tr>
<tr><td>Payment reference</td><td style="text-align:right;color:#29231f">${escapeHtml(input.paymentReference)}</td></tr>
</table>
<p style="font-size:16px;line-height:1.6;margin:0 0 16px">Keep this email safe so you can access your books again whenever you need them.</p>
<p style="font-size:16px;line-height:1.6;margin:0">Enjoy reading,<br>Pixel n Palm</p>
</div></body></html>`;
  return { subject, text, html };
}
