/* eslint-disable @typescript-eslint/no-explicit-any -- rows are untyped, exactly as the supabase-js client this replaces returned them */
import { createHash } from "node:crypto";
import type { D1Database, D1PreparedStatement } from "@cloudflare/workers-types";
import {
  BOOLEAN_COLUMNS,
  CONTENT_HASH,
  JSON_COLUMNS,
  NO_GENERATED_ID,
  RELATIONS,
} from "./schema";

// A small supabase-js-compatible query builder over D1.
//
// The app was written against supabase-js (`.from().select().eq()...`), and
// the selection/earning logic is intricate enough that rewriting ~140 call
// sites as raw SQL would be a bigger risk than the migration itself. This
// implements exactly the subset the app uses, with the same result shape:
// `{ data, error, count }`, never throwing on a query error.
//
// Supported: select (column list, `*`, many-to-one embeds `rel(cols)`,
// { count: "exact", head: true }), insert, update, upsert (onConflict,
// ignoreDuplicates), delete, eq/neq/gt/gte/lt/lte/in/is/not/or, order,
// limit, range, single, maybeSingle. Anything else should be written as
// plain SQL against d1() instead of extending this.

type Row = Record<string, any>;
export interface DbError {
  message: string;
  code?: string;
}
export interface DbResult<T = any> {
  data: T | null;
  error: DbError | null;
  count: number | null;
}

const IDENT = /^[a-z_][a-z0-9_]*$/;
function ident(name: string): string {
  if (!IDENT.test(name)) throw new Error(`Invalid identifier: ${name}`);
  return name;
}

function encode(v: unknown): unknown {
  if (v === undefined) return null;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (v instanceof Date) return v.toISOString();
  if (v !== null && typeof v === "object") return JSON.stringify(v);
  return v;
}

export function decodeRow(table: string, row: Row): Row {
  for (const c of JSON_COLUMNS[table] ?? []) {
    if (typeof row[c] === "string") {
      try {
        row[c] = JSON.parse(row[c]);
      } catch {
        /* leave as text */
      }
    }
  }
  for (const c of BOOLEAN_COLUMNS[table] ?? []) {
    if (c in row && row[c] !== null) row[c] = !!row[c];
  }
  return row;
}

const md5 = (s: string) => createHash("md5").update(s).digest("hex");

function prepareInsertRow(table: string, row: Row): Row {
  const out: Row = { ...row };
  if (!NO_GENERATED_ID.has(table) && (out.id === undefined || out.id === null)) {
    out.id = crypto.randomUUID();
  }
  const hash = CONTENT_HASH[table];
  if (hash) out.content_hash = md5(hash(out));
  return out;
}

interface Filter {
  sql: string;
  params: unknown[];
}

type Op = "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "is" | "in";
const OP_SQL: Record<Exclude<Op, "is" | "in">, string> = {
  eq: "=",
  neq: "<>",
  gt: ">",
  gte: ">=",
  lt: "<",
  lte: "<=",
};

function filterSql(column: string, op: Op, value: unknown, negate = false): Filter {
  const col = ident(column);
  let f: Filter;
  if (op === "in") {
    // json_each keeps it to one bound parameter however long the list is
    // (D1 caps a statement at 100).
    const list = Array.isArray(value) ? value.map(encode) : [];
    f = { sql: `${col} IN (SELECT value FROM json_each(?))`, params: [JSON.stringify(list)] };
  } else if (value === null || (op === "is" && value === "null")) {
    f = { sql: `${col} IS ${op === "neq" ? "NOT " : ""}NULL`, params: [] };
  } else if (op === "is") {
    f = { sql: `${col} = ${value ? 1 : 0}`, params: [] };
  } else {
    f = { sql: `${col} ${OP_SQL[op]} ?`, params: [encode(value)] };
  }
  return negate ? { sql: `NOT (${f.sql})`, params: f.params } : f;
}

