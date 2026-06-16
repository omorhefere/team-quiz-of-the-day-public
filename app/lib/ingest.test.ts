import { describe, expect, it } from "vitest";
import { extractReadableText, ingestPdf, IngestError } from "./ingest.server";

const PAGE = `<!doctype html>
<html><head><title>Acme</title><style>.x{color:red}</style></head>
<body>
  <nav>HOME PRODUCTS COOKIE BANNER ACCEPT ALL</nav>
  <header>Sign up · Log in</header>
  <article>
    <h1>About Acme</h1>
    <p>Acme was founded in 2019 in Bristol. The company builds developer tools
    used by over five thousand engineering teams around the world.</p>
    <p>Our flagship product, AcmeDeploy, ships code to production in under ninety
    seconds. It is trusted by teams at large technology companies.</p>
    <p>The company is fully remote and operates across twelve time zones, with a
    strong culture of written documentation and asynchronous communication.</p>
  </article>
  <footer>© Acme 2026 · Privacy</footer>
  <script>var secret = "should-not-appear";</script>
</body></html>`;

describe("extractReadableText", () => {
  const text = extractReadableText(PAGE, "https://acme.example.com/about");

  it("keeps the main article content", () => {
    expect(text).toContain("Acme was founded in 2019 in Bristol");
    expect(text).toContain("AcmeDeploy");
  });

  it("drops navigation, footer and script noise", () => {
    expect(text).not.toContain("COOKIE BANNER");
    expect(text).not.toContain("should-not-appear");
  });

  it("normalizes whitespace", () => {
    expect(text).not.toMatch(/\n{3,}/);
    expect(text).not.toMatch(/ {2,}/);
  });

  it("falls back to body text when there's no clear article", () => {
    const bare = extractReadableText(
      "<html><body><div>Just one short line of text here.</div></body></html>",
    );
    expect(bare).toContain("Just one short line of text here.");
  });
});

describe("ingestPdf", () => {
  it("rejects a buffer that exceeds the 20 MB size cap", async () => {
    const oversized = new ArrayBuffer(21 * 1024 * 1024);
    await expect(ingestPdf(oversized, "big.pdf")).rejects.toBeInstanceOf(IngestError);
    await expect(ingestPdf(oversized, "big.pdf")).rejects.toThrow("too large");
  });

  it("rejects an invalid (non-PDF) buffer", async () => {
    const garbage = new TextEncoder().encode("this is not a pdf").buffer;
    await expect(ingestPdf(garbage, "fake.pdf")).rejects.toBeInstanceOf(IngestError);
  });
});
