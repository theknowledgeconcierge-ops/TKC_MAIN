import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { activeBooks } from "../src/lib/catalog";
import { environment } from "./environment";
const env = environment();
const directory = process.argv[2];
if (!directory)
  throw new Error("Usage: npm run storage:upload -- /absolute/path/to/pdfs");
const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const bucket = await db.storage.getBucket("handbooks");
if (bucket.error || !bucket.data || bucket.data.public)
  throw new Error(
    "The handbooks bucket must exist and be private. Apply the SQL migration first.",
  );
const digest = (value: Buffer) =>
  createHash("sha256").update(value).digest("hex");
const requested = process.argv.slice(3);
if (requested.some(id => !activeBooks.some(book => book.id === id))) throw new Error("Unknown book identifier");
for (const book of activeBooks.filter(book => !requested.length || requested.includes(book.id))) {
  const bytes = await readFile(join(directory, `${book.id}.pdf`));
  if (
    !bytes.subarray(0, 5).equals(Buffer.from("%PDF-")) ||
    bytes.length > 52428800
  )
    throw new Error(`Invalid or oversized PDF: ${book.id}`);
  const path = `handbooks/${book.id}.pdf`;
  const existing = await db.storage.from("handbooks").download(path);
  if (existing.data) {
    if (
      digest(Buffer.from(await existing.data.arrayBuffer())) !== digest(bytes)
    )
      throw new Error(
        `${path} exists with different contents. Version the file and update the server mapping deliberately.`,
      );
    console.log(`${book.id}: already uploaded, checksum matches`);
    continue;
  }
  const result = await db.storage.from("handbooks").upload(path, bytes, {
    contentType: "application/pdf",
    upsert: false,
    cacheControl: "60",
  });
  if (result.error)
    throw new Error(
      `Upload failed for ${book.id}. Check storage permissions and retry.`,
    );
  console.log(`${book.id}: uploaded to private storage`);
}
