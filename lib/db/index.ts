/* eslint-disable @typescript-eslint/no-explicit-any -- rows are untyped, exactly as the supabase-js client this replaces returned them */
import { d1 } from "@/lib/cf";
import { getSessionUser } from "@/lib/auth";
import { QueryBuilder, decodeRow, type DbResult } from "./query";

// Data access for server code. `createClient()` / `createAdminClient()` keep
// the names (and supabase-js call shape) the app was written with, so the
// selection, earning and streak logic didn't have to be rewritten for D1.
//
// There is no RLS on D1: both clients see every row. Authorization is the
// route's job — resolve the caller with `auth.getUser()` and filter by their
// id / family, as every route already does. Never trust ids from the body.

// Postgres functions the app called via .rpc(), ported to SQL.
const RPCS: Record<string, (args: any) => Promise<any>> = {
  async get_family_by_invite_code({ code_input }: { code_input: string }) {
    const { results } = await d1()
      .prepare("SELECT id, name, invite_code FROM families WHERE invite_code = ? LIMIT 1")
      .bind(code_input)
      .all();
    return results;
  },
  async get_family_by_id({ family_id_input }: { family_id_input: string }) {
    const { results } = await d1()
      .prepare("SELECT id, name, invite_code FROM families WHERE id = ? LIMIT 1")
      .bind(family_id_input)
      .all();
    return results;
  },
  async avg_time_by_category({ p_student_id }: { p_student_id: string }) {
    const { results } = await d1()
      .prepare(
        `SELECT q.category, round(avg(sq.time_spent_seconds), 1) AS avg_seconds, count(*) AS attempts
         FROM student_questions sq JOIN questions q ON q.id = sq.question_id
         WHERE sq.student_id = ? AND sq.time_spent_seconds > 0
         GROUP BY q.category`
      )
      .bind(p_student_id)
      .all();
    return results;
  },
};

function makeClient() {
  return {
    from: (table: string) => new QueryBuilder(d1(), table),
    async rpc(name: string, args: Record<string, unknown> = {}): Promise<DbResult> {
      const fn = RPCS[name];
      if (!fn) return { data: null, error: { message: `Unknown rpc ${name}` }, count: null };
      try {
        return { data: await fn(args), error: null, count: null };
      } catch (err) {
        return { data: null, error: { message: String(err) }, count: null };
      }
    },
    auth: {
      async getUser() {
        return { data: { user: await getSessionUser() }, error: null };
      },
    },
  };
}

export type Db = ReturnType<typeof makeClient>;

/** Request-scoped client; `auth.getUser()` reads the session cookie. */
export const createClient = (): Db => makeClient();

/** Same data access as createClient — kept for call sites that used the service role. */
export const createAdminClient = (): Db => makeClient();

export { decodeRow };
