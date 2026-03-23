# Automated Scorers

In lesson 4 you built a custom eval harness from scratch. You ran 18 test cases through the agent and got raw JSON results. The point was to feel what an eval *is*: a dataset, a run loop, a scoring rubric. You also felt what's painful about doing it by hand: editing JSON to score, no UI, no comparison between runs.

In this lesson we throw away the custom harness and adopt the real tools the industry uses. Specifically: **`braintrust`** (the SDK and dashboard) plus **`autoevals`** (the scorer library). Both are TypeScript native, both made by the same team, both work with a free Braintrust account.

## Why Migrate Now

You could keep building the custom harness. Add a tiny web UI to read results, add comparison logic, add automated scorers, add database persistence... and now you've built a worse version of Braintrust.

The reason we built our own first wasn't to use it forever. It was to make sure when we install a framework, every piece of its API maps to a concept you already understand.

Here's the mapping:

| Our custom harness | Braintrust |
|--------------------|------------|
| `for` loop over test cases in `run.ts` | `Eval()` block |
| Loading `golden.json` | `data: () => [...]` |
| Calling `generateText` for each case | `task: async (input) => ...` |
| Manually editing scores in JSON | scorer functions in `scores: [...]` |
| Reading `evals/results/<timestamp>.json` | the Braintrust dashboard |
| Eyeballing two JSON files | the dashboard's run history and comparison view |
| `npm run eval` (custom tsx script) | `braintrust eval evals/diagram.eval.ts` |

Braintrust is the **dashboard plus the SDK**. autoevals is a separate, focused library of scorer functions made by the same team. You can use autoevals without Braintrust (just import scorer functions), but together they give you the full picture: write the eval in code, see the results in a dashboard.

## Free Signup

