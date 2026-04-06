# Context Engineering

You ended lesson 5 with four numbers and a flatlined Preservation score of 25 percent. The agent was working blind on every modify case because nothing in its context told it what was already on the canvas. This lesson is the first real "improvement" lesson — we make a few targeted changes and watch the eval scores climb.

The theme is **context engineering**: deciding what goes into the model's context window, in what shape, on every turn. Three pieces:

1. **Rewrite the system prompt** with a real structure (role, capabilities, constraints, behavior, examples).
2. **Serialize the canvas state** into the system prompt at request time, so the agent finally knows what exists.
3. **Compact long histories** so a 50 turn conversation doesn't blow the context budget.

Image upload is a fourth context source we'll add later, once the agent infrastructure for it is in place. Out of scope for this lesson.

## Why this is the highest leverage lesson

Look at the lesson 5 baseline:

| Scorer | Lesson 5 baseline |
|---|---|
| Schema | 91% |
| LabelKeywords | 93% |
| Structure | 63% |
| Preservation | **25%** |

Preservation tells you how often the agent successfully kept the elements that were already on the canvas when asked to modify one. Twenty five percent. The agent regenerates from scratch most of the time because it has no idea those elements exist. There's no clever prompting that fixes this — the information physically isn't in the context.

Context engineering is "put the right information in front of the model in the right shape at the right time." It is the lowest hanging fruit in any agentic system, and most teams skip straight to fine tuning when they should just be putting better context in their prompts.

## The Goldilocks zone

Anthropic's prompt engineering docs talk about a "Goldilocks zone": prompts that are detailed enough to constrain bad outputs but loose enough to let the model reason. Two failure modes:

- **Too vague**: "You are a helpful assistant." The model improvises everything. You get inconsistent ids, weird layouts, hallucinated tool calls.
- **Too prescriptive**: "Step 1: parse the request. Step 2: identify the noun phrase. Step 3: ..." The model becomes brittle. Anything outside your script falls apart.

The right shape for a tool using agent's system prompt:

1. **Role** — what is this thing? One sentence.
2. **Capabilities** — what tools exist, when to use each.
3. **Output constraints** — required fields, naming conventions, defaults.
4. **Behavioral guidelines** — when to ask, when to act, what to preserve.
5. **Few-shot examples** — 2 or 3 short input → action → reply patterns.
6. **Dynamic context** — appended at request time. Canvas state lives here.

Each section earns its place. Drop sections you don't need.

## Rewriting `SYSTEM_PROMPT`

The lesson 5 system prompt was about 15 lines of bullet point guidelines. The new one in `src/agent-core.ts` follows the structure above. Excerpt:

```ts
export const SYSTEM_PROMPT = `# Role

You are a diagram design assistant that controls an Excalidraw canvas. Your job is to translate the user's requests into precise tool calls that draw or modify shapes on the canvas. You are not a chat bot. You are a tool using agent that produces diagrams.

# Capabilities

You have two tools:

- **generateDiagram(elements)** — produce a list of Excalidraw elements... Use this when the canvas is empty, when the user asks for something brand new, or when the existing diagram needs to be replaced from scratch.
- **modifyDiagram(elementId, updates)** — change a single existing element by id. Use this when the user wants to recolor, rename, move, resize, or otherwise tweak something already on the canvas.

# Output constraints

Every element you create must include id, type, x, y, width, height...

# Behavioral guidelines

- Use the canvas state. If the canvas is non empty, the system message includes a summary of every element with its id and label. Never invent ids.
- Prefer modifyDiagram for tweaks. If the user says "make the login box red," do not regenerate the whole canvas.
- Preserve what exists. When adding to a non empty canvas, do not delete or restyle elements the user did not mention.
- Ask one clarifying question only if the request is genuinely ambiguous.

# Examples

**Example 1 — empty canvas, simple create**
User: "draw a circle and a square next to each other"
Call generateDiagram with two elements... Reply: "Done — circle on the left, square on the right."

**Example 2 — non empty canvas, recolor**
Canvas state shows rect_login ("Login") and rect_db ("Database").
User: "make the login box red."
Call modifyDiagram("rect_login", { backgroundColor: "#fa5252" }). Reply: "Done — login box is now red."

**Example 3 — non empty canvas, additive**
Canvas state shows rect_api ("API") and rect_db ("Database").
User: "add a Cache box between them and route the API through the cache."
Call generateDiagram with one new rectangle rect_cache plus arrows... Do not redraw rect_api or rect_db — they already exist.`;
```

