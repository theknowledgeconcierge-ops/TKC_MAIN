import { existsSync } from "node:fs";
import { envSchema } from "../src/lib/env-schema";
export function environment() {
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
  const result = envSchema.safeParse(process.env);
  if (!result.success)
    throw new Error(
      "Missing/invalid environment variables: " +
        [
          ...new Set(result.error.issues.map((issue) => issue.path.join("."))),
        ].join(", "),
    );
  return result.data;
}
