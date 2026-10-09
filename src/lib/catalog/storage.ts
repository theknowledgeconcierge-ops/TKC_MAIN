import "server-only";
import type { ProductId } from "./index";
export const PDF_BUCKET = "handbooks";
export const pdfPaths: Record<ProductId, string> = {
  "the-first-table": "handbooks/the-first-table.pdf",
  "the-full-table": "handbooks/the-full-table.pdf",
  "behind-the-kitchen-door": "handbooks/behind-the-kitchen-door.pdf",
  "the-math-behind-the-menu": "handbooks/the-math-behind-the-menu.pdf",
  "empty-tables-to-full-house": "handbooks/empty-tables-to-full-house.pdf",
};
