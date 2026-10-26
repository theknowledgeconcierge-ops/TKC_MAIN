import "server-only";
import type { ProductId } from "./index";
export const PDF_BUCKET = "handbooks";
export const pdfPaths: Record<ProductId, string> = {
  "the-first-table": "handbooks/the-first-table.pdf",
  "the-full-table": "handbooks/the-full-table.pdf",
  "behind-the-kitchen-door": "handbooks/behind-the-kitchen-door.pdf",
  "the-math-behind-the-menu": "handbooks/the-math-behind-the-menu.pdf",
  "empty-tables-to-full-house": "handbooks/empty-tables-to-full-house.pdf",
  "from-someday-to-sold": "handbooks/from-someday-to-sold.pdf",
  "stop-scrolling-start-selling": "handbooks/stop-scrolling-start-selling.pdf",
  "sold-out-still-broke": "handbooks/sold-out-still-broke.pdf",
  "nobody-told-me-this": "handbooks/nobody-told-me-this.pdf",
};
