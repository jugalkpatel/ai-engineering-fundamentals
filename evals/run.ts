// eval harness
// load golden dataset
// run each test case in golden dataset through model
// we're going to collect the results and we're going to write the results to a file
// generateText - waits for the full response, then returns it all at once
// (no streaming) - which is what we want here since evals only care about
// the final output

import { generateText, stepCountIs } from "ai";
import { TestCase, EvalResult } from "./types";
import { createOpenAI } from "@ai-sdk/openai";
import { SYSTEM_PROMPT } from "../src/system-prompt";
import { tools } from "../src/tools";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileSync, readFileSync, mkdirSync } from "node:fs";

// Goal: figure out the folder THIS file lives in, no matter where we run it from.
// In ES modules there's no built-in __dirname, so we build it ourselves:
//   import.meta.url      -> "file:///.../evals/datasets/run.ts" (this file as a URL)
//   fileURLToPath(...)   -> "/.../evals/datasets/run.ts"        (turn URL into a normal path)
//   dirname(...)         -> "/.../evals/datasets"               (drop the filename, keep the folder)
const __dirname = dirname(fileURLToPath(import.meta.url));

// Step up one folder (".." means "parent") to get the evals/ folder.
// We use this as our starting point for finding the dataset + saving results,
// so the script works the same no matter which directory you launch it from.
const ROOT = join(__dirname, "..");

const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });

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
    process.stdout.write(`[${testCase.id}] ${testCase.difficulty.padEnd(6)}`);
    const result = await runTestCase(testCase);
    results.push(result);
    if (result.error) {
      console.log(`ERROR: ${result.error}`);
    } else {
      console.log(
        `${result.elements?.length} elements, ${result.durationMs}ms`,
      );
    }
  }

  // Write timestamped results for manual scoring
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const resultsDir = join(ROOT, "evals/results");
  mkdirSync(resultsDir, { recursive: true });
  const outPath = join(resultsDir, `${timestamp}.json`);
  writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.log(`\nResults written to ${outPath}`);
  console.log(
    `
      \nNext: open the file, review each result, and add score(1-5) and notes.
    `,
  );
  console.log("\n===Summary===");
  console.log(`Total: ${results.length}`);
  console.log(`Errors: ${results.filter((r) => r.error).length}`);
  console.log(
    `
    Empty Results(no elements): ${results.filter((r) => !r.error && r.elements.length === 0).length}
    `,
  );
  const avgDuration = Math.round(
    results.reduce((sum, r) => sum + r.durationMs, 0) / results.length,
  );
  console.log(`Average duration: ${avgDuration}ms`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
