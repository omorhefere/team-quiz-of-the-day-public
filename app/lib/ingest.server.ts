/**
 * Source ingestion: turn a URL or PDF into clean, stored text.
 *
 * Server-only (`.server`). Two ingestion paths, same output contract:
 *   - `ingestUrl(raw)`  — fetch a web page, extract its readable text.
 *   - `ingestPdf(buf, filename)` — parse a PDF buffer, extract its text.
 *
 * Both return `{ label, text }` and throw `IngestError` on failure.
 * The extracted text is stored in the `source` table; generation reads it
 * later without ever re-fetching — so a flaky URL or slow PDF parse can't
 * break the paid quiz-generation flow.
 */

import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import { PDFParse } from "pdf-parse";

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
  // Truncate before JSDOM to bound synchronous CPU/memory on the event loop.
  const doc = new JSDOM(html.slice(0, 2_000_000), { url }).window.document;
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
 * Validates a URL before the server fetches it (SSRF guard).
 *
 * Blocks loopback/private/link-local hosts by hostname string. This is a
 * first-line defence; it doesn't cover DNS rebinding (noted for later).
 * Callers must use redirect:"manual" and re-call this on every Location
 * header so a 302 to an internal IP can't bypass the check.
 */
function assertSafeUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(typeof raw === "string" ? raw.trim() : raw);
  } catch {
    throw new IngestError("That doesn't look like a valid URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new IngestError("Only http(s) URLs are supported.");
  }
  const host = url.hostname.toLowerCase();
  const blocked =
    host === "localhost" ||
    host === "[::1]" ||   // IPv6 loopback with brackets (Node's URL.hostname)
    host === "::1" ||     // IPv6 loopback without brackets (normalisation edge)
    host.endsWith(".local") ||
    /^(127\.|10\.|0\.|169\.254\.|192\.168\.)/.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    /^100\./.test(host);  // RFC 6598 shared address + Fly.io internal metadata
  if (blocked) {
    throw new IngestError("That address isn't allowed.");
  }
  return url;
}

/** Max redirects to follow when fetching a page. */
const MAX_REDIRECTS = 5;

/**
 * Fetches `url`, following redirects manually so every hop is re-validated
 * by assertSafeUrl. Using redirect:"follow" would let a 302 to an internal
 * IP bypass the SSRF check on the original URL.
 */
async function fetchSafe(
  url: URL,
  signal: AbortSignal,
): Promise<Response> {
  const HEADERS = {
    "user-agent": "OfficeTriviaLeagueBot/1.0 (+quiz ingestion)",
    accept: "text/html,application/xhtml+xml",
  };

  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const res = await fetch(current, { signal, redirect: "manual", headers: HEADERS });
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) throw new IngestError("Got a redirect with no Location header.");
      // Re-assert the redirect target — this is the key SSRF defence.
      current = assertSafeUrl(new URL(location, current).toString());
      continue;
    }
    return res;
  }
  throw new IngestError("Too many redirects.");
}

/** Max PDF upload size — 20 MB is generous for a company doc. */
const MAX_PDF_BYTES = 20 * 1024 * 1024;

/**
 * Extracts text from a PDF buffer. The filename becomes the source label.
 * Throws IngestError if the file isn't a valid PDF, is too large, or has no
 * extractable text (e.g. a scanned-image PDF without OCR).
 */
export async function ingestPdf(
  buffer: ArrayBuffer,
  filename: string,
): Promise<{ label: string; text: string }> {
  if (buffer.byteLength > MAX_PDF_BYTES) {
    throw new IngestError("That PDF is too large (max 20 MB).");
  }

  let rawText: string;
  try {
    const parser = new PDFParse({ data: Buffer.from(buffer) });
    const result = await parser.getText();
    await parser.destroy();
    rawText = result.text;
  } catch (err) {
    if (err instanceof IngestError) throw err;
    throw new IngestError("Couldn't parse that PDF — is it a valid, unencrypted PDF?");
  }

  const text = normalize(rawText);
  if (text.length < 50) {
    throw new IngestError(
      "Couldn't find readable text in that PDF. Scanned-image PDFs aren't supported.",
    );
  }
  return { label: filename, text };
}

/** Fetches a URL and returns its readable text (or throws IngestError). */
export async function ingestUrl(raw: string): Promise<{ label: string; text: string }> {
  const url = assertSafeUrl(raw);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetchSafe(url, controller.signal);
  } catch (err) {
    if (err instanceof IngestError) throw err;
    throw new IngestError("Couldn't reach that page.");
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) throw new IngestError(`The page returned ${res.status}.`);
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("html")) {
    throw new IngestError("That URL isn't an HTML page.");
  }

  const MAX_HTML_BYTES = 10 * 1024 * 1024; // 10 MB

  // Reject via Content-Length when present (fast path).
  const contentLength = Number(res.headers.get("content-length") ?? 0);
  if (contentLength > MAX_HTML_BYTES) {
    throw new IngestError("That page is too large to ingest (> 10 MB).");
  }

  // Stream the body and abort if it exceeds the cap, so a server that omits
  // Content-Length can't force us to buffer an arbitrarily large response.
  if (!res.body) throw new IngestError("The page returned an empty body.");
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  const reader = res.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > MAX_HTML_BYTES) {
      await reader.cancel();
      throw new IngestError("That page is too large to ingest (> 10 MB).");
    }
    chunks.push(value);
  }
  const html = new TextDecoder().decode(
    chunks.reduce((acc, c) => { const m = new Uint8Array(acc.byteLength + c.byteLength); m.set(acc); m.set(c, acc.byteLength); return m; }, new Uint8Array(0)),
  );

  const text = extractReadableText(html, url.toString());
  if (text.length < 50) {
    throw new IngestError("Couldn't find readable text on that page.");
  }
  return { label: url.toString(), text };
}