The full version is in `src/agent-core.ts`. Read it once. Notice that the examples don't just show *good* output — they show **the exact decision the model needs to make**: which tool to call given which canvas state. Few-shot examples are most useful when they teach a decision boundary, not when they show pretty results.

## Canvas state in context

The agent runs in a Cloudflare Worker. The canvas lives in the browser. The agent has zero access to the Excalidraw API. Three options to bridge that gap:

1. **Browser sends the canvas state with every user message.** Worker reads it off the latest message and serializes it into the system prompt at request time.
2. **Browser pushes canvas state to a Durable Object** out of band whenever it changes. Worker reads from DO state.
3. **Worker reconstructs canvas state from prior tool calls** in the message history.

We pick option 1. Cleanest, no DO state to keep in sync, no out of band sync bugs, and the same path serves the eval (the eval already passes seed elements explicitly). A later lesson will replace this with an even better pattern: a **client side tool** the agent can call directly when it actually needs the info, instead of paying the token cost on every turn.

### Serializing the canvas

Raw Excalidraw JSON is huge — every element has dozens of fields and the model doesn't need most of them. We summarize.

**`src/context/canvas-state.ts`**:

```ts
export function serializeCanvasState(elements: unknown[]): string {
  if (!Array.isArray(elements) || elements.length === 0) {
    return "Canvas is empty.";
  }

  const els = elements as ElementLike[];

  // Build a map from id to a short reference string so arrows can describe
  // their endpoints by label instead of opaque ids.
  const refById = new Map<string, string>();
  for (const el of els) {
    const id = getId(el);
    const type = getType(el);
    if (!id || !type) continue;
    const label = getLabel(el);
    refById.set(id, label ? `${id} ("${label}")` : id);
  }

  const lines: string[] = [];
  const counts: Record<string, number> = {};

  for (const el of els) {
    // ... walk elements, collecting type counts and per-element lines.
    // Arrows resolve their startBinding/endBinding to ref strings:
    if (type === "arrow" || type === "line") {
      lines.push(`- ${type} ${id}: ${from} → ${to}`);
    } else {
      lines.push(label ? `- ${type} ${id} "${label}"` : `- ${type} ${id}`);
    }
  }

  const summary = Object.entries(counts)
    .map(([type, n]) => `${n} ${type}${n === 1 ? "" : "s"}`)
    .join(", ");

  return `Canvas contains ${summary}:\n${lines.join("\n")}`;
}
```

(Full file in `src/context/canvas-state.ts`.)

The output looks like this for a simple flow:

```
Canvas contains 3 rectangles, 2 arrows:
- rectangle rect_login "Login"
- rectangle rect_db "Database"
- rectangle rect_api "API"
- arrow arrow_1: rect_login ("Login") → rect_api ("API")
- arrow arrow_2: rect_api ("API") → rect_db ("Database")
```

That's the entire thing. About 200 characters for a five element diagram. Compact, readable, gives the model exactly what it needs: ids, labels, and connections.

### Wiring it through `agent-core`

Both the worker (live chat) and the eval (batch generateText) need canvas state. Instead of duplicating the assembly logic, we add a `canvasState` parameter to `streamAgent` / `runAgent` in `src/agent-core.ts` and they handle the system prompt assembly internally.

```ts
interface AgentArgs {
  model: LanguageModel;
  messages: ModelMessage[];
  canvasState?: unknown[];
  system?: string;
  maxSteps?: number;
}

function buildSystem(base: string, canvasState: unknown[] | undefined): string {
  return `${base}\n\n# Current canvas state\n\n${serializeCanvasState(canvasState ?? [])}`;
}

