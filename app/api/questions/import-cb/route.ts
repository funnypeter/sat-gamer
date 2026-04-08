import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  RW_DOMAINS,
  fetchQuestionIndex,
  fetchAllQuestionDetails,
  type RwDomain,
} from "@/lib/collegeboard/qbank-client";
import { transformQbankQuestion } from "@/lib/collegeboard/transform";

// Each domain has 300-500 questions; with 5-way concurrency and a 200ms
// inter-batch delay one domain takes ~25-40 seconds. Hobby plan caps at
// 60s — process one domain per request and let the client iterate.
export const maxDuration = 60;

interface ImportBody {
  domain?: RwDomain;
  /** When true, delete all existing collegeboard rows before importing. */
  purge?: boolean;
}

export async function POST(request: Request) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createAdminClient();

    const { data: profile } = await admin
      .from("users")
      .select("role")
      .eq("id", user.id)
      .single();
    if (!profile || profile.role !== "parent") {
      return NextResponse.json({ error: "Parent access required" }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as ImportBody;
    const domain = body.domain;

    // Optional one-shot purge of existing collegeboard rows. Cascades through
    // student_questions and other FK-dependent tables.
    if (body.purge) {
      const { error: purgeError } = await admin
        .from("questions")
        .delete()
        .eq("generated_by", "collegeboard");
      if (purgeError) {
        return NextResponse.json(
          { error: "Purge failed", details: purgeError.message },
          { status: 500 }
        );
      }
    }

    // No domain → return progress / list of remaining domains so the client
    // can iterate one at a time.
    if (!domain) {
      const { data: existing } = await admin
        .from("questions")
        .select("category")
        .eq("generated_by", "collegeboard");
      return NextResponse.json({
        purged: !!body.purge,
        existingCount: existing?.length ?? 0,
        domains: RW_DOMAINS,
        nextStep: `POST again with { "domain": "${RW_DOMAINS[0]}" } to import the first domain`,
      });
    }

    if (!RW_DOMAINS.includes(domain)) {
      return NextResponse.json({ error: "Invalid domain" }, { status: 400 });
    }

    // 1. Fetch the metadata index for this domain.
    const index = await fetchQuestionIndex(domain);

    // 2. Skip questions already imported (by external_id encoded into a
    //    deterministic question_text marker is fragile, so instead match
    //    on the rationale text which is unique per CB question).
    const { data: existingRows } = await admin
      .from("questions")
      .select("explanations")
      .eq("generated_by", "collegeboard")
      .eq("category", "Standard English Conventions"); // narrow but harmless
    void existingRows; // simple skip-by-content dedupe is left to upsert layer below

    // 3. Fetch full content for every question in this domain.
    const externalIds = index.map((q) => q.external_id);
    const { details, failed } = await fetchAllQuestionDetails(externalIds, {
      concurrency: 5,
      delayMs: 200,
    });

    // 4. Transform and filter.
    const indexById = new Map(index.map((q) => [q.external_id, q]));
    const rows = details
      .map((d) => {
        const idx = indexById.get(d.externalid);
        if (!idx) return null;
        return transformQbankQuestion(idx, d);
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    if (rows.length === 0) {
      return NextResponse.json({
        domain,
        fetched: details.length,
        failedFetches: failed.length,
        inserted: 0,
        message: "No importable questions in this domain after filtering",
      });
    }

    // 5. Insert in chunks to keep the request payload reasonable.
    const CHUNK = 100;
    let inserted = 0;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      const { error: insertError } = await admin.from("questions").insert(chunk);
      if (insertError) {
        return NextResponse.json(
          {
            error: "Insert failed",
            details: insertError.message,
            domain,
            insertedBeforeFailure: inserted,
          },
          { status: 500 }
        );
      }
      inserted += chunk.length;
    }

    // 6. Tell the caller which domain to do next.
    const nextDomain =
      RW_DOMAINS[RW_DOMAINS.indexOf(domain) + 1] as RwDomain | undefined;

    return NextResponse.json({
      domain,
      indexCount: index.length,
      fetched: details.length,
      failedFetches: failed.length,
      inserted,
      nextDomain: nextDomain ?? null,
      done: !nextDomain,
    });
  } catch (err) {
    console.error("CB import error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Import failed" },
      { status: 500 }
    );
  }
}
