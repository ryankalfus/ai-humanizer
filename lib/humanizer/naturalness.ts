const OVER_ADVANCED_SWAPS: Record<string, string> = {
  utilize: "use",
  ameliorate: "improve",
  facilitate: "help",
  myriad: "many",
  plethora: "many",
  commence: "start",
  procure: "get",
  elucidate: "explain",
  furthermore: "also",
  henceforth: "from now on",
  delve: "go into",
  underscore: "show",
  meticulous: "careful",
  commendable: "good",
  robust: "strong",
  seamless: "smooth",
  pivotal: "key",
  comprehensive: "complete",
  leverage: "use",
  intricate: "complex",
  realm: "area",
  landscape: "field",
  nuanced: "subtle",
  transformative: "major",
  paramount: "main",
};

const FILLER_PHRASES = [
  "plays a crucial role",
  "at its core",
  "in today's world",
  "in today's landscape",
  "it is important to note",
  "it is worth noting",
  "this highlights",
  "this underscores",
];

export function downgradeOverwrittenWords(text: string) {
  let output = text.replace(/—/g, ", ");

  for (const [hardWord, simplerWord] of Object.entries(OVER_ADVANCED_SWAPS)) {
    const pattern = new RegExp(`\\b${hardWord}\\b`, "gi");
    output = output.replace(pattern, simplerWord);
  }

  return output;
}

export function cleanupSurfacePatterns(text: string) {
  return text
    .replace(/—/g, ", ")
    .replace(/\bUltimately,\s*/gi, "")
    .replace(/\bIn conclusion,\s*/gi, "")
    .replace(/\bTo summarize,\s*/gi, "")
    .replace(/\bOverall,\s*/gi, "")
    .replace(/^\s*None provided\s*$/gim, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function scoreNaturalness(text: string) {
  const lower = text.toLowerCase();
  const overAdvancedCount = Object.keys(OVER_ADVANCED_SWAPS).reduce(
    (count, word) => count + (lower.match(new RegExp(`\\b${word}\\b`, "g"))?.length ?? 0),
    0,
  );
  const adverbCount = lower.match(/\b\w+ly\b/g)?.length ?? 0;
  const exotics =
    lower.match(/\b(quintessential|multifaceted|paradigm|juxtaposition|aforementioned)\b/g)
      ?.length ?? 0;
  const fillerCount = FILLER_PHRASES.reduce(
    (count, phrase) => count + (lower.match(new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"))?.length ?? 0),
    0,
  );
  const abstractNouns =
    lower.match(/\b\w+(tion|sion|ment|ness|ity|ism|ship)\b/g)?.length ?? 0;

  return Math.max(
    0,
    100
      - overAdvancedCount * 18
      - exotics * 12
      - fillerCount * 8
      - Math.max(0, adverbCount - 8) * 2
      - Math.max(0, abstractNouns - 10) * 2,
  );
}
