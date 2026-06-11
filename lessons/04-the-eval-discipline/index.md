# The Eval Discipline

You have a working agent. It generates diagrams. Some look great. Some are a mess. Without a way to **measure** quality, every change you make from here is guesswork. This lesson establishes the discipline that defines the AI engineer role: evals.

## Why Evals Matter

Traditional software has unit tests. Given an input, you assert an exact output. AI systems are **probabilistic**: the same input can produce different outputs run to run. Unit tests cannot tell you if the model got "good enough," and they cannot catch a regression where the model still passes some hard coded check but produces worse results.

Evals are the AI engineer's test suite. They:

- **Establish a baseline** so you know how good the system is right now
- **Catch regressions** when a prompt change, model upgrade, or tool refactor makes things worse
- **Measure improvement** so when you ship a change, you can prove it helped
- **Expose weaknesses** by including hard cases that the current system can't handle yet, giving you concrete improvement targets

There is a saying in this field: **if you can't measure it, you can't improve it**. The second half of this course is a series of improvement techniques. None of them mean anything without a number to compare against. That number comes from evals.

## Golden Datasets

A **golden dataset** is a curated set of test cases. Each test case has:

- An **input** (what the user might say)
- **Expected characteristics** (what a good response looks like)
- **Difficulty** (so you can see where the system is strong and weak)
- **Category** (so you can spot patterns in failures)

Notice that "expected characteristics" is not "expected output." We're not pinning the agent to one exact answer. We're saying "a good response should have these properties." A flowchart with three boxes connected by arrows is a good response, regardless of the exact pixel positions.

### How to design test cases

Spread cases across difficulties so the baseline score has room to improve:

- **Simple (5-6 cases):** single shapes, basic flowcharts. The agent should ace these.
- **Medium (5-6 cases):** multi step flows, entity relationships, sequence diagrams. Layout becomes a challenge.
- **Hard (5-6 cases):** dense org charts, microservices architectures, network topologies. The naive agent will struggle.
- **Edge cases (2-3 cases):** vague requests ("draw something"), contradictions ("a square that is also a circle"), very long inputs. These test how gracefully the agent fails.

The hard and edge cases are where you'll see the biggest gains in the second half of the course. Their scores should start low and climb as you improve context, tools, and architecture.

## Scoring Concepts

### Manual vs automated

In this lesson we set up the harness and **conceptually** establish manual scoring. The way you'd manually score a result is to open the JSON file, read each entry, and assign a score from 1 to 5 along with notes about what worked and what did not. We will not actually do this as a class exercise, because reading raw JSON and editing it by hand is painful and there is no good way to compare runs.

That pain is the point. **In the next lesson we adopt a real eval framework (Evalite) that gives us a dashboard, automated scorers, and run comparison out of the box.** But before we get there, you need to understand what an eval *is* — the dataset, the run loop, the scoring rubric — so the framework's API maps to concepts you already know.

### Pass at k vs pass to the power of k

These are common eval metrics for non deterministic systems:

- **pass@k**: probability that the system produces a correct answer in **at least one** of k attempts. Useful for "best of k" workflows.
- **pass^k**: probability that **all** k attempts are correct. Useful for measuring reliability.

We won't compute these in this lesson (single run per test case for the baseline) but they matter when you start running each test case multiple times to measure consistency.

### Capability vs regression evals

- **Capability evals** measure what the system *can* do. The hard test cases. They tell you "the agent can now handle complex org charts, here is the score."
- **Regression evals** measure what the system *should still* do. The simple test cases. They tell you "did anything we changed break the basics?"

A good eval suite has both. Capability evals tell you when you've improved. Regression evals tell you when you've broken something.

## A Scoring Rubric

A good eval needs a clear rubric so different reviewers (or different LLM judges) score the same way. Here is a 1-5 rubric we will use in this course. We will reference it in lesson 5 when we wire up scorers.

| Score | Meaning |
|-------|---------|
| **5** | Excellent. Matches all expected characteristics. Layout is clean, labels are correct, connections are right. |
| **4** | Good. Matches most characteristics. Minor issues like a slightly off label or imperfect spacing. |
| **3** | Acceptable. The basic structure is there but has noticeable issues: overlapping elements, wrong connections, or missing labels. |
| **2** | Poor. Recognizable as an attempt but with major problems. Mostly wrong shapes, broken layout, or missing key elements. |
| **1** | Failed. Empty result, error, or completely wrong (drew a flowchart when asked for an org chart). |

Once you have a rubric, anyone (or anything) scoring the agent's output applies the same criteria. Without one, scores drift and runs aren't comparable.

## Building the Eval Harness

Here is everything we add in this lesson.

### Install tsx

The eval harness is a TypeScript script we run with `tsx`:

```bash
npm install --save-dev tsx
```

### `evals/types.ts` (new file)

TypeScript types for our eval data structures:

