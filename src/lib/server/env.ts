import "server-only";
import { envSchema } from "@/lib/env-schema";
import { HttpError } from "./errors";
export function serverEnv() {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    // Names only; never serialize the input/environment or provider exceptions.
    console.error(
      JSON.stringify({
        event: "configuration_missing",
        fields: result.error.issues.map((issue) => issue.path.join(".")),
      }),
    );
    throw new HttpError(
      503,
      "CONFIGURATION_REQUIRED",
      "Checkout is not configured yet. Please try again later.",
    );
  }
  return result.data;
}
