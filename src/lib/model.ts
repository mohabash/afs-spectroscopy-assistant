import type { ProviderMetadata } from "ai";
import {
  createOpenRouter,
  type OpenRouterChatSettings,
} from "@openrouter/ai-sdk-provider";

export const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY ?? "",
  compatibility: "strict",
});

const providerOrder = (process.env.OPENROUTER_PROVIDER_ORDER ?? "")
  .split(",")
  .map((slug) => slug.trim())
  .filter(Boolean);

export const modelId = process.env.OPENROUTER_MODEL || "openai/gpt-6.1-sol";

export function createModel(id: string = modelId) {
  const settings: OpenRouterChatSettings = {
    reasoning: { effort: "medium" },
    usage: { include: true },
    ...(id.startsWith("openai/") && { extraBody: { verbosity: "low" } }),
    // Gemini 4 Argon rejects requests whose max output is below 32K.
    ...(id.startsWith("google/") && { maxTokens: 32768 }),
    ...(providerOrder.length > 0 && { provider: { order: providerOrder } }),
  };
  return openrouter(id, settings);
}

export function openrouterCost(metadata: ProviderMetadata | undefined) {
  const usage = metadata?.openrouter?.usage;
  return usage && typeof usage === "object" && "cost" in usage ? Number(usage.cost ?? 0) : 0;
}
