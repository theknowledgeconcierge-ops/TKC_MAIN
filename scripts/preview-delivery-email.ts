// Local development preview of the purchase delivery email, using fake data only.
// Writes ignored files under email-preview/; never part of the build or deployment.
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { renderPurchaseDeliveryEmail } from "../src/lib/email/purchase-delivery-email";

const titles = [
  "The First Table",
  "The Full Table",
  "Behind the Kitchen Door",
  "The Math Behind the Menu",
  "Empty Tables to Full House",
];
const fixtures = {
  "five-books": { bookTitles: titles, formattedAmount: "₹499" },
  "one-book": { bookTitles: [titles[0]], formattedAmount: "₹199" },
};
const directory = resolve("email-preview");
mkdirSync(directory, { recursive: true });
for (const [name, fixture] of Object.entries(fixtures)) {
  const email = renderPurchaseDeliveryEmail({
    firstName: "Rahul",
    displayOrderId: "TKC-12345678",
    ...fixture,
  });
  writeFileSync(join(directory, `${name}.html`), email.html);
  writeFileSync(
    join(directory, `${name}.txt`),
    `Subject: ${email.subject}\n\n${email.text}\n`,
  );
  console.log(`${name}: ${join(directory, `${name}.html`)}`);
}