Braintrust has a free tier. Sign up at [braintrust.dev](https://www.braintrust.dev), go to Settings → API keys, create a key, and add it to your `.dev.vars`:

```
BRAINTRUST_API_KEY=sk-bt-your-key-here
```

The dashboard URL prints in the terminal after every eval run. Click it and you'll see the results.

## Building the Eval

### Install

```bash
npm install --save-dev braintrust autoevals
```

### Update `.dev.vars.example`

Add the new env var so future students know they need it:

```
OPENAI_API_KEY=your-openai-api-key-here

# Free signup at https://www.braintrust.dev — used in lesson 5 for the eval dashboard
BRAINTRUST_API_KEY=your-braintrust-api-key-here
```

### Custom scorers stay code

Even with Braintrust, you still write scorers as plain functions. autoevals gives you a library of common ones (`Factuality`, `Levenshtein`, `JSONDiff`, etc.) that work for text-shaped outputs. For our shape (Excalidraw element arrays), we write two custom scorers ourselves.

#### `evals/scorers/schema.ts`

The simplest scorer: did the agent produce valid Excalidraw element data? Every element needs `id`, `type`, `x`, `y`, `width`, `height`, and a valid `type`. This catches the worst class of failures (no elements, garbage shape, missing fields):

```ts
import type { EvalScorer } from "braintrust";

const REQUIRED_FIELDS = ["id", "type", "x", "y", "width", "height"] as const;
const VALID_TYPES = ["rectangle", "ellipse", "diamond", "text", "arrow", "line"];

export interface AgentOutput {
  text: string;
  elements: unknown[];
}

export const schemaScorer: EvalScorer<string, AgentOutput, string[]> = ({
  output,
}) => {
  if (!Array.isArray(output.elements)) {
    return { name: "Schema", score: 0, metadata: { reason: "elements is not an array" } };
  }

  if (output.elements.length === 0) {
    return { name: "Schema", score: 0, metadata: { reason: "no elements produced" } };
  }

  for (const element of output.elements) {
    if (!element || typeof element !== "object") {
      return { name: "Schema", score: 0, metadata: { reason: "element is not an object" } };
    }
    const el = element as Record<string, unknown>;

    for (const field of REQUIRED_FIELDS) {
      if (!(field in el)) {
        return {
          name: "Schema",
          score: 0,
          metadata: { reason: `element ${el.id} missing field: ${field}` },
        };
      }
    }

    if (typeof el.type !== "string" || !VALID_TYPES.includes(el.type)) {
      return {
        name: "Schema",
        score: 0,
        metadata: { reason: `element ${el.id} has invalid type: ${el.type}` },
      };
    }
  }

  return {
    name: "Schema",
    score: 1,
    metadata: { elementCount: output.elements.length },
  };
};
```

A Braintrust scorer is a function that takes `{ input, output, expected, metadata }` and returns a `{ name, score, metadata }` object (or just a number, or an array of scores). The `name` shows up in the dashboard as the column header. The `metadata` appears in the per-case detail view so you can see why something scored low.

#### `evals/scorers/structure.ts`

A more interesting check: does the output match the test case's expected structure? We parse the `expectedCharacteristics` strings looking for patterns like "3 rectangle elements" or "2 arrow elements", count the actual elements by type, and score by how close we are:

```ts
import type { EvalScorer } from "braintrust";
import type { AgentOutput } from "./schema";

const TYPE_KEYWORDS: Record<string, string[]> = {
  rectangle: ["rectangle", "rectangles", "box", "boxes"],
  ellipse: ["ellipse", "ellipses", "circle", "circles"],
  diamond: ["diamond", "diamonds"],
  arrow: ["arrow", "arrows"],
  line: ["line", "lines"],
  text: ["text", "label", "labels"],
};

function parseExpectedCounts(expected: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  const joined = expected.join(" ").toLowerCase();
  for (const [type, keywords] of Object.entries(TYPE_KEYWORDS)) {
    for (const kw of keywords) {
      const re = new RegExp(`(\\d+)\\s+${kw}\\b`, "g");
      let match: RegExpExecArray | null;
      while ((match = re.exec(joined)) !== null) {
        const n = parseInt(match[1]!, 10);
        counts[type] = Math.max(counts[type] ?? 0, n);
      }
    }
  }
  return counts;
}

function countByType(elements: unknown[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const el of elements) {
    if (el && typeof el === "object" && "type" in el) {
      const t = (el as { type: string }).type;
      counts[t] = (counts[t] ?? 0) + 1;
    }
  }
  return counts;
}

export const structureScorer: EvalScorer<string, AgentOutput, string[]> = ({
  output,
  expected,
}) => {
  if (!Array.isArray(output.elements) || output.elements.length === 0) {
    return { name: "Structure", score: 0, metadata: { reason: "no elements" } };
  }

  if (!expected) {
    return { name: "Structure", score: 0.5, metadata: { reason: "no expected provided" } };
  }

  const expectedCounts = parseExpectedCounts(expected);
  const actualCounts = countByType(output.elements);

  if (Object.keys(expectedCounts).length === 0) {
    return {
      name: "Structure",
      score: 0.5,
      metadata: { reason: "no countable expectations", actualCounts },
    };
  }

  let totalScore = 0;
  let totalChecks = 0;
  for (const [type, expectedN] of Object.entries(expectedCounts)) {
    const actualN = actualCounts[type] ?? 0;
    const diff = Math.abs(expectedN - actualN);
    const typeScore = Math.max(0, 1 - diff / expectedN);
    totalScore += typeScore;
    totalChecks += 1;
  }

  return {
    name: "Structure",
    score: totalChecks > 0 ? totalScore / totalChecks : 0,
    metadata: { expectedCounts, actualCounts },
  };
};
```

This is the simplest possible structure scorer. A real production version would also check arrow connectivity, label content, layout sanity. Pattern is the same: extract expectations, compare against actual, return a fractional score.

### LLM as judge with autoevals

For qualitative checks, we use **`Factuality`** from autoevals. It takes the agent's text response and compares it against an expected reference using an LLM call. We don't write the rubric or the parsing logic — autoevals handles all of that. We just hand it `{ input, output, expected }`.

Why use a built in scorer instead of writing our own LLM judge? Because autoevals is **maintained by people who have run thousands of evals**. Their rubrics are battle tested, their parsing is robust, and they handle the edge cases we'd hit. Outsource the qualitative scoring to them.

### `evals/diagram.eval.ts`

The whole eval in one file. This is where Braintrust's `Eval()` ties everything together:

```ts
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
  data: () =>
    testCases.map((tc) => ({
      input: tc.input,
      expected: tc.expectedCharacteristics,
      metadata: { id: tc.id, difficulty: tc.difficulty, category: tc.category },
    })),

  // Same generateText call the worker uses, just without the WebSocket wrapper.
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

  // Three scorers run on every test case. Factuality is from autoevals.
  scores: [
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
```

Compare this to the 100+ line `run.ts` we wrote in lesson 4. The agent invocation is identical. The boilerplate is gone. Braintrust handles the loop, the timing, the dashboard upload, and the result storage.

### Update `package.json`

Replace the old `eval` script:

```json
"scripts": {
  "eval": "braintrust eval evals/diagram.eval.ts"
}
```

### Delete the old harness

```bash
rm evals/run.ts evals/types.ts
```

Braintrust provides its own types and the test cases now load directly inline. We don't need the old files.

## Running the Eval

```bash
npm run eval
```

You'll see something like:

```
Experiment Diagram Agent (18 cases)
Running...
[==========] 100% (18/18)

Scores:
  Factuality:  0.78
  Schema:      1.00
  Structure:   0.62

View results at: https://www.braintrust.dev/app/<your-org>/p/Diagram%20Agent/experiments/<id>
```

Click the URL. The dashboard shows:

- **Each test case as a row** with input, output, and the score from each scorer
- **An overall composite** for the entire run
- **Run history** comparing this run against previous ones with deltas
- **Trace view** for each case showing the LLM calls, tool calls, and tokens used
- **Filtering** by metadata (difficulty, category) so you can isolate where things go wrong

This is the workflow you want for the rest of the course. Each improvement lesson is "make a change → save → re-run → look at the dashboard → see if scores went up." No more JSON editing, no more manual scoring.

## Reading Your First Real Baseline

After the first run completes, look at the dashboard. You should see something like:

```
Overall: 78%
Schema:    100% (everything parses)
Structure:  62% (counts often off)
Factuality: 72% (text descriptions are usually right)
```

These exact numbers will vary. The point is you now have a **baseline**. Every Day 2 lesson is going to make a change and re-run this eval. The numbers should go up, especially on the hard test cases.

Specifically, here's where you'd expect each lesson to improve things:

| Lesson | Expected lift |
|--------|---------------|
| **6 — Context engineering** | All scores up. The agent finally knows what's on the canvas and the system prompt is dialed in. |
| **7 — Advanced tools** | Structure score up significantly. Smaller, focused tools mean fewer counting mistakes. |
| **8 — RAG** | Factuality up on domain specific cases (architecture diagrams, etc.). |
| **11 — Planning mode** | Hard cases up. Org charts and complex flows benefit most from a planning step. |

If you don't see these lifts when you make those changes, something is wrong. That's the whole point of evals.

## What is Next

You have a real eval pipeline now. From here on, every improvement lesson follows the same loop: read the technique → make the change → run `npm run eval` → look at the dashboard → see if the numbers moved.

In the next lesson we start the second half of the course: **context engineering**. You'll redesign the system prompt, serialize the canvas state into the agent's context, add chat compaction for long conversations, and add image upload for multimodal context. Then re-run this eval and watch the scores climb.
