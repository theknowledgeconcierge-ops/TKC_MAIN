import InformationPage from "@/components/InformationPage";
import { pageMetadata, publicPages } from "@/lib/seo";

const page = publicPages.refunds;
export const metadata = pageMetadata(page);

export default function Page() {
  return (
    <InformationPage title="Refund & Cancellation Policy" path={page.path}>
      <section>
        <h2>Digital Products - No Returns</h2>
        <p>
          We sell downloadable PDF eBooks, educational guides, handbooks and
          digital bundles. These are electronically delivered products and cannot
          be physically returned. We do not accept returns or exchanges.
        </p>
      </section>
      <section>
        <h2>Refunds</h2>
        <p>
          Purchases are final and we do not offer discretionary refunds for change
          of mind, accidental purchase, failure to review a description,
          dissatisfaction with writing style, non-use, or selecting a bundle
          rather than individual books. This does not limit any refund,
          replacement, or remedy required under applicable Indian law.
        </p>
      </section>
      <section>
        <h2>Cancellations</h2>
        <p>
          Orders generally cannot be cancelled after payment has been processed
          and download access provided. Contact support immediately if an order
          has not been fulfilled; requests are assessed according to order status
          and applicable law.
        </p>
      </section>
      <section>
        <h2>Payment or Technical Problems</h2>
        <p>
          For a duplicate charge, payment deduction without confirmation, missing
          download, broken link, or corrupted/unreadable PDF, contact support with
          your order ID or payment reference. We will investigate and provide an
          appropriate remedy, such as restoring access, replacing a file, or
          refunding where appropriate or legally required.
        </p>
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
