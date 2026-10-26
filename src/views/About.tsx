export default function About() {
  return (
    <div
      className="mx-auto max-w-4xl px-4 py-20 sm:px-6 lg:px-8"
      data-testid="about-page"
    >
      <p className="overline">About the brand</p>
      <h1
        className="mt-5 font-serif text-5xl leading-tight text-[#29231f]"
        data-testid="about-heading"
      >
        Knowledge is everywhere. Clarity is rare.
      </h1>
      <div className="mt-10 grid gap-8 border-t border-[#2e241f]/10 pt-10 text-lg leading-relaxed text-[#6e655e]">
        <p data-testid="about-intro">
          The Knowledge Concierge creates carefully curated, practical business
          handbooks for people who want substantial information without
          unnecessary noise.
        </p>
        <p data-testid="about-philosophy">
          We focus on useful decisions, Indian market context, real-world
          scenarios, clear financial examples, worksheets, and frameworks that
          readers can return to when a business problem appears.
        </p>
        <blockquote
          className="border-l border-[#b49a6a] pl-6 font-serif text-3xl text-[#29231f]"
          data-testid="about-quote"
        >
          “Built to be read. Designed to be used.”
        </blockquote>
        <p data-testid="about-author">
          The restaurant collection is authored by Rakesh Chauhan, described in
          the supplied books as a chef and restaurant owner with hospitality
          experience in India and abroad. The four-book Start Selling Online Series is written and published by The Knowledge Concierge for people building physical-product businesses in India.
        </p>
      </div>
    </div>
  );
}