```ts
export type Difficulty = "simple" | "medium" | "hard" | "edge";
export type Category = "layout" | "content" | "structure" | "edge-case";

export interface TestCase {
  id: string;
  input: string;
  expectedCharacteristics: string[];
  difficulty: Difficulty;
  category: Category;
}

export interface EvalResult {
  testCaseId: string;
  input: string;
  response: string;
  elements: unknown[];
  durationMs: number;
  error?: string;
}

export interface ScoredResult extends EvalResult {
  score: 1 | 2 | 3 | 4 | 5;
  notes?: string;
}
```

### `evals/datasets/golden.json` (already in your project)

**The golden dataset has been pre populated since lesson 1.** Whether you have been following along on your own branch or you just checked out `lesson-4`, the file exists at `evals/datasets/golden.json` with 18 test cases (6 simple, 5 medium, 5 hard, 3 edge). We did not want to spend the live coding session typing out 200 lines of JSON. Open the file in your editor and read through the test cases to see how they are structured.

Here is one simple and one hard test case as a reference:

```json
[
  {
    "id": "tc-03",
    "input": "Draw a simple flowchart with Start, Process, and End boxes connected by arrows",
    "expectedCharacteristics": [
      "3 rectangle elements with labels Start, Process, End",
      "2 arrow elements connecting them in sequence",
      "Arrows have startBinding and endBinding to the rectangles",
      "No overlapping elements",
      "Layout flows left to right or top to bottom"
    ],
    "difficulty": "simple",
    "category": "structure"
  },
  {
    "id": "tc-11",
    "input": "Draw an org chart for a company: CEO at top, 3 VPs reporting to CEO (Engineering, Sales, Marketing), each VP has 3 directors under them",
    "expectedCharacteristics": [
      "1 CEO box at top",
      "3 VP boxes in a horizontal row below CEO",
      "9 director boxes below the VPs (3 per VP)",
      "Arrows from CEO to each VP and from each VP to its directors",
      "Hierarchical layout with no overlapping elements",
      "Total: 13 boxes and 12 connections"
    ],
    "difficulty": "hard",
    "category": "layout"
  }
]
```

The full file has 6 simple, 5 medium, 5 hard, and 3 edge cases. Take 2-3 minutes to skim through it and notice the difficulty progression.

### Extract the system prompt

We need to share the system prompt between the agent (worker side) and the eval harness (node side). Move it to its own file so the eval can import it without pulling in Cloudflare specific dependencies.

`src/system-prompt.ts` (new file):

```ts
export const SYSTEM_PROMPT = `You are a diagram design assistant. You help users create and modify diagrams on an Excalidraw canvas.

When the user asks you to create a diagram, use the generateDiagram tool to produce Excalidraw elements.

Guidelines for generating diagrams:
- Give each element a unique id (e.g. "rect-1", "text-1", "arrow-1")
- Position elements with reasonable spacing (at least 20px gap between elements)
- Use rectangles for boxes/containers, ellipses for circles, diamonds for decision points
- Add text labels inside or near shapes
- Connect related elements with arrows
- Use a clean layout: left to right or top to bottom
- Default to strokeColor "#1e1e1e" and backgroundColor "transparent"
- Set roughness to 1 for a hand-drawn look

When the user asks to modify an element, use the modifyDiagram tool with the element's id.`;
```

`src/agent.ts` (modified): import the prompt instead of declaring it inline.

```ts
import { SYSTEM_PROMPT } from "./system-prompt";
```

Remove the local `SYSTEM_PROMPT` constant.

### `evals/run.ts` (new file)

The eval harness. Loads the golden dataset, runs each test case through the model directly (skipping the WebSocket and Durable Object layer), collects results, and writes them to a timestamped file:

```ts
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { generateText, stepCountIs } from "ai";
import { createOpenAI } from "@ai-sdk/openai";

import { tools } from "../src/tools";
import { SYSTEM_PROMPT } from "../src/system-prompt";
import type { TestCase, EvalResult } from "./types";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

// Load OPENAI_API_KEY from .dev.vars (the same file wrangler uses)
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

const env = { ...loadDevVars(), ...process.env };
const apiKey = env.OPENAI_API_KEY;
if (!apiKey) {
  console.error("OPENAI_API_KEY is not set in .dev.vars or environment");
  process.exit(1);
}

const openai = createOpenAI({ apiKey });

