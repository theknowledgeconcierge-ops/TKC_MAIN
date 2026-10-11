import InformationPage from "@/components/InformationPage";
import { pageMetadata, publicPages } from "@/lib/seo";

const page = publicPages.disclaimer;
export const metadata = pageMetadata(page);

export default function Page() {
  return (
    <InformationPage title="Disclaimer" path={page.path}>
      <section>
        <h2>Educational Purposes</h2>
        <p>
          THE KNOWLEDGE CONCIERGE publications offer general educational
          information, examples, checklists, templates and business frameworks.
          They are not individualized professional advice.
        </p>
      </section>
      <section>
        <h2>No Guaranteed Outcomes</h2>
        <p>
          We do not guarantee sales growth, profitability, customer acquisition,
          commercial success or any financial result from reading or implementing
          the content.
        </p>
      </section>
      <section>
        <h2>Independent Decisions</h2>
        <p>
          Readers must evaluate their own circumstances, costs, risks, resources
          and market conditions, and seek qualified legal, financial, accounting,
          tax or regulatory advice when appropriate.
        </p>
      </section>
      <section>
        <h2>Accuracy and Updates</h2>
        <p>
          We aim for useful and accurate information, but laws, business
          conditions, prices and practices can change. Verify material facts
          independently before significant decisions. Some examples and
          projections may be illustrative.
        </p>
      </section>
      <section>
        <h2>Liability</h2>
        <p>
          To the extent permitted by law, we are not liable for commercial or
          financial outcomes arising from reliance on our educational materials.
          Statutory consumer rights remain unaffected.
        </p>
      </section>
      <section>
        <h2>Contact</h2>
        <p>
          Email: <a href="mailto:theknowledgeconcierge@gmail.com">theknowledgeconcierge@gmail.com</a>
        </p>
      </section>
    </InformationPage>
  );
}
