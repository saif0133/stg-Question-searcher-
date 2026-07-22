import type { ReactNode } from "react";

/*
 Splits the search text into keywords (same behaviour as the search engine:
 all keywords, any order) and highlights every occurrence in the text.
*/
export function highlightKeywords(text: string, searchText: string): ReactNode {
  const keywords = searchText
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);

  if (keywords.length === 0) return text;

  // Escape regex special characters in each keyword.
  const escaped = keywords.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pattern = new RegExp(`(${escaped.join("|")})`, "gi");

  const parts = text.split(pattern);

  return parts.map((part, index) => {
    const isMatch = keywords.includes(part.toLowerCase());
    return isMatch ? (
      <mark key={index} className="hl">
        {part}
      </mark>
    ) : (
      <span key={index}>{part}</span>
    );
  });
}
