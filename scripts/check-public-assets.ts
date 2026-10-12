import { lstat, open, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Next.js serves public/ verbatim. Check generated browser assets after build too.
export async function assertSafePublicAssets(directory: string): Promise<void> {
  const root = await lstat(directory);
  if (root.isSymbolicLink() || !root.isDirectory()) {
    throw new Error(`Unsafe public asset: ${directory}`);
  }
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    // OneDrive placeholders can have a symlink Dirent type despite being ordinary
    // directories. lstat identifies actual links without following their targets.
    const stat = await lstat(path);
    if (
      stat.isSymbolicLink() ||
      /^(?:\.env(?:\.|$)|\.credentials$)/i.test(entry.name) ||
      /\.env$/i.test(entry.name) ||
      /credentials|token\.json/i.test(entry.name) ||
      /\.pdf(?:$|[.~_-])/i.test(entry.name) ||
      /\.(?:key|pem|p12|pfx|sql|dump|bak|log|map|zip|tar|tgz|gz)$/i.test(
        entry.name,
      )
    ) {
      throw new Error(`Unsafe public asset: ${path}`);
    }
    if (stat.isDirectory()) {
      await assertSafePublicAssets(path);
      continue;
    }
    if (!stat.isFile()) throw new Error(`Unsafe public asset: ${path}`);
    const file = await open(path, "r");
    try {
      const header = Buffer.alloc(1024);
      const { bytesRead } = await file.read(header, 0, header.length, 0);
      if (header.subarray(0, bytesRead).includes(Buffer.from("%PDF-"))) {
        throw new Error(`Unsafe public asset: ${path}`);
      }
    } finally {
      await file.close();
    }
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await assertSafePublicAssets(process.argv[2] ?? "public");
  console.log(
    "Public assets checked: no PDFs, private files, symlinks or source maps.",
  );
}
