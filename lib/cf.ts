import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { D1Database, R2Bucket } from "@cloudflare/workers-types";

// Cloudflare bindings (see wrangler.jsonc). Server-only.
export interface Env {
  DB: D1Database;
  AVATARS: R2Bucket;
  GEMINI_API_KEY: string;
  NEXT_PUBLIC_APP_URL: string;
}

export function env(): Env {
  return getCloudflareContext().env as unknown as Env;
}

export const d1 = () => env().DB;
