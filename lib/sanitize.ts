import { replaceMfenced } from "@/lib/mathml";

const HTML_TAGS = [
  "u", "b", "i", "em", "strong", "br", // inline formatting
  "p", // College Board passages wrap each paragraph in <p>
  "sup", "sub", // footnote markers, chemical formulas
  "table", "thead", "tbody", "tr", "th", "td", "caption", // CB data tables
];

// MathML Core presentation elements — College Board writes all math as MathML.
const MATHML_TAGS = [
  "math", "mrow", "mi", "mn", "mo", "mtext", "mspace", "ms",
  "mfrac", "msqrt", "mroot", "msup", "msub", "msubsup",
  "munder", "mover", "munderover", "mmultiscripts", "mprescripts", "none",
  "mtable", "mtr", "mtd", "mstyle", "mpadded", "mphantom", "menclose",
  "semantics", "annotation",
];

const ALLOWED_TAGS = new Set([...HTML_TAGS, ...MATHML_TAGS]);

// Presentation-only attributes; anything else (style, on*, href, src, ...)
// is dropped even on an allowed tag.
const ALLOWED_ATTRS = new Set([
  "alttext", "display", "mathvariant", "displaystyle", "scriptlevel",
  "fence", "separator", "stretchy", "symmetric", "largeop", "movablelimits",
  "accent", "accentunder", "form", "lspace", "rspace", "linethickness",
  "notation", "columnalign", "rowalign", "colspan", "rowspan", "scope",
]);

function filterAttrs(attrs: string): string {
  const kept: string[] = [];
  const re = /([a-zA-Z_:][\w:.-]*)\s*=\s*("([^"]*)"|'([^']*)')/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(attrs))) {
    const name = m[1].toLowerCase();
    const value = m[3] ?? m[4] ?? "";
    if (ALLOWED_ATTRS.has(name) && !/[<>"`]|javascript:/i.test(value)) {
      kept.push(`${name}="${value}"`);
    }
  }
  return kept.length ? " " + kept.join(" ") : "";
}

/**
 * Shared HTML sanitizer for question content (passages, stems, choices,
 * explanations). Keeps only HTML_TAGS and MATHML_TAGS above, each with only
 * presentation attributes; every other tag (script, style, iframe, span,
 * div, svg, ...) is stripped, keeping its text. Deprecated <mfenced> is
 * rewritten first so math fences render (see lib/mathml.ts).
 *
 * Use with React's `dangerouslySetInnerHTML`. The sanitizer must be the
 * single source of truth — every component that renders question HTML
 * should call this function so the allowlist stays consistent.
 */
export function sanitizeHtml(html: string): string {
  if (!html) return "";
  const withFences = /<mfenced\b/i.test(html) ? replaceMfenced(html) : html;
  return withFences
    // Drop script/style blocks entirely, contents included.
    .replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(\/?)([a-zA-Z][\w-]*)([^>]*)>/g, (_all, slash: string, tag: string, attrs: string) => {
      const name = tag.toLowerCase();
      if (!ALLOWED_TAGS.has(name)) return "";
      if (slash) return `</${name}>`;
      const selfClosing = /\/\s*$/.test(attrs);
      return `<${name}${filterAttrs(attrs)}${selfClosing ? " /" : ""}>`;
    });
}

/**
 * Detects when passage_text was filled with a meta-description of the
 * passage (e.g. "The author of this passage wants to...") instead of
 * actual passage prose. When that happens we hide the broken passage
 * card so the user sees one coherent question instead of two stacked
 * stems with no source text. The same patterns are enforced at
 * generation time in lib/gemini/schema.ts — keep them in sync.
 */
export function isMetaPromptPassage(text: string | null | undefined): boolean {
  if (!text) return true;
  const t = text.trim();
  if (!t) return true;
  const patterns: RegExp[] = [
    /\bthe author of (this|the) passage\b/i,
    /\bthe (writer|author|speaker) (wants|aims|intends|seeks)\b/i,
    /\bthis passage (is about|describes|discusses|argues|explains)\b/i,
    /\bwhat is the most likely reason\b/i,
  ];
  return patterns.some((re) => re.test(t));
}
