/**
 * Step 3b — website ingestion: turn a URL into clean, readable text.
 *
 * Server-only (`.server`). It does two separable jobs, kept apart on purpose:
 *   - `extractReadableText(html)` — PURE (no network). Given HTML, return the
 *     main readable text. Pure = unit-testable without hitting the internet.
 *   - `ingestUrl(url)` — fetch the page (with safety guards), then extract.
 *
 * WHY Mozilla Readability (not a naive tag-strip): a company page is mostly
 * chrome — nav bars, cookie banners, footers, "related posts". Feeding that junk
 * to the quiz generator produces junk questions. Readability is the same
 * algorithm as Firefox's "Reader View": it isolates the main article content and
 * drops the boilerplate, so the stored text is the stuff that actually matters.
 */

import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";

/** Cap stored text so one huge page can't blow out the generation context. */
const MAX_TEXT_CHARS = 100_000; // ~25k tokens — plenty for a page, bounded.
/** Don't let a slow/hanging server tie up a request forever. */
const FETCH_TIMEOUT_MS = 10_000;

/** Thrown with a user-facing message; the route stores it as the source error. */
export class IngestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IngestError";
  }
}

/** Collapse whitespace and cap length so stored text is tidy and bounded. */
function normalize(text: string): string {
  return text
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, MAX_TEXT_CHARS);
}

/**
 * Extracts the main readable text from a page's HTML. Falls back to the whole
 * body text if Readability can't find a clear article (e.g. a sparse landing
 * page), so we always get *something* rather than failing.
 */
export function extractReadableText(html: string, url = "https://example.com"): string {
  const doc = new JSDOM(html, { url }).window.document;
  let text = "";
  try {
    // Readability mutates the document, so this runs on a throwaway parse.
    const article = new Readability(doc).parse();
    text = article?.textContent ?? "";
  } catch {
    // Readability can throw on malformed pages — fall through to the fallback.
  }
  if (!text.trim()) {
    text = doc.body?.textContent ?? "";
  }
  return normalize(text);
}

/**
 * Validates a user-supplied URL before we fetch it server-side.
 *
 * WHY: the server fetching an arbitrary URL the user typed is a classic SSRF
 * risk — someone could point it at `localhost`, a private IP, or a cloud
 * metadata endpoint (169.254.169.254) to make our server reach internal
 * services. We allow only http(s) and block loopback/private/link-local hosts.
 * (A hardened version would also resolve DNS and re-check the resolved IP; noted
 * for later.)
 */
function assertSafeUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new IngestError("That doesn't look like a valid URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new IngestError("Only http(s) URLs are supported.");
  }
  const host = url.hostname.toLowerCase();
  const blocked =
    host === "localhost" ||
    host.endsWith(".local") ||
    /^(127\.|10\.|0\.|169\.254\.|192\.168\.)/.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host);
  if (blocked) {
    throw new IngestError("That address isn't allowed.");
  }
  return url;
}

/** Fetches a URL and returns its readable text (or throws IngestError). */
export async function ingestUrl(raw: string): Promise<{ label: string; text: string }> {
  const url = assertSafeUrl(raw);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "user-agent": "OfficeTriviaLeagueBot/1.0 (+quiz ingestion)",
        accept: "text/html,application/xhtml+xml",
      },
    });
  } catch {
    throw new IngestError("Couldn't reach that page.");
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) throw new IngestError(`The page returned ${res.status}.`);
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("html")) {
    throw new IngestError("That URL isn't an HTML page.");
  }

  const text = extractReadableText(await res.text(), url.toString());
  if (text.length < 50) {
    throw new IngestError("Couldn't find readable text on that page.");
  }
  return { label: url.toString(), text };
}
