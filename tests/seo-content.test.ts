import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import Faq from "@/views/Faq";

it("server-renders FAQ answers inside native, single-open accordions", () => {
  const html = renderToStaticMarkup(createElement(Faq));
  expect(html).toContain("These are downloadable digital PDF handbooks.");
  expect(html).toContain('<details name="faq"');
  expect(html).toContain("<h2");
});
