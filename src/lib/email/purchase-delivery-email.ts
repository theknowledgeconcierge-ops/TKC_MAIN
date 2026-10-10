// Version-controlled transactional template for post-purchase book delivery.
// Pure and dependency-free: no images, scripts, external CSS, tracking or links that
// carry customer data. Output is deterministic so a provider idempotency retry sends
// an identical payload.

export interface PurchaseDeliveryEmailInput {
  firstName: string;
  displayOrderId: string;
  bookTitles: readonly string[];
  formattedAmount: string;
}
export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export const PURCHASE_DELIVERY_SUBJECT = "Your Pixel n Palm books are here 📚";
const SITE_URL = "https://pixelnpalm.com";
const colors = {
  page: "#efe9de",
  card: "#fbf9f5",
  panel: "#f5f0e6",
  ink: "#29231f",
  dark: "#302821",
  muted: "#6e655e",
  gold: "#b49a6a",
  goldText: "#8c6d46",
  rule: "#e3d9c8",
};
const serif = "Georgia, 'Times New Roman', Times, serif";
const sans = "'Helvetica Neue', Helvetica, Arial, sans-serif";

export const escapeHtml = (value: string) =>
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
// Customer-controlled text is reduced to a single line before use in either part.
const singleLine = (value: string) =>
  Array.from(value, (character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127 ? " " : character;
  })
    .join("")
    .replace(/\s+/g, " ")
    .trim();

