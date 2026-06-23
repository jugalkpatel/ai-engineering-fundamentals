import { AIChatAgent } from "@cloudflare/ai-chat";
// NOTE - what is stepCountIs?
import { convertToModelMessages } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { SYSTEM_PROMPT } from "./system-prompt.ts";
import { streamAgent } from "./agent-core.ts";

interface ENV extends Cloudflare.Env {
  OPENAI_API_KEY: string;
}

export class DesignAgent extends AIChatAgent<ENV> {
  async onChatMessage() {
    const openai = createOpenAI({ apiKey: this.env.OPENAI_API_KEY });
    // streamText - calls the LLM and returns a stream, so we can show tokens
    // to the user as they're generated instead of waiting for the full reply
    const result = streamAgent({
      model: openai("gpt-5.4-mini"),
      system: SYSTEM_PROMPT,
      // convertToModelMessages is an handy tool that we get from AI SDK
      // the message history has to be sent to LLM in very specific format
      // if we don't follow that format we get API Error
      // but sometimes that format is not that useful for UI related things
      // so we usually convert from and to for specific reasons
      // this.messages are the messages that we get from durable object
      // durable object(small sqlite db) that saves messages for us
      messages: await convertToModelMessages(this.messages),
      maxSteps: 5,
    });
    return result.toUIMessageStreamResponse();
  }
}