export function streamAgent({ model, messages, canvasState, system = SYSTEM_PROMPT, maxSteps = 5 }: AgentArgs) {
  return streamText({
    model,
    system: buildSystem(system, canvasState),
    messages,
    tools,
    stopWhen: stepCountIs(maxSteps),
  });
}
```

Now any caller that has elements just passes them in. `runAgent` does the same thing. Two callers, one source of truth, no drift.

### Browser side: data part on the user message

The AI SDK supports custom **data parts** on `UIMessage`. We use one to carry the canvas snapshot.

In `src/App.tsx`, wrap `sendMessage` so every outgoing user message gets a `data-canvas-state` part appended:

```ts
const sendWithCanvas = useMemo(
  () => (msg: { role: "user"; parts: { type: "text"; text: string }[] }) => {
    const elements = excalidrawAPI?.getSceneElements() ?? [];
    sendMessage({
      ...msg,
      parts: [
        ...msg.parts,
        { type: "data-canvas-state", data: { elements } } as never,
      ],
    });
  },
  [sendMessage, excalidrawAPI]
);
```

Then pass `sendWithCanvas` to `<ChatPanel>` instead of the raw `sendMessage`. `ChatPanel` doesn't even know about canvas state — it just calls the function it's given.

### Worker side: read it back

In `src/agent.ts`, walk the latest user message looking for the data part, and pass the elements through to `streamAgent`:

```ts
function extractCanvasState(messages: unknown[]): unknown[] {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i] as { role?: string; parts?: unknown[] };
    if (m?.role !== "user" || !Array.isArray(m.parts)) continue;
    for (const part of m.parts) {
      const p = part as { type?: string; data?: { elements?: unknown[] } };
      if (p?.type === "data-canvas-state" && Array.isArray(p.data?.elements)) {
        return p.data.elements;
      }
    }
    return [];
  }
  return [];
}

export class DesignAgent extends AIChatAgent<Env> {
  async onChatMessage() {
    const openai = createOpenAI({ apiKey: this.env.OPENAI_API_KEY });
    const model = openai("gpt-5.4-mini");

    const canvasState = extractCanvasState(this.messages);
    const allMessages = await convertToModelMessages(this.messages);
    const messages = await compactHistory(allMessages, { model });

    const result = streamAgent({ model, messages, canvasState });
    return result.toUIMessageStreamResponse();
  }
}
```

Custom data parts are not understood by `convertToModelMessages` (they get dropped on the way to the model — which is what we want, the model sees them via the system prompt instead). So we read them BEFORE the conversion.

## Compaction

Long conversations eventually exceed the model's context window. Even before that, a 50 turn chat is mostly stale: the user has moved on, the early decisions have been overridden. Sending all of it on every turn is wasteful.

The fix is **compaction**: when history gets long enough, summarize the old portion with the model itself and replace it with one short system message.

**`src/context/compaction.ts`**:

```ts
import { generateText, type LanguageModel, type ModelMessage } from "ai";

const DEFAULT_THRESHOLD = 32_000;
const DEFAULT_KEEP_LAST = 4;

