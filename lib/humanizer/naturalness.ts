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
};

export function downgradeOverwrittenWords(text: string) {
  let output = text;

  for (const [hardWord, simplerWord] of Object.entries(OVER_ADVANCED_SWAPS)) {
    const pattern = new RegExp(`\\b${hardWord}\\b`, "gi");
    output = output.replace(pattern, simplerWord);
  }

  return output;
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

  return Math.max(0, 100 - overAdvancedCount * 18 - exotics * 12 - Math.max(0, adverbCount - 8) * 2);
}
