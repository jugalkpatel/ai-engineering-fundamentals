import {
  generateText,
  streamText,
  stepCountIs,
  type LanguageModel,
  type ModelMessage,
} from "ai";
import { tools } from "./tools";
import { SYSTEM_PROMPT } from "./system-prompt";

interface AgentArgs {
  model: LanguageModel;
  messages: ModelMessage[];
  system?: string;
  maxSteps?: number;
}

// streaming variant, used by the worker for the live chat experience
export function streamAgent({
  model,
  messages,
  system = SYSTEM_PROMPT,
  maxSteps = 5,
}: AgentArgs) {
  return streamText({
    model,
    system,
    messages,
    tools,
    stopWhen: stepCountIs(maxSteps),
  });
}

// Non streaming variant, used by the eval so we can collect the full result
// and pull out elements for scoring
export async function runAgent({
  model,
  system = SYSTEM_PROMPT,
  messages,
  maxSteps = 5,
}: AgentArgs) {
  const result = await generateText({
    model,
    system,
    messages,
    tools,
    stopWhen: stepCountIs(maxSteps),
  });

  return {
    text: result.text,
    elements: extractElements(result.steps),
    steps: result.steps,
  };
}

interface StepLike {
  toolResults?: { toolName: string; output: unknown }[];
}

export function extractElements(steps: StepLike[]): unknown[] {
  const elements: unknown[] = [];

  for (const step of steps) {
    for (const toolResult of step.toolResults ?? []) {
      if (toolResult.toolName === "generateDiagram") {
        const output = toolResult.output as { elements?: unknown[] };

        if (Array.isArray(output?.elements)) {
          elements.push(...output.elements);
        }
      }
    }
  }

  return elements;
}
