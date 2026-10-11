import InformationPage from "@/components/InformationPage";
import { pageMetadata, publicPages } from "@/lib/seo";

const page = publicPages.contact;
export const metadata = pageMetadata(page);

export default function Page() {
  return (
    <InformationPage title="Contact Us" path={page.path}>
      <section>
        <h2>We Are Here to Help</h2>
        <p>
          Questions about books, bundles, payments, orders or download problems?
          Contact THE KNOWLEDGE CONCIERGE for assistance.
        </p>
      </section>
      <section>
        <h2>Customer Support</h2>
        <p>
          Email: <a href="mailto:theknowledgeconcierge@gmail.com">theknowledgeconcierge@gmail.com</a>
        </p>
        <p>Monday-Saturday, 12:00 PM-6:00 PM IST</p>
        <p>Sunday: Closed</p>
      </section>
      <section>
        <h2>How We Can Help</h2>
        <p>
          We assist with order confirmations, payment enquiries, download links,
          PDF access, book and bundle information, and general customer questions.
          For order-related enquiries, include your checkout email and order ID or
          payment reference.
        </p>
      </section>
      <section>
        <h2>Business Details</h2>
        <p>Trading name: THE KNOWLEDGE CONCIERGE</p>
        <p>Business structure: Sole proprietorship</p>
        <p>
          Address: 1031/936, Kot East, Near Punjabi Mandir, Sarthal Chowki, Sambhal,
          Uttar Pradesh, India
        </p>
      </section>
      <section>
        <h2>Consumer Grievances</h2>
        <p>
          Grievance email: <a href="mailto:theknowledgeconcierge@gmail.com">theknowledgeconcierge@gmail.com</a>
        </p>
        <p>
          We aim to acknowledge consumer grievances within 48 hours and resolve
          them within one month of receipt, in line with applicable requirements.
        </p>
      </section>
    </InformationPage>
  );
}
