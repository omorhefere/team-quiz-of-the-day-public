/**
 * Factory: returns the real Claude-backed service when an API key is configured,
 * otherwise the deterministic fake. This is the single seam the rest of the app
 * imports — routes never `new` a provider directly, so dev (no key) and
 * production (real key) run the same code path.
 *
 * Server-only (`.server`).
 */

import { env } from "~/lib/env";
import type { LLMService } from "./schema";
import { AnthropicLLMService } from "./anthropic.server";
import { FakeLLMService } from "./fake";

export function getLLMService(): LLMService {
  if (env.anthropicApiKey) {
    return new AnthropicLLMService(
      env.anthropicApiKey,
      env.llmModel,
      env.llmVerifyModel,
    );
  }
  return new FakeLLMService();
}

/** True when real AI generation is available (vs the dev fake). */
export function isRealLLMConfigured(): boolean {
  return !!env.anthropicApiKey;
}
