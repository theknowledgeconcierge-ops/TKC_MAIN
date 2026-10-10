export interface Book {
  id: string;
  slug: string;
  title: string;
  subtitle: string;
  author: string;
  pages: number;
  selling_price_inr: number;
  original_price_inr: number;
  price_paise: number;
  currency: "INR";
  active: boolean;
  description: string;
  topics: readonly string[];
  toc: readonly string[];
  cover_image_url: string;
}

export const catalogue = [
  {
    id: "the-first-table",
    slug: "the-first-table",
    title: "The First Table",
    subtitle: "The Complete Journey From Restaurant Idea to First Customer",
    author: "Rakesh Chauhan",
    pages: 47,
    selling_price_inr: 249,
    original_price_inr: 499,
    description:
      "A practical handbook for the decisions between a restaurant idea and the first paying customer—from concept and location to economics, approvals, hiring and launch.",
    topics: [
      "Concept development",
      "Location evaluation",
      "Opening budgets",
      "Menu planning",
      "Approvals & vendors",
      "Soft launch",
    ],
    toc: [
      "The Idea",
      "The Proof",
      "The Promise",
      "The Build",
      "The Opening",
      "Restaurant field workbook",
    ],
    cover_image_url: "/covers/the-first-table.jpg",
    currency: "INR",
    price_paise: 24900,
    active: true,
  },
  {
    id: "the-full-table",
    slug: "the-full-table",
    title: "The Full Table",
    subtitle: "The Journey to Sustained Success and Customer Loyalty",
    author: "Rakesh Chauhan",
    pages: 53,
    selling_price_inr: 249,
    original_price_inr: 499,
    description:
      "A focused guide to discovery, local demand, restaurant marketing, customer relationships and the systems that encourage the next visit.",
    topics: [
      "Local discovery",
      "Instagram marketing",
      "Creator collaborations",
      "Offers",
      "Delivery marketing",
      "Customer retention",
    ],
    toc: [
      "The Guest and the Journey",
      "The Acquisition Toolkit",
      "The Repeat Visit",
      "The Evidence and the Plan",
      "Restaurant marketing workbook",
    ],
    cover_image_url: "/covers/the-full-table.jpg",
    currency: "INR",
    price_paise: 24900,
    active: true,
  },
  {
    id: "behind-the-kitchen-door",
    slug: "behind-the-kitchen-door",
    title: "Behind the Kitchen Door",
    subtitle: "The People and Systems That Keep Restaurants Running",
    author: "Rakesh Chauhan",
    pages: 64,
    selling_price_inr: 249,
    original_price_inr: 499,
    description:
      "An operating handbook about people, responsibilities, processes and repeatable systems for consistent restaurant service.",
    topics: [
      "Hiring & training",
      "SOPs",
      "Opening & closing",
      "Inventory control",
      "Food safety",
      "Management reporting",
    ],
    toc: [
      "The People and the Operating System",
      "The Daily Service",
      "Stock, Safety and Control",
      "The Team, the Manager and the Owner",
      "The operating workbook",
    ],
    cover_image_url: "/covers/behind-the-kitchen-door.jpg",
    currency: "INR",
    price_paise: 24900,
    active: true,
  },
  {
    id: "the-math-behind-the-menu",
    slug: "the-math-behind-the-menu",
    title: "The Math Behind the Menu",
    subtitle: "The Numbers Every Restaurant Owner Must Know",
    author: "Rakesh Chauhan",
    pages: 65,
    selling_price_inr: 249,
    original_price_inr: 499,
    description:
      "A numbers-first guide to food costing, pricing, contribution, break-even, cash flow and the financial decisions behind a restaurant.",
    topics: [
      "Recipe costing",
      "Menu pricing",
      "Break-even",
      "Profit & loss",
      "Labour costs",
      "Cash flow",
    ],
    toc: [
      "The Model and the Menu",
      "Sales, Break Even and the Monthly Result",
      "People, Commitments and Channels",
      "Cash, Capital and the Owner",
      "The restaurant money workbook",
    ],
    cover_image_url: "/covers/the-math-behind-the-menu.jpg",
    currency: "INR",
    price_paise: 24900,
    active: true,
  },
  {
    id: "empty-tables-to-full-house",
    slug: "empty-tables-to-full-house",
    title: "Empty Tables to Full House",
    subtitle:
      "The Practical Guide to Getting More Customers and Building a Loyal Local Base",
    author: "Rakesh Chauhan",
    pages: 43,
    selling_price_inr: 249,
    original_price_inr: 499,
    description:
      "A practical turnaround guide for understanding weak demand, improving visibility, shaping better offers and building a deliberate 30-day plan.",
    topics: [
      "Diagnosing empty tables",
      "Indian brand lessons",
      "Local search",
      "Paid campaigns",
      "Offers",
      "30-day action plan",
    ],
    toc: [
      "Understand Your Restaurant",
      "Learn From Indian Brands",
      "Build a Business That Works",
      "Bring Customers In and Back",
      "Put the Plan to Work",
    ],
    cover_image_url: "/covers/empty-tables-to-full-house.jpg",
    currency: "INR",
    price_paise: 24900,
    active: true,
  },
] as const satisfies readonly Book[];
export type ProductId = (typeof catalogue)[number]["id"];
export const activeBooks: readonly Book[] = catalogue.filter(
  (book) => book.active,
);
export const formatInr = (value: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
