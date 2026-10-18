"use client";

import { useChat } from "@ai-sdk/react";
import { useState, type FormEvent } from "react";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { AssistantMetadata, AssistantUIMessage } from "@/lib/agent";

export default function Page() {
  const { messages, sendMessage, status, error } = useChat<AssistantUIMessage>();
  const [input, setInput] = useState("");
  const busy = status === "submitted" || status === "streaming";

  function submit(event?: FormEvent) {
    event?.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    sendMessage({ text });
    setInput("");
  }

  return (
    <main className="mx-auto flex h-dvh w-full max-w-3xl flex-col px-4">
      <header className="border-b py-3">
        <h1 className="text-sm font-semibold">AFS Spectroscopy Assistant</h1>
        <p className="text-xs text-muted-foreground">
          First technical assessment of an in-line spectroscopy enquiry, cited to the AFS materials.
        </p>
      </header>

      <Conversation className="flex-1">
        <ConversationContent>
          {messages.length === 0 && (
            <ConversationEmptyState
              title="Paste a customer enquiry"
              description="The assistant answers with a decision status, clarification questions, a recommendation and a feasibility plan."
            />
          )}
          {messages.map((message) => {
            const text = message.parts.flatMap((part) => (part.type === "text" ? [part.text] : [])).join("");
            const sources = message.parts.flatMap((part) => (part.type === "source-url" ? [part] : []));
            return (
              <Message from={message.role} key={message.id}>
                <MessageContent>
                  {message.role === "user" ? (
                    <p className="whitespace-pre-wrap">{text}</p>
                  ) : (
                    <MessageResponse isAnimating={busy && message.id === messages.at(-1)?.id}>{text}</MessageResponse>
                  )}
                  {sources.length > 0 && (
                    <ul className="text-xs text-muted-foreground">
                      {sources.map((source) => (
                        <li key={source.sourceId}>
                          <a className="underline" href={source.url} rel="noreferrer" target="_blank">
                            {source.title || source.url}
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                  {message.role === "assistant" && <RunInfo metadata={message.metadata} />}
                </MessageContent>
              </Message>
            );
          })}
          {status === "submitted" && <p className="text-sm text-muted-foreground">Reading the materials…</p>}
          {error && <p className="text-sm text-destructive">Something went wrong: {error.message}</p>}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <form className="flex items-end gap-2 border-t py-3" onSubmit={submit}>
        <Textarea
          className="max-h-48 min-h-20"
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) submit(event);
          }}
          placeholder="Describe the process, the sample and what should be measured…"
          value={input}
        />
        <Button disabled={busy || !input.trim()} type="submit">
          Send
        </Button>
      </form>
    </main>
  );
}

function RunInfo({ metadata }: { metadata?: AssistantMetadata }) {
  if (metadata?.seconds === undefined) return null;
  const tokens = `${metadata.inputTokens ?? 0} in (${metadata.cachedTokens ?? 0} cached) · ${metadata.outputTokens ?? 0} out`;
  const cost = metadata.cost ? ` · $${metadata.cost.toFixed(3)}` : "";
  return (
    <p className="text-xs text-muted-foreground">
      {metadata.model} · {metadata.seconds}s · {tokens}
      {cost}
    </p>
  );
}
