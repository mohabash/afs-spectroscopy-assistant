import { ToolLoopAgent, type InferAgentUIMessage } from "ai";
import { createModel, modelId, openrouter } from "./model.ts";
import { instructions } from "./prompt.ts";

export const webSearch = process.env.WEB_SEARCH || "auto";
if (!["auto", "native", "exa", "off"].includes(webSearch)) {
  throw new Error(`WEB_SEARCH must be auto, native, exa or off, got "${webSearch}"`);
}

export function createAssistant(id: string = modelId) {
  return new ToolLoopAgent({
    id: "afs-assistant",
    model: createModel(id),
    instructions,
    tools: webSearch === "off" ? {} : { web_search: openrouter.tools.webSearch({ engine: webSearch }) },
  });
}

export type AssistantMetadata = {
  model: string;
  seconds?: number;
  inputTokens?: number;
  cachedTokens?: number;
  outputTokens?: number;
  cost?: number;
};

export type AssistantUIMessage = InferAgentUIMessage<ReturnType<typeof createAssistant>, AssistantMetadata>;
