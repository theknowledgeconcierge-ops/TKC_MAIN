import { afterEach, describe, expect, it } from "vitest";
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertSafePublicAssets } from "../scripts/check-public-assets";

const directories: string[] = [];
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "tkc-public-test-"));
  directories.push(directory);
  return directory;
}
afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe("public deployment assets", () => {
  it("permits covers, icons and compiled browser assets", async () => {
    const directory = await fixture();
    await mkdir(join(directory, "covers"));
    await writeFile(join(directory, "covers", "cover.jpg"), "image fixture");
    await writeFile(join(directory, "favicon.svg"), "<svg />");
    await writeFile(join(directory, "app.js"), "export {};");
    await expect(assertSafePublicAssets(directory)).resolves.toBeUndefined();
  });

  it.each([
    "handbook.PDF",
    "handbook.pdf.backup",
    ".env.local",
    "production.env",
    "production.ENV",
    ".credentials",
    "service-role.key",
    "backup.sql",
    "source.js.map",
  ])("rejects a deployable private/generated file: %s", async (filename) => {
    const directory = await fixture();
    await writeFile(join(directory, filename), "fixture");
    await expect(assertSafePublicAssets(directory)).rejects.toThrow(
      "Unsafe public asset",
    );
  });

  it("detects a renamed PDF by its header in a nested directory", async () => {
    const directory = await fixture();
    await mkdir(join(directory, "covers"));
    await writeFile(
      join(directory, "covers", "book.jpg"),
      "\n%PDF-1.7\nfixture",
    );
    await expect(assertSafePublicAssets(directory)).rejects.toThrow(
      "Unsafe public asset",
    );
  });

  it("rejects symlinks instead of following private files outside the public tree", async () => {
    const directory = await fixture();
    const privateDirectory = await fixture();
    await symlink(privateDirectory, join(directory, "private"));
    await expect(assertSafePublicAssets(directory)).rejects.toThrow(
      "Unsafe public asset",
    );
  });

  it("checks the actual public assets", async () => {
    await expect(assertSafePublicAssets("public")).resolves.toBeUndefined();
  });

  it("rejects a symlink used as the public root", async () => {
    const directory = await fixture();
    const target = await fixture();
    await writeFile(join(target, "innocent.jpg"), "private staging input");
    const publicRoot = join(directory, "public");
    await symlink(target, publicRoot);
    await expect(assertSafePublicAssets(publicRoot)).rejects.toThrow(
      "Unsafe public asset",
    );
  });
});

it("keeps every privileged application module behind server-only", async () => {
  const modules = (await readdir("src/lib/server")).map(
    (name) => `src/lib/server/${name}`,
  );
  modules.push("src/lib/catalog/storage.ts");
  for (const path of modules) {
    expect(await readFile(path, "utf8"), path).toMatch(
      /^import "server-only";/,
    );
  }
});
