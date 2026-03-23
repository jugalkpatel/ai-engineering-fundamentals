// Diagram agent eval. Uses Braintrust's Eval() function plus autoevals scorers
// instead of the custom harness from lesson 4.
//
// Run with:
//   npm run eval
//
// Requires BRAINTRUST_API_KEY in .dev.vars (free signup at braintrust.dev).

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Eval } from "braintrust";
import { Factuality } from "autoevals";
import { generateText, stepCountIs } from "ai";
import { createOpenAI } from "@ai-sdk/openai";

import { tools } from "../src/tools";
import { SYSTEM_PROMPT } from "../src/system-prompt";
import { schemaScorer, type AgentOutput } from "./scorers/schema";
import { structureScorer } from "./scorers/structure";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

// Load OPENAI_API_KEY and BRAINTRUST_API_KEY from .dev.vars
function loadDevVars(): Record<string, string> {
  try {
    const content = readFileSync(join(ROOT, ".dev.vars"), "utf-8");
    const vars: Record<string, string> = {};
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const [key, ...rest] = trimmed.split("=");
      if (key) vars[key.trim()] = rest.join("=").trim();
    }
    return vars;
  } catch {
    return {};
  }
}

const devVars = loadDevVars();
// Set process.env so braintrust and autoevals can read them.
for (const [k, v] of Object.entries(devVars)) {
  if (!process.env[k]) process.env[k] = v;
}

const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });

interface GoldenTestCase {
  id: string;
  input: string;
  expectedCharacteristics: string[];
  difficulty: "simple" | "medium" | "hard" | "edge";
  category: string;
}

const goldenPath = join(ROOT, "evals/datasets/golden.json");
const testCases: GoldenTestCase[] = JSON.parse(readFileSync(goldenPath, "utf-8"));

Eval<string, AgentOutput, string[]>("Diagram Agent", {
  // Map our golden dataset onto Braintrust's expected shape.
  // Each test case has an input prompt, the expected characteristics list,
  // and metadata so the dashboard can filter by difficulty and category.
  data: () =>
    testCases.map((tc) => ({
      input: tc.input,
      expected: tc.expectedCharacteristics,
      metadata: { id: tc.id, difficulty: tc.difficulty, category: tc.category },
    })),

  // The task: invoke the agent. Same generateText call the worker uses, just
  // without the WebSocket / Durable Object wrapper.
  task: async (input) => {
    const result = await generateText({
      model: openai("gpt-5.4-mini"),
      system: SYSTEM_PROMPT,
      prompt: input,
      tools,
      stopWhen: stepCountIs(5),
    });

    const elements: unknown[] = [];
    for (const step of result.steps) {
      for (const toolResult of step.toolResults ?? []) {
        if (toolResult.toolName === "generateDiagram") {
          const output = toolResult.output as { elements?: unknown[] };
          if (Array.isArray(output?.elements)) {
            elements.push(...output.elements);
          }
        }
      }
    }

    return { text: result.text, elements };
  },

  // Scorers run on every test case. Factuality is from autoevals (LLM judge),
  // schema and structure are our own deterministic scorers.
  scores: [
    // Factuality compares the agent's text response against the expected
    // characteristics joined as a single reference string.
    async (args) => {
      const expectedText = (args.expected ?? []).join(". ");
      return Factuality({
        input: args.input,
        output: args.output.text,
        expected: expectedText,
      });
    },
    schemaScorer,
    structureScorer,
  ],
});