async function runTestCase(testCase: TestCase): Promise<EvalResult> {
  const start = Date.now();
  try {
    const result = await generateText({
      model: openai("gpt-5.4-mini"),
      system: SYSTEM_PROMPT,
      prompt: testCase.input,
      tools,
      stopWhen: stepCountIs(5),
    });

    // Pull out elements from any generateDiagram tool calls.
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

    return {
      testCaseId: testCase.id,
      input: testCase.input,
      response: result.text,
      elements,
      durationMs: Date.now() - start,
    };
  } catch (error) {
    return {
      testCaseId: testCase.id,
      input: testCase.input,
      response: "",
      elements: [],
      durationMs: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function main() {
  const datasetPath = join(ROOT, "evals/datasets/golden.json");
  const testCases: TestCase[] = JSON.parse(readFileSync(datasetPath, "utf-8"));

  console.log(`Running ${testCases.length} test cases...\n`);

  const results: EvalResult[] = [];
  for (const testCase of testCases) {
    process.stdout.write(`[${testCase.id}] ${testCase.difficulty.padEnd(6)} `);
    const result = await runTestCase(testCase);
    results.push(result);
    if (result.error) {
      console.log(`ERROR: ${result.error}`);
    } else {
      console.log(`${result.elements.length} elements, ${result.durationMs}ms`);
    }
  }

  // Write timestamped results for manual scoring
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const resultsDir = join(ROOT, "evals/results");
  mkdirSync(resultsDir, { recursive: true });
  const outPath = join(resultsDir, `${timestamp}.json`);
  writeFileSync(outPath, JSON.stringify(results, null, 2));

  console.log(`\nResults written to ${outPath}`);
  console.log(`\nNext: open the file, review each result, and add score (1-5) and notes.`);

  console.log("\n=== Summary ===");
  console.log(`Total: ${results.length}`);
  console.log(`Errors: ${results.filter((r) => r.error).length}`);
  console.log(
    `Empty results (no elements): ${results.filter((r) => !r.error && r.elements.length === 0).length}`
  );
  const avgDuration = Math.round(
    results.reduce((sum, r) => sum + r.durationMs, 0) / results.length
  );
  console.log(`Average duration: ${avgDuration}ms`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

A few notes on this:

- We use `generateText` instead of `streamText` because the eval doesn't care about the streaming UX, only the final result.
- We invoke the model **directly** rather than going through the agent class. This skips WebSocket, Durable Objects, and the `useAgentChat` protocol. The eval is testing the LLM plus tools logic, not the transport.
- We import `tools` and `SYSTEM_PROMPT` from `src/`. That's why we extracted the prompt earlier.
- Results go to `evals/results/<timestamp>.json` so each run is preserved. The results directory is gitignored because it contains API responses.
- `loadDevVars()` reads `.dev.vars` directly so you don't need a separate env config.

### Update `package.json`

Add a script to run the harness:

```json
"scripts": {
  "eval": "tsx evals/run.ts"
}
```

### Update `.gitignore`

Results are gitignored so test runs don't pollute history:

```
evals/results
```

## Running the Evals

```bash
npm run eval
```

You'll see output like:

```
Running 18 test cases...

[tc-01] simple 1 elements, 2648ms
[tc-02] simple 2 elements, 3120ms
[tc-03] simple 5 elements, 4501ms
...

Results written to evals/results/2026-04-06T04-22-11-439Z.json

=== Summary ===
Total: 18
Errors: 0
Empty results (no elements): 1
Average duration: 4203ms
```

Open the timestamped file in your editor and skim a few entries. You will see the input prompt, the model's response text, the array of elements it generated, and how long it took. **This is what raw eval data looks like.**

## The Pain of Manual Scoring

Imagine the workflow: open this JSON file, read each of the 18 entries, mentally render each diagram, compare against expected characteristics, type a score 1-5 into the file, type notes explaining the score, save. Then run the eval again next week. Now you have two timestamped JSON files. To compare them, you... open both side by side and squint at the numbers.

This is exactly how AI engineering works without tooling. It is also exactly why **nobody actually does it this way in production**.

The discipline matters: golden datasets, scoring rubrics, baselines, comparison. The mechanism (editing JSON by hand) does not. We need:

- A UI that shows runs side by side
- A way to render the agent's output visually instead of squinting at element arrays
- Automated scorers that handle the cases a code check can decide
- An LLM as judge for the cases a human would have to look at
- Score history so we can see trends across runs

In the next lesson we get all of that. We migrate this custom harness to **[Evalite](https://www.evalite.dev/)**, a TypeScript native eval framework with a built in dashboard. The discipline you learned in this lesson maps directly onto Evalite's API:

- Our `for` loop over test cases → `evalite()` blocks
- Our golden dataset JSON → Evalite's `data` array (we keep using the same file)
- Our manual scoring rubric → Evalite scorer functions
- Our results JSON file → Evalite's dashboard
- Comparing two runs → built in to the dashboard

You needed to build the custom harness first so the framework's pieces have a meaning. Now you are ready to use a real one.

## What is Next

In the next lesson you migrate this harness to Evalite and add real scorers: code based checks (does the output have the right element types?) and an LLM as judge scorer (using a model to evaluate the diagram against the expected characteristics). You also get a dashboard for free. By the end of lesson 5 you will have your first real automated baseline.
