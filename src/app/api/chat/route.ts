import { createAgentUIStreamResponse, type UIMessage } from "ai";
import { createAssistant, type AssistantMetadata } from "@/lib/agent";
import { modelId, openrouterCost } from "@/lib/model";
import { withReminder } from "@/lib/prompt";

export const maxDuration = 300;

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!Array.isArray(body?.messages)) {
    return Response.json({ error: "messages must be an array" }, { status: 400 });
  }

  const messages = body.messages as UIMessage[];
  const last = messages.at(-1);
  if (last?.role !== "user" || !Array.isArray(last.parts)) {
    return Response.json({ error: "the last message must be a user message with parts" }, { status: 400 });
  }

  const textIndex = last.parts.findLastIndex((part) => part.type === "text");
  const uiMessages = [
    ...messages.slice(0, -1),
    {
      ...last,
      parts: last.parts.map((part, i) => (i === textIndex && part.type === "text" ? { ...part, text: withReminder(part.text) } : part)),
    },
  ];

  const started = Date.now();
  let cost = 0;

  return createAgentUIStreamResponse({
    agent: createAssistant(),
    uiMessages,
    originalMessages: messages,
    sendSources: true,
    messageMetadata: ({ part }): AssistantMetadata | undefined => {
      if (part.type === "finish-step") cost += openrouterCost(part.providerMetadata);
      if (part.type === "start") return { model: modelId };
      if (part.type === "finish") {
        return {
          model: modelId,
          seconds: Math.round((Date.now() - started) / 100) / 10,
          inputTokens: part.totalUsage.inputTokens,
          cachedTokens: part.totalUsage.inputTokenDetails.cacheReadTokens,
          outputTokens: part.totalUsage.outputTokens,
          cost,
        };
      }
    },
  });
}
