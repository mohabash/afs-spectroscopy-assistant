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

const EXAMPLES = [
  {
    label: "Whey protein",
    text: "We run a fairly clear whey stream before a concentration step. Could an in-line measurement track protein concentration as the stream changes? Our lab can supply reference results.",
  },
  {
    label: "Tablet blend",
    text: "Our tablet press is fed from a powder blend with one active ingredient. Lab results arrive too late. Can a fiber probe in the feed frame follow the active ingredient concentration?",
  },
  {
    label: "Rejected batches",
    text: "Customers keep rejecting some of our paint batches because of colour and feel. What sensor should we install?",
  },
  {
    label: "Weld cracks",
    text: "Can you measure tensile strength and internal cracks of welded steel pipes in-line with spectroscopy?",
  },
];

export default function Page() {
  const { messages, sendMessage, status, error, stop } = useChat<AssistantUIMessage>();
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
            <ConversationEmptyState>
              <div className="flex flex-col items-center gap-3 text-center">
                <h3 className="text-sm font-medium">Paste a customer enquiry</h3>
                <p className="max-w-md text-sm text-muted-foreground">
                  The assistant answers with a decision status, clarification questions, a recommendation and a
                  feasibility plan, each claim linked to the page of the AFS material it comes from.
                </p>
                <div className="flex flex-wrap justify-center gap-2">
                  {EXAMPLES.map((example) => (
                    <Button key={example.label} onClick={() => sendMessage({ text: example.text })} size="sm" variant="outline">
                      {example.label}
                    </Button>
                  ))}
                </div>
              </div>
            </ConversationEmptyState>
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
        {busy ? (
          <Button onClick={stop} type="button" variant="outline">
            Stop
          </Button>
        ) : (
          <Button disabled={!input.trim()} type="submit">
            Send
          </Button>
        )}
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
