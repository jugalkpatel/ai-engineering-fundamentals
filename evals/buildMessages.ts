import type { ModelMessage } from "ai";

export interface SeedData {
  userPrompt: string;
  assistantConfirmation: string;
  elements: unknown[];
}

export interface GoldenTestCase {
  id: string;
  input: string;
  seed?: SeedData;
  expectedCharacteristics: string[];
  expectedKeywords?: string[];
  preservedIds?: string[];
  difficulty: "simple" | "medium" | "hard" | "edge";
  category: "create" | "modify" | "domain" | "edge";
}

export function buildMessages(tc: GoldenTestCase): ModelMessage[] {
  if (!tc.seed) {
    return [{ role: "user", content: tc.input }];
  }

  const callId = `seed_${tc.id}`;
  return [
    { role: "user", content: tc.seed.userPrompt },
    {
      role: "assistant",
      content: [
        {
          type: "tool-call",
          toolCallId: callId,
          toolName: "generateDiagram",
          input: { elements: tc.seed.elements },
        },
      ],
    },
    {
      role: "tool",
      content: [
        {
          type: "tool-result",
          toolCallId: callId,
          toolName: "generateDiagram",
          output: {
            type: "json",
            value: { elements: tc.seed.elements as never },
          },
        },
      ],
    },
    { role: "assistant", content: tc.seed.assistantConfirmation },
    { role: "user", content: tc.input },
  ];
}
