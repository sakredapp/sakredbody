/**
 * Search snippets, as data rather than markup.
 *
 * ── Why this exists ────────────────────────────────────────────────────────
 *
 * Postgres `ts_headline` wraps matched words in delimiters, `<b>` by default.
 * What it does NOT do is escape the surrounding text — it hands back whatever
 * was stored. So rendering a headline as HTML makes any message a stored XSS
 * against everyone who searches: post `<img src=x onerror=...>`, wait for an
 * admin to search, done.
 *
 * The fix is to never produce HTML at all. The delimiters are private-use
 * codepoints, which no keyboard produces and no paste realistically carries,
 * and the server splits on them into `{ text, match }` segments. The client
 * renders those as text nodes. Nothing a member typed is ever parsed as markup.
 *
 * If someone did contrive to post U+E000, the worst case is a wrongly
 * emphasised word — not script execution.
 *
 * Delimiters and splitter live together so the two can never drift apart.
 */

export const HL_START = "\uE000";
export const HL_STOP = "\uE001";

/** The options string handed to ts_headline. */
export function headlineOptions(maxWords = 24, minWords = 8): string {
  return `StartSel=${HL_START}, StopSel=${HL_STOP}, MaxFragments=1, MaxWords=${maxWords}, MinWords=${minWords}`;
}

export interface HeadlineSegment {
  text: string;
  match: boolean;
}

/**
 * Split a delimited headline into runs.
 *
 * `"the ␀moon␁ is full"` becomes
 * `[{the , false}, {moon, true}, { is full, false}]`.
 *
 * Empty runs are dropped, so a headline that opens or closes on a match
 * doesn't produce blank segments.
 */
export function segmentHeadline(headline: string): HeadlineSegment[] {
  const segments: HeadlineSegment[] = [];

  for (const chunk of headline.split(HL_START)) {
    const [hit, ...rest] = chunk.split(HL_STOP);

    if (rest.length === 0) {
      // No stop delimiter in this chunk, so it was never inside a highlight.
      if (hit) segments.push({ text: hit, match: false });
      continue;
    }

    if (hit) segments.push({ text: hit, match: true });

    // Re-join in case the tail legitimately contained the stop delimiter.
    const tail = rest.join(HL_STOP);
    if (tail) segments.push({ text: tail, match: false });
  }

  return segments;
}
