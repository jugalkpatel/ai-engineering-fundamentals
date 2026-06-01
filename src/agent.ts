import { AIChatAgent, OnChatMessageOptions } from "@cloudflare/ai-chat";
// NOTE - what is stepCountIs?
import {
  streamText,
  stepCountIs,
  convertToModelMessages,
  StreamTextOnFinishCallback,
  ToolSet,
} from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { tools } from "./tools";

interface ENV {
  OPENAI_API_KEY: string;
}

// a chat agent has list of conversations in which there two types of messages:
// 1. the messages it responds with
// 2. the messages you give it
// there is more tool calls, images etc.
// Those things are append only we just keep appending to this list
// system prompt is the first message that's optional and sits at the very beginning of that chat history and it's the place where you put
// context that is relevant for the entire conversation.
const SYSTEM_PROMPT = `
You're a diagram design assistant. You help users create and modify diagrams on Excalidraw canvas.

When user asks you to create diagram, use the generateDiagram tool to produce Excalidraw elements.

Guidelines for generating diagrams:
- Give each element unique id (e.g "rect-1", "text-1", "arrow-1")
- Position elements with reasonable spacing (at least 20px gap between elements)
- Use rectangles for boxes/containers, ellipses for circles, diamonds for decision points
- Add text labels inside or near shapes
- Connect related elements with arrows
- Use clean layout: left to right or top to bottom
- Default to strokeColor "#1e1e1e" and backgroundColor "transparent"
- Set roughness to 1 for hand-drawn look

When user asks to modify an element, use modifyDiagram tool with the elements id.
`;

export class DesignAgent extends AIChatAgent<ENV> {
  async onChatMessage(
    _onFinish: StreamTextOnFinishCallback<ToolSet>,
    _options?: OnChatMessageOptions,
  ): Promise<Response | undefined> {
    const openai = createOpenAI({ apiKey: this.env.OPENAI_API_KEY });
    const result = streamText({
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
      tools,
      stopWhen: stepCountIs(5),
      providerOptions: { openai: { strictJSONSchema: false } },
    });
    return result.toUIMessageStreamResponse();
  }
}