/** Parse a PostgREST `or` string like "a.eq.x,b.gte.3" (no nesting). */
function parseOr(expr: string): Filter {
  const parts = expr.split(",").map((p) => p.trim()).filter(Boolean);
  const filters = parts.map((p) => {
    const m = p.match(/^([a-z_][a-z0-9_]*)\.(not\.)?(eq|neq|gt|gte|lt|lte|is|in)\.(.*)$/);
    if (!m) throw new Error(`Unsupported or() clause: ${p}`);
    const [, col, not, op, raw] = m;
    let value: unknown = raw;
    if (op === "in") value = raw.replace(/^\(|\)$/g, "").split(",").map((s) => s.trim());
    else if (raw === "null") value = null;
    else if (raw === "true" || raw === "false") value = raw === "true";
    return filterSql(col, op as Op, value, !!not);
  });
  return {
    sql: `(${filters.map((f) => f.sql).join(" OR ")})`,
    params: filters.flatMap((f) => f.params),
  };
}

interface Embed {
  table: string;
  fk: string;
  columns: string;
}

function parseSelect(table: string, select: string): { columns: string; embeds: Embed[] } {
  const embeds: Embed[] = [];
  // Split on top-level commas only.
  const parts: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of select) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      parts.push(cur);
      cur = "";
    } else cur += ch;
  }
  parts.push(cur);

  const cols: string[] = [];
  for (const raw of parts.map((p) => p.trim()).filter(Boolean)) {
    const m = raw.match(/^([a-z_][a-z0-9_]*)\s*\(([\s\S]*)\)$/);
    if (m) {
      const fk = RELATIONS[table]?.[m[1]];
      if (!fk) throw new Error(`No relation ${table} → ${m[1]}`);
      embeds.push({ table: m[1], fk, columns: m[2].trim() || "*" });
    } else if (raw === "*") {
      cols.push("*");
    } else {
      cols.push(ident(raw));
    }
  }
  return { columns: cols.length ? cols.join(", ") : "*", embeds };
}

function columnList(columns: string): string {
  if (columns.trim() === "*" || !columns.trim()) return "*";
  return columns.split(",").map((c) => ident(c.trim())).join(", ");
}

type Action = "select" | "insert" | "update" | "upsert" | "delete";

// T mirrors untyped supabase-js: any[] for lists, any after single().
export class QueryBuilder<T = any[]> implements PromiseLike<DbResult<T>> {
  private action: Action = "select";
  private selectStr: string | null = null;
  private returning = false;
  private countMode = false;
  private head = false;
  private filters: Filter[] = [];
  private orders: string[] = [];
  private limitN: number | null = null;
  private offsetN: number | null = null;
  private singleMode: "single" | "maybe" | null = null;
  private values: Row[] = [];
  private patch: Row = {};
  private onConflict: string | null = null;
  private ignoreDuplicates = false;

  constructor(private db: D1Database, private table: string) {
    ident(table);
  }

  // ── verbs ────────────────────────────────────────────────────────────
  select(columns = "*", opts: { count?: "exact"; head?: boolean } = {}) {
    if (this.action === "select") {
      this.selectStr = columns;
      this.countMode = opts.count === "exact";
      this.head = !!opts.head;
    } else {
      this.returning = true;
      this.selectStr = columns;
    }
    return this;
  }
  insert(values: Row | Row[]) {
    this.action = "insert";
    this.values = Array.isArray(values) ? values : [values];
    return this;
  }
  upsert(values: Row | Row[], opts: { onConflict?: string; ignoreDuplicates?: boolean } = {}) {
    this.action = "upsert";
    this.values = Array.isArray(values) ? values : [values];
    this.onConflict = opts.onConflict ?? (NO_GENERATED_ID.has(this.table) ? null : "id");
    this.ignoreDuplicates = !!opts.ignoreDuplicates;
    return this;
  }
  update(values: Row) {
    this.action = "update";
    this.patch = values;
    return this;
  }
  delete() {
    this.action = "delete";
    return this;
  }

  // ── filters ──────────────────────────────────────────────────────────
  eq(c: string, v: unknown) { this.filters.push(filterSql(c, "eq", v)); return this; }
  neq(c: string, v: unknown) { this.filters.push(filterSql(c, "neq", v)); return this; }
  gt(c: string, v: unknown) { this.filters.push(filterSql(c, "gt", v)); return this; }
  gte(c: string, v: unknown) { this.filters.push(filterSql(c, "gte", v)); return this; }
  lt(c: string, v: unknown) { this.filters.push(filterSql(c, "lt", v)); return this; }
  lte(c: string, v: unknown) { this.filters.push(filterSql(c, "lte", v)); return this; }
  in(c: string, v: unknown[]) { this.filters.push(filterSql(c, "in", v)); return this; }
  is(c: string, v: null | boolean) { this.filters.push(filterSql(c, "is", v)); return this; }
  not(c: string, op: Op, v: unknown) {
    let value = v;
    if (op === "in" && typeof v === "string") {
      value = v.replace(/^\(|\)$/g, "").split(",").map((s) => s.trim().replace(/^"|"$/g, ""));
    }
    this.filters.push(filterSql(c, op, value, true));
    return this;
  }
  or(expr: string) { this.filters.push(parseOr(expr)); return this; }

