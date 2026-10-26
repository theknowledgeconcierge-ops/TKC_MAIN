import { activeBooks, type Book } from "./index";

export const series = [
  {
    id: "restaurant-playbooks", name: "Restaurant Playbook Series",
    bundleName: "The Restaurant Playbook Bundle", path: "/series/restaurant-playbooks",
    description: "Five practical books covering restaurant launch, marketing, daily operations, finance and rebuilding customer demand.",
    heading: "Five perspectives. One restaurant business.",
    author: "Rakesh Chauhan", reviewId: "complete-collection", bundlePrice: 499,
  },
  {
    id: "start-selling-online", name: "Start Selling Online Series",
    bundleName: "Start Selling Online Bundle", path: "/series/start-selling-online",
    description: "Choose and launch a product, attract customers, understand your numbers and handle the operational problems of selling online in India.",
    heading: "Four books. From first idea to a business that can recover.",
    author: "THE KNOWLEDGE CONCIERGE", reviewId: "start-selling-online-bundle", bundlePrice: 499,
  },
] as const;
export type SeriesId = (typeof series)[number]["id"];
export const booksForSeries = (id: SeriesId): readonly Book[] => activeBooks.filter(book => book.seriesId === id);
export const seriesForBook = (book: Book) => series.find(item => item.id === book.seriesId)!;
// Recommend one relevant incomplete series at a time; never pool unrelated titles.
export function incompleteSeries(ids: readonly string[]) {
  return series.filter(item => {
    const books = booksForSeries(item.id);
    const count = books.filter(book => ids.includes(book.id)).length;
    return count > 0 && count < books.length;
  }).sort((a, b) => {
    const remaining = (id: SeriesId) => booksForSeries(id).filter(book => !ids.includes(book.id)).length;
    return remaining(a.id) - remaining(b.id);
  })[0];
}
