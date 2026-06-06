/**
 * Deck seed / manual loader.
 *
 * Reads every `app/data/decks/*.json` file, validates it against the canonical
 * deck schema (exactly 10 questions, 4 choices each), and upserts it. This is
 * the v1 way decks get into the system now that the LLM generation track is out
 * of scope — the operator authors deck JSON by hand and runs `npm run seed`.
 *
 * Local: writes to the PGlite dev DB (set PGLITE_DATA_DIR so `npm run dev` sees
 * the data — the npm script does this for you).
 * Production: set DATABASE_URL and run the same command.
 */

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { getDb } from "~/db/client";
import { upsertDeck } from "~/db/repository";
import { deckInputSchema } from "~/lib/quiz";

const DECKS_DIR = path.resolve(process.cwd(), "app/data/decks");

async function main() {
  const files = (await readdir(DECKS_DIR)).filter((f) => f.endsWith(".json"));
  if (files.length === 0) {
    console.error(`No deck JSON files found in ${DECKS_DIR}`);
    process.exit(1);
  }

  const db = await getDb();
  let ok = 0;
  let failed = 0;

  for (const file of files.sort()) {
    const raw = await readFile(path.join(DECKS_DIR, file), "utf8");
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      console.error(`✗ ${file}: invalid JSON — ${(err as Error).message}`);
      failed++;
      continue;
    }

    const result = deckInputSchema.safeParse(parsed);
    if (!result.success) {
      console.error(
        `✗ ${file}: ${result.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`,
      );
      failed++;
      continue;
    }

    await upsertDeck(db, {
      deckDate: result.data.deck_date,
      questions: result.data.questions,
      curatorNotes: result.data.curator_notes,
    });
    console.log(`✓ ${file} → published deck ${result.data.deck_date}`);
    ok++;
  }

  console.log(`\nSeeded ${ok} deck(s), ${failed} failed.`);
  if (failed > 0) process.exit(1);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