export async function compactHistory(
  messages: ModelMessage[],
  options: { model: LanguageModel; threshold?: number; keepLast?: number }
): Promise<ModelMessage[]> {
  const threshold = options.threshold ?? DEFAULT_THRESHOLD;
  const keepLast = options.keepLast ?? DEFAULT_KEEP_LAST;

  if (characterCount(messages) < threshold) return messages.slice();
  if (messages.length <= keepLast) return messages.slice();

  const olderMessages = messages.slice(0, messages.length - keepLast);
  const recentMessages = messages.slice(messages.length - keepLast);

  const transcript = olderMessages.map(messageToText).join("\n");

  const summary = await generateText({
    model: options.model,
    system: "You compress conversation history into terse summaries that preserve every decision the user made and every diagram element the assistant created. Keep element ids verbatim. Output a single paragraph, no preamble.",
    prompt: `Summarize this conversation:\n\n${transcript}`,
  });

  const summaryMessage: ModelMessage = {
    role: "system",
    content: `Summary of earlier conversation: ${summary.text}`,
  };

  return [summaryMessage, ...recentMessages];
}
```

A few decisions baked into this:

- **Character based threshold (32K chars).** Roughly 8K tokens. Conservative — leaves room for the system prompt, canvas state, and the recent messages within a 16K token budget. We don't pull in a token counting library because the heuristic is good enough for a threshold check.
- **Keep the last 4 messages verbatim.** Recent context is what the user is actually thinking about. Compressing the most recent turns is jarring and loses tool call wiring.
- **Pure function.** Doesn't mutate the input array. Returns a new one. Easy to reason about, easy to test.
- **Summarize with the same model we use for chat.** Costs one extra API call when compaction triggers (which is rarely — most conversations never hit 32K chars).

Wired into `agent.ts` right before the `streamAgent` call. By the time the model sees the messages, they're already compacted if needed.

## Re-running the eval

This is the moment of truth. Make all the changes, run `npm run eval`, watch the dashboard.

```bash
npm run eval
```

There's one eval file (`evals/diagram.eval.ts`) and many **experiments** that all run it. Each meaningful agent change gets its own experiment name in Braintrust, set via the `EXPERIMENT_NAME` env var. The package.json `eval` script hard codes the current variant, so on this branch:

```json
"eval": "EXPERIMENT_NAME=lesson-06-context-engineering dotenv -e .dev.vars -- braintrust eval evals/diagram.eval.ts"
```

When you want to compare an ad hoc variant without editing files (e.g., trying a different prompt), override on the command line:

```bash
EXPERIMENT_NAME=lesson-06-prompt-v2 npm run eval
```

Each EXPERIMENT_NAME maps to a Braintrust experiment. Multiple runs of the same experiment accumulate as runs *within* that experiment, with full history. Different experiment names → different experiments → side by side comparison in the dashboard.

The mental model:

- **eval** = the recipe (dataset + task + scorers). Stable.
- **experiment** = one frozen run of that recipe. Comparable. New name when you change something meaningful.
- **run** = one execution of an experiment. Multiple runs of the same experiment let you re-verify or capture variance.

You don't make a new eval file every lesson — you make a new experiment name. New eval file only if the dataset, scorers, or task interface changes substantially.

Lesson 5 → lesson 6 results on a real run:

| Scorer | Lesson 5 | Lesson 6 | Δ |
|---|---|---|---|
| Schema | 91% | **100%** | +9 |
| LabelKeywords | 93% | **95%** | +2 |
| Structure | 63% | **67%** | +4 |
| **Preservation** | **25%** | **50%** | **+25** |

Every metric moved up. Schema hit the ceiling. The headline is **Preservation doubled** — the canvas state in the prompt is doing exactly what we wanted: the agent now knows which ids exist and reaches for `modifyDiagram` instead of regenerating from scratch.

It's not 100 yet. The remaining failures are cases where the agent still fires `generateDiagram` for tweaks. Lesson 7 (advanced tools) sharpens the tools themselves and should push this further. Lesson 11 (planning mode) gives the agent a chance to think before acting, which helps the harder cases.

### A small but important fix: simulating the canvas in the eval

While wiring this up we hit a subtle bug in the eval. The old `extractElements` only walked `generateDiagram` results, ignoring `modifyDiagram` and ignoring the seed canvas state entirely. So when the agent did the *right* thing for a modify case (called `modifyDiagram` instead of regenerating), the eval saw zero elements in the output and the preservation scorer scored zero.

The fix: `extractElements` now starts from the seed canvas state and walks tool calls in order, simulating what the canvas would look like after each call.

```ts
export function extractElements(steps: StepLike[], initial: unknown[] = []): unknown[] {
  let canvas: Record<string, unknown>[] =
    (initial as Record<string, unknown>[]).map((el) => ({ ...el }));

  for (const step of steps) {
    for (const toolResult of step.toolResults ?? []) {
      if (toolResult.toolName === "generateDiagram") {
        const output = toolResult.output as { elements?: unknown[] };
        if (Array.isArray(output?.elements)) {
          canvas = output.elements.map((el) => ({ ...(el as object) }));
        }
      } else if (toolResult.toolName === "modifyDiagram") {
        const output = toolResult.output as {
          elementId?: unknown;
          updates?: Record<string, unknown>;
        };
        if (typeof output?.elementId === "string" && output.updates) {
          const target = canvas.find((el) => el.id === output.elementId);
          if (target) Object.assign(target, output.updates);
        }
      }
    }
  }

  return canvas;
}
```

This is the same logic the client does when applying tool results to the live canvas, just in a single function on the eval side. The eval is now scoring **the post application canvas state**, not just the raw tool outputs.

This is a recurring theme in eval work: the scorer is only as good as the data you hand it. When you find a metric at 0 percent that should be moving, suspect the scorer/extraction before you suspect the model.

## What is next

Lesson 7 — **advanced tool use**. The single giant `generateDiagram` tool is too coarse. We'll break it into smaller, focused tools (`addElement`, `updateElement`, `removeElement`, `alignElements`, `queryCanvas`). Each tool does one thing well. The agent makes more, smaller calls. Structure scores climb because the model isn't doing all its layout math in a single JSON blob anymore.

We'll also introduce a real **client side tool** — `queryCanvas` — that doesn't pay the token cost of serializing the whole canvas every turn. Instead the agent calls it when it actually needs to know about the canvas, and the browser executes the query against the live Excalidraw state.

Image upload (multimodal context) is still on the docket for a future lesson. The pattern there is the same as canvas state: choose where the context comes from, choose the right shape, put it in the prompt at the right time.
