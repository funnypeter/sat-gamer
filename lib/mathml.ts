// MathML clean-up for College Board math content.
//
// CB writes fences as <mfenced>, which MathML Core dropped: Chrome renders
// the contents with the parentheses silently missing, so "f(x)" shows as
// "fx" and the point (3, 4) as "34". Rewrite each one to the equivalent
// <mrow><mo>(</mo>…<mo>)</mo></mrow>, innermost first, keeping the
// open/close/separators attributes (defaults "(", ")", ",").

function attr(attrs: string, name: string): string | null {
  const m = attrs.match(new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, "i"));
  return m ? m[1] : null;
}

/** Split XML into its top-level elements (text between them is dropped). */
function topLevelElements(xml: string): string[] {
  const out: string[] = [];
  const tag = /<(\/?)([a-zA-Z][\w:-]*)[^>]*?(\/?)>/g;
  let depth = 0;
  let start = -1;
  let m: RegExpExecArray | null;
  while ((m = tag.exec(xml))) {
    const [, closing, , selfClosing] = m;
    if (closing) {
      depth--;
      if (depth === 0 && start >= 0) {
        out.push(xml.slice(start, m.index + m[0].length));
        start = -1;
      }
    } else if (selfClosing) {
      if (depth === 0) out.push(m[0]);
    } else {
      if (depth === 0) start = m.index;
      depth++;
    }
  }
  return out;
}

const escapeMo = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function replaceMfenced(html: string): string {
  // Innermost first: a fence whose body contains no further <mfenced.
  const innermost = /<mfenced\b([^>]*)>((?:(?!<mfenced\b)[\s\S])*?)<\/mfenced>/i;
  let out = html;
  for (let guard = 0; guard < 500 && innermost.test(out); guard++) {
    out = out.replace(innermost, (_all, attrs: string, body: string) => {
      const open = attr(attrs, "open") ?? "(";
      const close = attr(attrs, "close") ?? ")";
      const separators = (attr(attrs, "separators") ?? ",").replace(/\s+/g, "");
      const children = topLevelElements(body);
      const parts: string[] = [];
      children.forEach((child, i) => {
        if (i > 0 && separators) {
          const sep = separators[Math.min(i - 1, separators.length - 1)];
          parts.push(`<mo separator="true">${escapeMo(sep)}</mo>`);
        }
        parts.push(child);
      });
      return `<mrow>${open ? `<mo fence="true">${escapeMo(open)}</mo>` : ""}${parts.join("")}${close ? `<mo fence="true">${escapeMo(close)}</mo>` : ""}</mrow>`;
    });
  }
  return out;
}

/** Replace each <math> with its alttext — readable plain text for AI prompts. */
export function mathToText(html: string): string {
  return html.replace(/<math\b([^>]*)>[\s\S]*?<\/math>/gi, (all, attrs: string) => {
    const alt = attr(attrs, "alttext");
    return alt ? ` ${alt} ` : all.replace(/<[^>]+>/g, "");
  });
}
