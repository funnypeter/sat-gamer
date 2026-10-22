// Grading for SAT Math grid-ins ("student-produced response", answer_format
// 'spr'). College Board lists every form it accepts — e.g. ["3/2", "1.5"] or
// [".6666", ".6667", "2/3"] — so a typed answer is right if it matches one of
// them as written, or has the same exact numeric value as one of them.
//
// Exact value, not "close enough": on the real test 0.67 is NOT accepted for
// 2/3 (too few digits), and CB's list already carries the truncated and
// rounded decimals it does accept. Matching value lets "1.50", "3/2" and
// "+1.5" all count without inventing tolerance the test doesn't give.

function normalize(s: string): string {
  return s
    .trim()
    .replace(/[−–]/g, "-") // typographic minus / dash
    .replace(/\s+/g, "")
    .replace(/^\+/, "")
    .toLowerCase();
}

/** Parse "12", "-0.5", ".5", "7/4", "-3/8" to a number; null if not numeric. */
export function parseNumeric(s: string): number | null {
  const v = normalize(s);
  if (/^-?\d*\.?\d+$/.test(v) || /^-?\d+\.$/.test(v)) return Number(v);
  const frac = v.match(/^(-?\d*\.?\d+)\/(-?\d*\.?\d+)$/);
  if (frac) {
    const den = Number(frac[2]);
    return den === 0 ? null : Number(frac[1]) / den;
  }
  return null;
}

export function isSprAnswerCorrect(given: string, accepted: readonly string[]): boolean {
  const g = normalize(given);
  if (!g) return false;
  const gv = parseNumeric(g);
  return accepted.some((a) => {
    if (normalize(a) === g) return true;
    const av = parseNumeric(a);
    return gv !== null && av !== null && Math.abs(gv - av) < 1e-9;
  });
}