  // ── modifiers ────────────────────────────────────────────────────────
  order(column: string, opts: { ascending?: boolean; nullsFirst?: boolean } = {}) {
    const asc = opts.ascending ?? true;
    // Postgres defaults: ASC NULLS LAST, DESC NULLS FIRST.
    const nullsFirst = opts.nullsFirst ?? !asc;
    this.orders.push(`${ident(column)} ${asc ? "ASC" : "DESC"} NULLS ${nullsFirst ? "FIRST" : "LAST"}`);
    return this;
  }
  limit(n: number) { this.limitN = Math.max(0, Math.floor(n)); return this; }
  range(from: number, to: number) {
    this.offsetN = Math.max(0, Math.floor(from));
    this.limitN = Math.max(0, Math.floor(to) - Math.floor(from) + 1);
    return this;
  }
  single(): QueryBuilder<any> { this.singleMode = "single"; return this; }
  maybeSingle(): QueryBuilder<any> { this.singleMode = "maybe"; return this; }

  // ── execution ────────────────────────────────────────────────────────
  then<A = DbResult<T>, B = never>(
    onfulfilled?: ((value: DbResult<T>) => A | PromiseLike<A>) | null,
    onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null
  ): PromiseLike<A | B> {
    return this.execute().then(onfulfilled, onrejected);
  }

  private where(): { sql: string; params: unknown[] } {
    if (!this.filters.length) return { sql: "", params: [] };
    return {
      sql: " WHERE " + this.filters.map((f) => f.sql).join(" AND "),
      params: this.filters.flatMap((f) => f.params),
    };
  }

  async execute(): Promise<DbResult<T>> {
    try {
      const rows = await this.run();
      if (this.head) return { data: null, error: null, count: rows.count };
      let data: any = rows.rows;
      if (this.action !== "select" && !this.returning) data = null;
      if (this.singleMode) {
        const list: Row[] = rows.rows;
        if (list.length > 1 || (list.length === 0 && this.singleMode === "single")) {
          return {
            data: null,
            error: {
              code: "PGRST116",
              message: `JSON object requested, multiple (or no) rows returned (${list.length})`,
            },
            count: null,
          };
        }
        data = list[0] ?? null;
      }
      return { data, error: null, count: this.countMode ? rows.count : null };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const code = /UNIQUE constraint failed/i.test(message)
        ? "23505"
        : /FOREIGN KEY constraint failed/i.test(message)
          ? "23503"
          : undefined;
      console.error(`[db] ${this.action} ${this.table}: ${message}`);
      return { data: null, error: { message, code }, count: null };
    }
  }

  private async run(): Promise<{ rows: Row[]; count: number | null }> {
    switch (this.action) {
      case "select":
        return this.runSelect();
      case "insert":
      case "upsert":
        return { rows: await this.runInsert(), count: null };
      case "update":
        return { rows: await this.runUpdate(), count: null };
      case "delete":
        return { rows: await this.runDelete(), count: null };
    }
  }

