import { AIChatAgent } from "@cloudflare/ai-chat";
import { convertToModelMessages } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { streamAgent } from "./agent-core";
import { compactHistory } from "./context/compaction";

interface Env extends Cloudflare.Env {
  OPENAI_API_KEY: string;
}

// Pull canvas state out of the user's just-arrived message. The client
// attaches it as a `data-canvas-state` part on every outgoing message via
// App.tsx — that's the only way to send extra payload alongside a message
// in the Cloudflare AI Chat protocol, since useAgentChat / AIChatAgent only
// understand UIMessage on the wire. onChatMessage runs because the user
// sent a message, so the last message in the array is always theirs.
function extractCanvasState(messages: unknown[]): unknown[] {
  const last = messages.at(-1) as { parts?: unknown[] } | undefined;
  for (const part of last?.parts ?? []) {
    const p = part as { type?: string; data?: { elements?: unknown[] } };
    if (p?.type === "data-canvas-state" && Array.isArray(p.data?.elements)) {
      return p.data.elements;
    }
  }
  return [];
}

export class DesignAgent extends AIChatAgent<Env> {
  async onChatMessage() {
    const openai = createOpenAI({ apiKey: this.env.OPENAI_API_KEY });
    const model = openai("gpt-5.4-mini");

    const canvasState = extractCanvasState(this.messages);

    // Compact older history if the conversation has gotten long. The recent
    // few turns stay verbatim; everything older is collapsed into one
    // summary system message.
    const allMessages = await convertToModelMessages(this.messages);
    const messages = await compactHistory(allMessages, { model });

    const result = streamAgent({
      model,
      messages,
      canvasState,
    });

    return result.toUIMessageStreamResponse();
  }
}
