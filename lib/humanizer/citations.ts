export interface ProtectedSpan {
  placeholder: string;
  original: string;
}

const CITATION_PATTERNS = [
  /\([A-Z][A-Za-z' -]+(?:,?\s(?:19|20)\d{2})?(?::\s?\d+)?\)/g,
  /\[[0-9,\s-]+\]/g,
  /\([A-Z][A-Za-z' -]+\s\d+\)/g,
];

export function extractCitations(text: string) {
  const found = new Map<string, ProtectedSpan>();
  let index = 0;

  for (const pattern of CITATION_PATTERNS) {
    for (const match of text.matchAll(pattern)) {
      const original = match[0];
      if (!found.has(original)) {
        found.set(original, {
          placeholder: `__CITATION_${index}__`,
          original,
        });
        index += 1;
      }
    }
  }

  return [...found.values()];
}

export function applyProtectedSpans(text: string, spans: ProtectedSpan[]) {
  return spans.reduce(
    (current, span) => current.split(span.original).join(span.placeholder),
    text,
  );
}

export function restoreProtectedSpans(text: string, spans: ProtectedSpan[]) {
  return spans.reduce(
    (current, span) => current.split(span.placeholder).join(span.original),
    text,
  );
}
