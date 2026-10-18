import { ToolLoopAgent, type InferAgentUIMessage } from "ai";
import { createModel, modelId, openrouter } from "./model.ts";
import { instructions } from "./prompt.ts";

const webSearchEnabled = process.env.WEB_SEARCH !== "off";

export function createAssistant(id: string = modelId) {
  return new ToolLoopAgent({
    id: "afs-assistant",
    model: createModel(id),
    instructions,
    tools: webSearchEnabled ? { web_search: openrouter.tools.webSearch({ engine: "auto" }) } : {},
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
