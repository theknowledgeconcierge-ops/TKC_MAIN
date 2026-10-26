import { onlineContent } from "./online-content";
import type { ProductId } from "./catalog";

export interface PreviewPage {
  page: number;
  label: string;
  src: string;
}
interface ProductContent {
  focus: string;
  shortDescription: string;
  introduction: string;
  problems: string[];
  outcomes: { title: string; text: string }[];
  audience: string;
  application: string;
  previews: PreviewPage[];
}
const samples = (id: ProductId, pages: [number, string][]): PreviewPage[] =>
  pages.map(([page, label]) => ({ page, label, src: `/previews/${id}/page-${String(page).padStart(2, "0")}.webp` }));

export const productContent: Record<ProductId, ProductContent> = {
  ...onlineContent,
  "the-first-table": {
    focus: "Planning & opening",
    shortDescription: "Plan your concept, budget and opening before committing to a restaurant.",
    introduction: "For aspiring restaurant owners moving from an idea to a first customer. Work through the concept, customer, location, opening budget and launch readiness before making expensive commitments.",
    problems: ["Choosing premises before proving the concept", "Underestimating opening cash and working capital", "Planning a launch without clear responsibilities"],
    outcomes: [
      { title: "Test the idea", text: "Define the customer, examine demand and use a pilot test before committing to the full setup." },
      { title: "Evaluate the site and economics", text: "Connect location, capacity, diner spend and costs before investing in interiors." },
      { title: "Prepare a controlled opening", text: "Work through vendors, the opening team, a 30-day countdown and a soft launch." },
    ],
    audience: "Aspiring restaurateurs, café founders and hospitality entrepreneurs preparing their first opening.",
    application: "Keep the field workbook beside your research notes and supplier quotes. Record evidence, dates and owners for each decision; use the readiness checks to decide what needs fixing before opening.",
    previews: samples("the-first-table", [[5, "Start with a problem"], [15, "Economics before interiors"], [41, "The pilot test card"]]),
  },
  "the-full-table": {
    focus: "Marketing & repeat visits",
    shortDescription: "Attract local diners, plan better campaigns and earn repeat visits.",
    introduction: "For owners and managers who need a deliberate approach to restaurant demand. Connect local discovery, campaigns, offers and repeat visits to the service periods that need attention.",
    problems: ["Buying attention without knowing which service needs demand", "Running offers without checking contribution", "Treating repeat visits as an afterthought"],
    outcomes: [
      { title: "Make discovery lead somewhere", text: "Review neighbourhood reach, Google discovery and the steps from interest to a booking or visit." },
      { title: "Plan a measurable campaign", text: "Build clear tests for Instagram, creators, local partnerships and paid attention." },
      { title: "Earn the next visit", text: "Connect guest experience, permitted messaging, loyalty and review handling to a ninety-day demand system." },
    ],
    audience: "Restaurant and café owners, hospitality marketers and managers responsible for customer demand.",
    application: "Use the campaign briefs and workbook calculations before committing marketing money. Compare completed visits and contribution with a baseline, then decide which activity deserves another test.",
    previews: samples("the-full-table", [[5, "Marketing starts with an occasion"], [27, "Offers and contribution"], [48, "Offer and campaign worksheets"]]),
  },
  "behind-the-kitchen-door": {
    focus: "People & daily operations",
    shortDescription: "Build dependable teams, clear routines and smoother daily service.",
    introduction: "For owners and managers building a dependable daily operation. Examine responsibilities, training, kitchen-to-floor handoffs, stock controls and the routines that help a team repeat a good service.",
    problems: ["Every small decision depending on the owner", "Unclear handoffs during a busy shift", "Checklists that do not change how the work gets done"],
    outcomes: [
      { title: "Give the work an owner", text: "Separate responsibility from permission, plan staffing around tasks and train for demonstrated capability." },
      { title: "Make service repeatable", text: "Write usable SOPs and connect opening readiness, kitchen communication, peak queues and closing." },
      { title: "Turn records into decisions", text: "Review stock, waste, cash controls and daily reports, then improve one operating problem at a time." },
    ],
    audience: "Restaurant owners, duty managers, kitchen leads and chefs taking on team or operating responsibilities.",
    application: "Adapt the operating workbook to your premises and team. Start with a recurring failure, give the control a named owner and review evidence that the new routine is working.",
    previews: samples("behind-the-kitchen-door", [[5, "Repeat a good day"], [17, "SOPs for a busy shift"], [45, "Accountability worksheet"]]),
  },
  "the-math-behind-the-menu": {
    focus: "Costing & financial decisions",
    shortDescription: "Understand recipe costs, menu pricing, contribution and cash flow.",
    introduction: "For owners and menu decision-makers who want to connect prices with costs, contribution and cash. Follow restaurant examples through recipe costing, break-even, monthly results and payment planning.",
    problems: ["Mistaking sales or the bank balance for profit", "Pricing dishes without usable-yield costs", "Reporting a profit while cash obligations build up"],
    outcomes: [
      { title: "Know what a dish contributes", text: "Cost usable ingredients and approved portions; consider pricing, demand and the menu as a portfolio." },
      { title: "Read the operating model", text: "Separate fixed and variable costs, calculate break-even and explain budget variances." },
      { title: "Connect profit to cash", text: "Review channel deductions, build a rolling cash forecast and test investment assumptions." },
    ],
    audience: "Restaurant owners, managers and chefs involved in recipe costing, menu pricing or financial planning.",
    application: "Use the recipe sheets and money workbook with your actual invoices, sales records and payment dates. The worked examples explain the calculation; your own inputs determine the decision.",
    previews: samples("the-math-behind-the-menu", [[5, "Sales, profit and cash"], [9, "Cost a usable recipe"], [46, "Recipe and yield worksheet"]]),
  },
  "empty-tables-to-full-house": {
    focus: "Demand diagnosis & action",
    shortDescription: "Find why tables are quiet and build a practical thirty-day action plan.",
    introduction: "For an existing restaurant facing quiet tables. Diagnose the demand problem, examine local discovery and offers, and build a thirty-day plan using your own service and contribution figures.",
    problems: ["Discounting before understanding why tables are empty", "Visibility that does not become paying visits", "Marketing activity without a practical weekly review"],
    outcomes: [
      { title: "Find the constraint", text: "Review your customer, restaurant model and reasons to choose you before adding another campaign." },
      { title: "Examine growth choices", text: "Explore Indian brand lessons, local search, Instagram, paid campaigns, delivery and neighbourhood business." },
      { title: "Put a plan to work", text: "Evaluate offers by contribution and use the thirty-day plan, diagnosis page and weekly dashboard." },
    ],
    audience: "Owners and managers of operating restaurants or cafés who want to investigate weak demand and organise their next steps.",
    application: "Complete the one-page diagnosis with your manager. Choose a specific problem, run a manageable test and compare paying visits and contribution with a relevant baseline.",
    previews: samples("empty-tables-to-full-house", [[5, "Why your tables are empty"], [25, "Offers that leave money behind"], [39, "One-page restaurant diagnosis"]]),
  },
};