  private async runSelect() {
    const { columns, embeds } = parseSelect(this.table, this.selectStr ?? "*");
    const w = this.where();
    if (this.head) {
      const r = await this.db
        .prepare(`SELECT count(*) AS n FROM ${this.table}${w.sql}`)
        .bind(...w.params)
        .first<{ n: number }>();
      return { rows: [], count: r?.n ?? 0 };
    }
    // Embeds need the FK column even if the caller didn't select it.
    const extra = embeds.map((e) => e.fk).filter((fk) => columns !== "*" && !columns.split(", ").includes(fk));
    let sql = `SELECT ${[columns, ...extra].join(", ")} FROM ${this.table}${w.sql}`;
    if (this.orders.length) sql += ` ORDER BY ${this.orders.join(", ")}`;
    if (this.limitN !== null) sql += ` LIMIT ${this.limitN}`;
    else if (this.offsetN !== null) sql += " LIMIT -1";
    if (this.offsetN !== null) sql += ` OFFSET ${this.offsetN}`;
    const { results } = await this.db.prepare(sql).bind(...w.params).all<Row>();
    const rows = results.map((r) => decodeRow(this.table, r));

    for (const e of embeds) {
      const ids = Array.from(new Set(rows.map((r) => r[e.fk]).filter((v) => v != null)));
      const byId = new Map<unknown, Row>();
      if (ids.length) {
        const cols = columnList(e.columns);
        const selectCols = cols === "*" || cols.split(", ").includes("id") ? cols : `${cols}, id`;
        const { results: related } = await this.db
          .prepare(`SELECT ${selectCols} FROM ${ident(e.table)} WHERE id IN (SELECT value FROM json_each(?))`)
          .bind(JSON.stringify(ids))
          .all<Row>();
        for (const r of related) {
          const id = r.id;
          if (selectCols !== cols) delete r.id;
          byId.set(id, decodeRow(e.table, r));
        }
      }
      for (const r of rows) r[e.table] = byId.get(r[e.fk]) ?? null;
    }
    for (const r of rows) for (const fk of extra) delete r[fk];

    let count: number | null = null;
    if (this.countMode) {
      const c = await this.db
        .prepare(`SELECT count(*) AS n FROM ${this.table}${w.sql}`)
        .bind(...w.params)
        .first<{ n: number }>();
      count = c?.n ?? 0;
    }
    return { rows, count };
  }

  private returningSql(): string {
    if (!this.returning) return "";
    return ` RETURNING ${columnList(this.selectStr ?? "*")}`;
  }

  private async runInsert(): Promise<Row[]> {
    if (!this.values.length) return [];
    const stmts: D1PreparedStatement[] = [];
    for (const raw of this.values) {
      const row = prepareInsertRow(this.table, raw);
      // One statement per row, listing only that row's own keys so omitted
      // columns take their SQL defaults (as PostgREST does).
      const cols = Object.keys(row).filter((k) => row[k] !== undefined).map(ident);
      let sql = `INSERT INTO ${this.table} (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`;
      if (this.action === "upsert" && this.onConflict) {
        const target = this.onConflict.split(",").map((c) => ident(c.trim()));
        const updatable = cols.filter((c) => !target.includes(c) && c !== "id");
        sql +=
          this.ignoreDuplicates || !updatable.length
            ? ` ON CONFLICT (${target.join(", ")}) DO NOTHING`
            : ` ON CONFLICT (${target.join(", ")}) DO UPDATE SET ${updatable.map((c) => `${c} = excluded.${c}`).join(", ")}`;
      }
      sql += this.returningSql();
      stmts.push(this.db.prepare(sql).bind(...cols.map((c) => encode(row[c]))));
    }
    const out: Row[] = [];
    // D1 batches are atomic (one implicit transaction), like a multi-row insert.
    for (let i = 0; i < stmts.length; i += 200) {
      const res = await this.db.batch<Row>(stmts.slice(i, i + 200));
      for (const r of res) out.push(...(r.results ?? []).map((x) => decodeRow(this.table, x)));
    }
    return out;
  }

  private async runUpdate(): Promise<Row[]> {
    const cols = Object.keys(this.patch).filter((k) => this.patch[k] !== undefined).map(ident);
    if (!cols.length) return [];
    const w = this.where();
    const sql = `UPDATE ${this.table} SET ${cols.map((c) => `${c} = ?`).join(", ")}${w.sql}${this.returningSql()}`;
    const { results } = await this.db
      .prepare(sql)
      .bind(...cols.map((c) => encode(this.patch[c])), ...w.params)
      .all<Row>();
    return (results ?? []).map((r) => decodeRow(this.table, r));
  }

  private async runDelete(): Promise<Row[]> {
    const w = this.where();
    const { results } = await this.db
      .prepare(`DELETE FROM ${this.table}${w.sql}${this.returningSql()}`)
      .bind(...w.params)
      .all<Row>();
    return (results ?? []).map((r) => decodeRow(this.table, r));
  }
}
