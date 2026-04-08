/**
 * Shared HTML sanitizer for question content (passages, stems, choices,
 * explanations). Allows only the formatting tags we render safely:
 *
 *   - u, b, i, em, strong, br : inline formatting
 *   - p                       : College Board passages wrap each paragraph in <p>
 *   - sup, sub                : footnote markers, chemical formulas
 *
 * Anything else (script, style, iframe, span, div, ...) is stripped.
 *
 * Use with React's `dangerouslySetInnerHTML`. The sanitizer must be the
 * single source of truth — every component that renders question HTML
 * should call this function so the allowlist stays consistent.
 */
export function sanitizeHtml(html: string): string {
  if (!html) return "";
  return html.replace(/<\/?(?!\/?(u|b|i|em|strong|br|p|sup|sub)\b)[^>]*>/gi, "");
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
