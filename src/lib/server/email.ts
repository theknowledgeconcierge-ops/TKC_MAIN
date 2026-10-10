import "server-only";
import { z } from "zod";
import { formatInr } from "@/lib/catalog";
import { renderPurchaseDeliveryEmail } from "@/lib/email/purchase-delivery-email";

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

// The full order number embeds the internal UUID; customers only need a short reference.
export const displayOrderNumber = (orderNumber: string) =>
  `TKC-${orderNumber.replace(/^TKC-/, "").slice(0, 8).toUpperCase()}`;

// Maps server-side order data onto the version-controlled template.
export function deliveryEmailContent(input: {
  customerName: string;
  orderNumber: string;
  amountPaise: number;
  titles: string[];
}) {
  return renderPurchaseDeliveryEmail({
    firstName: input.customerName.trim().split(/\s+/)[0] ?? "",
    displayOrderId: displayOrderNumber(input.orderNumber),
    bookTitles: input.titles,
    formattedAmount: formatInr(input.amountPaise / 100),
  });
}
