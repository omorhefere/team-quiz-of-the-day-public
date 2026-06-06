/**
 * T3 — Team code generator.
 *
 * Codes look like `BLUE-FOX-71`: ADJECTIVE-ANIMAL-NN. They are:
 *   - speakable aloud (read out during standup),
 *   - memorable (real words),
 *   - case-insensitive (always stored/compared uppercase),
 *   - drawn from curated, deliberately inoffensive wordlists.
 *
 * Collisions are statistically unlikely but handled by the registration layer,
 * which retries on a unique-constraint violation. This module is pure.
 */

import { randomInt } from "node:crypto";

// Curated, family-safe wordlists. Keep them clean — these never go through the
// profanity filter, so only add words you'd happily read aloud at work.
export const ADJECTIVES = [
  "BLUE", "RED", "GOLD", "JADE", "TEAL", "CYAN", "LIME", "PINK", "GRAY", "MINT",
  "AMBER", "CORAL", "IVORY", "OLIVE", "PEARL", "RUBY", "SAGE", "PLUM", "ROSE", "SNOW",
  "BRAVE", "CALM", "BOLD", "KEEN", "WISE", "SWIFT", "WARM", "KIND", "NEAT", "PURE",
  "QUICK", "BRIGHT", "CRISP", "FRESH", "GRAND", "HAPPY", "JOLLY", "LUCKY", "MERRY", "NOBLE",
  "PROUD", "QUIET", "ROYAL", "SHARP", "SOLID", "SUNNY", "TIDY", "VIVID", "WITTY", "ZESTY",
  "COSMIC", "MIGHTY", "NIMBLE", "PLUCKY", "SUPER", "TURBO", "ULTRA", "MEGA", "HYPER", "PRIME",
  "ARCTIC", "DESERT", "FOREST", "POLAR", "RIVER", "STORM", "THUNDER", "FROSTY", "MISTY", "STELLAR",
] as const;

export const ANIMALS = [
  "FOX", "OWL", "CAT", "DOG", "BEE", "ELK", "RAM", "BAT", "COD", "JAY",
  "WOLF", "BEAR", "LYNX", "HARE", "DEER", "SEAL", "CRAB", "MOTH", "WASP", "TOAD",
  "EAGLE", "HAWK", "RAVEN", "ROBIN", "FINCH", "HERON", "STORK", "CRANE", "SWAN", "GOOSE",
  "TIGER", "LEMUR", "OTTER", "PANDA", "KOALA", "BISON", "MOOSE", "HORSE", "ZEBRA", "CAMEL",
  "SHARK", "WHALE", "SQUID", "TROUT", "PERCH", "PRAWN", "GUPPY", "RAYS", "EELS", "CLAM",
  "GECKO", "IGUANA", "COBRA", "VIPER", "MAMBA", "SKINK", "TURTLE", "NEWT", "FROG", "DRAGON",
  "MONGOOSE", "MEERKAT", "BADGER", "BEAVER", "MARTEN", "WEASEL", "FERRET", "RABBIT", "DONKEY", "WALRUS",
] as const;

export interface CodeParts {
  adjective: string;
  animal: string;
  number: string; // two digits, "00"–"99"
}

function pick<T>(arr: readonly T[]): T {
  return arr[randomInt(arr.length)];
}

/** Generates the parts of a fresh team code. */
export function generateCodeParts(): CodeParts {
  return {
    adjective: pick(ADJECTIVES),
    animal: pick(ANIMALS),
    number: String(randomInt(100)).padStart(2, "0"),
  };
}

/** Generates a fresh team code, e.g. `BLUE-FOX-71`. */
export function generateTeamCode(): string {
  const { adjective, animal, number } = generateCodeParts();
  return `${adjective}-${animal}-${number}`;
}

/** Normalizes user-entered codes for storage and comparison (uppercase, trimmed). */
export function normalizeTeamCode(input: string): string {
  return input.trim().toUpperCase();
}

const CODE_RE = /^[A-Z]+-[A-Z]+-\d{2}$/;

/** True if `code` has the ADJECTIVE-ANIMAL-NN shape. */
export function isTeamCodeFormat(code: string): boolean {
  return CODE_RE.test(normalizeTeamCode(code));
}

/** Approximate size of the code space — useful for reasoning about collisions. */
export const CODE_SPACE = ADJECTIVES.length * ANIMALS.length * 100;
