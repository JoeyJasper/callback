// Comparing words the way a search does: case, accents, punctuation, a
// plural and ligatures don't matter, word boundaries do. Shared by the
// evidence matcher and the ATS check.

/** The words of `text` as compared: lowercased, accents, punctuation and a plural folded. */
export function words(text: string): string[] {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}+#]+/gu, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .map((word) => (word.length > 3 && word.endsWith("s") ? word.slice(0, -1) : word));
}

/** Where `needle` starts in `haystack` as consecutive words, or -1. */
export function indexOfWords(haystack: string[], needle: string[], from = 0): number {
  if (needle.length === 0) return -1;
  for (let start = from; start + needle.length <= haystack.length; start++) {
    if (needle.every((word, offset) => haystack[start + offset] === word)) return start;
  }
  return -1;
}

/** Whether `phrase` appears in `text` as whole words, forgiving case, punctuation and a plural. */
export function mentions(text: string, phrase: string): boolean {
  return indexOfWords(words(text), words(phrase)) !== -1;
}