export function renderPurchaseDeliveryEmail(
  input: PurchaseDeliveryEmailInput,
): RenderedEmail {
  const titles = input.bookTitles.map(singleLine).filter(Boolean);
  if (!titles.length) throw new Error("A delivery email needs at least one book");
  const firstName = singleLine(input.firstName) || "there";
  const orderId = singleLine(input.displayOrderId);
  const amount = singleLine(input.formattedAmount);
  const single = titles.length === 1;
  const hero = single ? "Your book is here." : "Your books are here.";
  const intro = single
    ? "Thank you for your purchase. Your Pixel n Palm book is attached to this email and ready to read."
    : "Thank you for your purchase. Your Pixel n Palm books are attached to this email and ready to read.";
  const keepSafe = single
    ? "Your book is attached directly to this email. Keep this email somewhere safe so you can access it again whenever you need it."
    : "Your books are attached directly to this email. Keep this email somewhere safe so you can access them again whenever you need them.";
  const footerNote =
    "This is a transactional email sent because you purchased digital books from Pixel n Palm.";
  const number = (index: number) => String(index + 1).padStart(2, "0");
  const summary: [string, string][] = [
    ["Order", orderId],
    ["Books", String(titles.length)],
    ["Amount paid", amount],
    ["Delivery", "PDF attachments"],
  ];

  const text = [
    "PIXEL N PALM",
    "",
    hero,
    "",
    `Hi ${firstName},`,
    "",
    intro,
    "",
    "ORDER SUMMARY",
    ...summary.map(([label, value]) => `${label}: ${value}`),
    "",
    single ? "YOUR BOOK" : "YOUR BOOKS",
    ...titles.map((title, index) => `${number(index)}  ${title}`),
    "",
    keepSafe,
    "",
    "--",
    "Pixel n Palm",
    "Digital books for curious minds.",
    "pixelnpalm.com",
    "",
    footerNote,
  ].join("\n");

  const label = `font-family:${sans};font-size:11px;line-height:16px;letter-spacing:2px;text-transform:uppercase;color:${colors.goldText};font-weight:bold;`;
  const summaryRows = summary
    .map(
      ([name, value], index) => `
<tr>
<td class="summary-cell" style="padding:12px 0;${index ? `border-top:1px solid ${colors.rule};` : ""}font-family:${sans};font-size:14px;line-height:20px;color:${colors.muted};" valign="top">${escapeHtml(name)}</td>
<td class="summary-cell" align="right" style="padding:12px 0;${index ? `border-top:1px solid ${colors.rule};` : ""}font-family:${sans};font-size:14px;line-height:20px;color:${colors.ink};font-weight:bold;word-break:break-word;" valign="top">${escapeHtml(value)}</td>
</tr>`,
    )
    .join("");
  const bookRows = titles
    .map(
      (title, index) => `
<tr>
<td width="44" style="padding:14px 0;${index ? `border-top:1px solid ${colors.rule};` : ""}font-family:${sans};font-size:12px;line-height:24px;letter-spacing:1px;color:${colors.gold};font-weight:bold;" valign="top">${number(index)}</td>
<td style="padding:14px 0;${index ? `border-top:1px solid ${colors.rule};` : ""}font-family:${serif};font-size:18px;line-height:24px;color:${colors.ink};word-break:break-word;overflow-wrap:anywhere;" valign="top">${escapeHtml(title)}</td>
</tr>`,
    )
    .join("");

  const html = `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escapeHtml(PURCHASE_DELIVERY_SUBJECT)}</title>
<style>
body,table,td{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}
table{border-collapse:collapse}
@media only screen and (max-width:620px){
.shell{width:100%!important}
.pad{padding-left:24px!important;padding-right:24px!important}
.hero{font-size:34px!important;line-height:40px!important}
.summary-cell{font-size:13px!important}
}
</style>
</head>
<body style="margin:0;padding:0;background-color:${colors.page};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all;">${escapeHtml(keepSafe)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${colors.page};">
<tr>
<td align="center" style="padding:32px 12px;">
<!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" class="shell" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background-color:${colors.card};border:1px solid ${colors.rule};">
<tr>
<td align="center" style="background-color:${colors.dark};padding:22px 24px;font-family:${serif};font-size:15px;line-height:20px;letter-spacing:5px;color:#f7f4ee;">PIXEL N PALM</td>
</tr>
<tr>
<td class="pad" style="padding:44px 48px 8px 48px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;">
<tr>
<td width="40" height="40" align="center" valign="middle" style="width:40px;height:40px;border:1px solid ${colors.gold};border-radius:20px;font-family:${sans};font-size:18px;line-height:40px;color:${colors.goldText};">&#10003;</td>
<td style="padding-left:14px;${label}">Payment confirmed &middot; Delivered</td>
</tr>
</table>
<h1 class="hero" style="margin:28px 0 0 0;font-family:${serif};font-size:40px;line-height:46px;font-weight:normal;color:${colors.ink};">${escapeHtml(hero)}</h1>
<p style="margin:28px 0 0 0;font-family:${sans};font-size:16px;line-height:26px;color:${colors.ink};">Hi ${escapeHtml(firstName)},</p>
<p style="margin:12px 0 0 0;font-family:${sans};font-size:16px;line-height:26px;color:${colors.muted};">${escapeHtml(intro)}</p>
</td>
</tr>
<tr>
<td class="pad" style="padding:32px 48px 0 48px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${colors.panel};border:1px solid ${colors.rule};">
<tr>
<td style="padding:22px 24px 10px 24px;">
<p style="margin:0 0 6px 0;${label}">Order summary</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${summaryRows}
</table>
</td>
</tr>
</table>
</td>
</tr>
<tr>
<td class="pad" style="padding:36px 48px 0 48px;">
<p style="margin:0 0 6px 0;${label}">${single ? "Your book" : "Your books"}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid ${colors.ink};border-bottom:1px solid ${colors.rule};">${bookRows}
</table>
</td>
</tr>
<tr>
<td class="pad" style="padding:28px 48px 44px 48px;">
<p style="margin:0;padding-left:16px;border-left:2px solid ${colors.gold};font-family:${serif};font-size:16px;line-height:26px;color:${colors.ink};">${escapeHtml(keepSafe)}</p>
</td>
</tr>
<tr>
<td class="pad" align="center" style="padding:28px 48px 32px 48px;border-top:1px solid ${colors.rule};background-color:${colors.panel};">
<p style="margin:0;font-family:${serif};font-size:16px;line-height:22px;letter-spacing:1px;color:${colors.ink};">Pixel n Palm</p>
<p style="margin:4px 0 0 0;font-family:${sans};font-size:13px;line-height:20px;color:${colors.muted};">Digital books for curious minds.</p>
<p style="margin:4px 0 0 0;font-family:${sans};font-size:13px;line-height:20px;"><a href="${SITE_URL}" style="color:${colors.goldText};text-decoration:underline;">pixelnpalm.com</a></p>
<p style="margin:18px 0 0 0;font-family:${sans};font-size:11px;line-height:17px;color:${colors.muted};">${escapeHtml(footerNote)}</p>
</td>
</tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td>
</tr>
</table>
</body>
</html>`;
  return { subject: PURCHASE_DELIVERY_SUBJECT, html, text };
}
