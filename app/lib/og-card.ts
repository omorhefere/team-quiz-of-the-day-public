/**
 * T7 — Shareable score card (SVG → PNG via resvg).
 *
 * Built as a plain SVG string (no JSX/satori) and rasterized with the native
 * `@resvg/resvg-js`, so it runs in any Node server with zero wasm/bundler
 * issues. Rendering uses system fonts — the production image must ship a sans
 * font (see Dockerfile / HANDOFF).
 *
 * This module is pure and synchronous so it can be unit-tested by rendering to
 * a PNG buffer and checking the signature.
 */

import { Resvg } from "@resvg/resvg-js";
import { MAX_SCORE } from "./quiz";

export interface ScoreCard {
  displayName: string;
  deckDate: string;
  score: number;
  rank: number;
  total: number;
}

export const CARD_WIDTH = 1200;
export const CARD_HEIGHT = 630;

/** Escapes text for safe inclusion in SVG markup. */
function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Truncates a display name so it never overflows the card. */
function fitName(name: string): string {
  const trimmed = name.trim();
  return trimmed.length > 22 ? `${trimmed.slice(0, 21)}…` : trimmed;
}

/** Produces the SVG markup for a score card. */
export function scoreCardSvg(card: ScoreCard): string {
  const name = escapeXml(fitName(card.displayName));
  const teamWord = card.total === 1 ? "team" : "teams";
  const rankLine = escapeXml(
    `Rank #${card.rank} of ${card.total} ${teamWord} today`,
  );
  const footer = escapeXml(`${card.deckDate}  ·  play your team's daily quiz`);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_WIDTH}" height="${CARD_HEIGHT}" viewBox="0 0 ${CARD_WIDTH} ${CARD_HEIGHT}">
  <rect width="${CARD_WIDTH}" height="${CARD_HEIGHT}" fill="#0a0a12"/>
  <rect x="0" y="0" width="${CARD_WIDTH}" height="10" fill="#6366f1"/>
  <text x="72" y="110" font-family="sans-serif" font-size="32" letter-spacing="4" fill="#818cf8">OFFICE TRIVIA LEAGUE</text>
  <text x="72" y="300" font-family="sans-serif" font-size="64" font-weight="700" fill="#f3f4f6">${name}</text>
  <text x="72" y="470" font-family="sans-serif" font-size="200" font-weight="800" fill="#a5b4fc">${card.score}<tspan font-size="80" fill="#6b7280">/${MAX_SCORE}</tspan></text>
  <text x="72" y="540" font-family="sans-serif" font-size="40" fill="#d1d5db">${rankLine}</text>
  <text x="72" y="590" font-family="sans-serif" font-size="26" fill="#6b7280">${footer}</text>
</svg>`;
}

/** Renders a score card to a PNG buffer. */
export function renderScoreCardPng(card: ScoreCard): Buffer {
  const resvg = new Resvg(scoreCardSvg(card), {
    fitTo: { mode: "width", value: CARD_WIDTH },
    font: { loadSystemFonts: true, defaultFontFamily: "sans-serif" },
  });
  return resvg.render().asPng();
}
