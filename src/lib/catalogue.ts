export { type Book, formatInr } from "./catalog";
import { activeBooks } from "./catalog";
export const useCatalogue = () => ({ books: activeBooks });
