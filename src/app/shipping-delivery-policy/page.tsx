import InformationPage from "@/components/InformationPage";
import { pageMetadata, publicPages } from "@/lib/seo";

const page = publicPages.shipping;
export const metadata = pageMetadata(page);

export default function Page() {
  return (
    <InformationPage title="Shipping & Delivery Policy" path={page.path}>
      <section>
        <h2>Digital Delivery Only</h2>
        <p>
          All products are digital PDF files. No physical books, printed
          materials, courier shipments or postal deliveries are provided.
        </p>
      </section>
      <section>
        <h2>Delivery Method</h2>
        <p>
          Following successful payment confirmation through Razorpay, purchased
          files are made available through the website download system. Guest
          checkout is supported; account creation is not required.
        </p>
      </section>
      <section>
        <h2>Delivery Timeline</h2>
        <p>
          Downloads are normally available immediately after successful payment.
          Payment verification or technical processing can occasionally take
          approximately 5-10 minutes.
        </p>
      </section>
      <section>
        <h2>Charges</h2>
        <p>
          There are no physical shipping or courier charges. The final payable
          amount is displayed at checkout.
        </p>
      </section>
      <section>
        <h2>Missing or Delayed Downloads</h2>
        <p>
          If access has not appeared after 10 minutes, email customer support with
          the checkout email, order ID or payment reference, and description of
          the problem. We will investigate and provide access or another
          appropriate resolution.
        </p>
      </section>
      <section>
        <h2>Format</h2>
        <p>Files are supplied in PDF format. A compatible PDF reader is required.</p>
      </section>
      <section>
        <h2>Contact</h2>
        <p>
          Email: <a href="mailto:theknowledgeconcierge@gmail.com">theknowledgeconcierge@gmail.com</a>
        </p>
        <p>Support Hours: Monday-Saturday, 12:00 PM-6:00 PM IST</p>
        <p>
          Business Address: 1031/936, Kot East, Near Punjabi Mandir, Sarthal Chowki,
          Sambhal, Uttar Pradesh, India
        </p>
      </section>
    </InformationPage>
  );
}
