// Minimal LaTeX → plain text converter for the resume, used by the provenance
// check. It understands only what Rish-Resume.tex uses; unknown commands keep
// their brace contents, which errs toward matching more text, not less.
// \textbf{X} becomes **X** so bold emphasis can be compared with resume.json.

// Number of {…} arguments each command takes. Unknown commands take none, so
// any following {…} group is treated as ordinary text.
const ARITY = {
  textbf: 1, textit: 1, href: 2, begin: 1, end: 1, section: 1,
  vspace: 1, hspace: 1, extracolsep: 1, resumeSubheading: 4,
};
const DROP_ALL_ARGS = new Set(['vspace', 'hspace', 'extracolsep']);
const DROP_FIRST_ARG = new Set(['href', 'begin', 'end']);
const BOLD = new Set(['textbf']);
// Commands whose arguments become separate lines (company / location / title / dates).
// Their arguments may start on the next source line.
const SPLIT_ARGS = new Set(['resumeSubheading', 'section']);
const LINE_BREAK = new Set(['newline', 'item', 'par']);

/** Returns the text between \begin{document} and \end{document}. */
export function documentBody(tex) {
  const start = tex.indexOf('\\begin{document}');
  const end = tex.indexOf('\\end{document}');
  if (start < 0 || end < 0) throw new Error('No document environment found in .tex');
  return tex.slice(start + '\\begin{document}'.length, end);
}

function stripComments(tex) {
  // Remove % comments, but keep escaped \%.
  return tex.replace(/(^|[^\\])%.*$/gm, '$1');
}

/** Reads a balanced {…} group starting at index i (which must be '{'). */
function readGroup(src, i) {
  let depth = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '\\') { j++; continue; }
    if (src[j] === '{') depth++;
    else if (src[j] === '}' && --depth === 0) return { content: src.slice(i + 1, j), next: j + 1 };
  }
  throw new Error(`Unbalanced braces near: ${src.slice(i, i + 40)}`);
}

function readArgs(src, i, count, allowNewlines) {
  const isSpace = (ch) => ch === ' ' || ch === '\t' || (allowNewlines && (ch === '\n' || ch === '\r'));
  const args = [];
  let j = i;
  while (args.length < count) {
    let k = j;
    while (isSpace(src[k])) k++;
    if (src[k] === '[') { j = src.indexOf(']', k) + 1; continue; } // skip [options]
    if (src[k] !== '{') break;
    const g = readGroup(src, k);
    args.push(g.content);
    j = g.next;
  }
  return { args, next: j };
}

function convert(src) {
  let out = '';
  for (let i = 0; i < src.length; ) {
    const c = src[i];
    if (c === '\\') {
      const ch = src[i + 1];
      if (ch === '\\') { out += '\n'; i += 2; continue; }
      if (!/[A-Za-z]/.test(ch ?? '')) { out += ch ?? ''; i += 2; continue; } // \& \% \_ …
      const m = /^[A-Za-z]+\*?/.exec(src.slice(i + 1));
      const name = m[0].replace('*', '');
      i += 1 + m[0].length;
      if (LINE_BREAK.has(name)) { out += '\n'; continue; }
      const { args, next } = readArgs(src, i, ARITY[name] ?? 0, SPLIT_ARGS.has(name));
      i = next;
      if (DROP_ALL_ARGS.has(name)) continue;
      const kept = DROP_FIRST_ARG.has(name) ? args.slice(1) : args;
      if (BOLD.has(name)) out += `**${convert(kept.join('')).trim()}**`;
      else if (SPLIT_ARGS.has(name)) out += '\n' + kept.map(convert).join('\n') + '\n';
      else out += kept.map(convert).join('');
      continue;
    }
    if (c === '{' || c === '}') { i++; continue; }
    if (c === '&') { out += '\n'; i++; continue; } // table column separator
    if (c === '$') { i++; continue; }
    out += c === '\n' || c === '\r' ? ' ' : c;
    i++;
  }
  return out;
}

/** Normalizes dashes, quotes and whitespace so equivalent text compares equal. */
export function normalize(s) {
  return s
    .replace(/---|--|[‒-―]/g, '-')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[ \t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .trim();
}

/** Plain text of the resume body, one logical line per line, with **bold** markers. */
export function texToText(tex) {
  return normalize(convert(stripComments(documentBody(tex))))
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .join('\n');
}

/** All \href URLs in the document body. */
export function texLinks(tex) {
  return [...stripComments(documentBody(tex)).matchAll(/\\href\{([^}]*)\}/g)].map((m) => m[1]);
}

export const stripBold = (s) => s.replace(/\*\*/g, '');
