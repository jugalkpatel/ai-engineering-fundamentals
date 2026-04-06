// Shared agent logic. Both the worker (streaming chat) and the eval harness
// (batch generateText) call into this file. Keeping the system prompt, tool
// wiring, step limit, and element extraction in one place means the eval and
// production agent cannot drift apart.

import {
  generateText,
  streamText,
  stepCountIs,
  tool,
  type LanguageModel,
  type ModelMessage,
} from "ai";
import { z } from "zod";
import { buildTools } from "./tools";
import { serializeCanvasState } from "./context/canvas-state";

export const SYSTEM_PROMPT = `# Role

You are a diagram design assistant that controls an Excalidraw canvas. Your job is to translate the user's requests into precise tool calls that draw or modify shapes on the canvas. You are not a chat bot. You are a tool using agent that produces diagrams.

# Tools

You have these tools:

- **queryCanvas()** — read the current contents of the canvas. ALWAYS call this first if the conversation might involve modifying or extending an existing diagram. Returns a summary of every element with id, type, position, and label. Cheap, do it whenever you're unsure what's there.
- **addElements(elements)** — add new elements to the canvas. Use for creating diagrams or appending to existing ones.
- **updateElements(updates)** — change properties of existing elements by id. Use for recoloring, repositioning, relabeling, resizing.
- **removeElements(ids)** — delete elements by id.
- **searchWeb(query)** — search the web for current information. Use this when the user asks about recent technology, frameworks, or systems where you may not have up to date knowledge. Search first, then draw.
- **searchKnowledge(query)** — search the private knowledge base for reference material on systems, processes, or topics the user is asking you to draw. Use this BEFORE drawing when the request touches a specific technical system, protocol, organizational structure, or process where precise details matter. The knowledge base contains short reference docs you can read to make the diagram more accurate than what you'd produce from memory alone.

# Output constraints

Every element you create must include: \`id\`, \`type\`, \`x\`, \`y\`, \`width\`, \`height\`. Pick concise ids that hint at meaning (\`rect_login\`, \`arrow_login_db\`, not \`element_42\`). Position elements with at least 20px of breathing room. Default to strokeColor \`#1e1e1e\`, backgroundColor \`transparent\`, roughness \`1\`. Use rectangles for boxes/containers, ellipses for circles or nodes, diamonds for decision points, arrows for directed connections, lines for undirected connections, text for standalone labels.

Layout flows left to right for processes and top to bottom for hierarchies. Group related elements visually.

# Behavioral guidelines

- **Query before you modify.** If the user says "make the login box red," call \`queryCanvas\` first to find the login box's id, then \`updateElements\` to change its color. Never invent ids.
- **Prefer updateElements for tweaks.** Don't redraw the whole diagram when one element changes.
- **Preserve what exists.** When adding to a non empty canvas, do not delete or restyle elements the user did not mention.
- **Search the web for fresh facts.** If the user asks about a system you might not know well (a specific framework's request lifecycle, a service's architecture), call \`searchWeb\` before drawing.
- **Ask one clarifying question only if the request is genuinely ambiguous.** "Draw something" is ambiguous. "Draw a flowchart for user signup" is not — make reasonable choices and draw it.

# Examples

**Example 1 — empty canvas, simple create**

User: "draw a circle and a square next to each other"

Call \`addElements\` with two elements: an ellipse at \`(100, 100)\` 120x120 and a rectangle at \`(260, 100)\` 120x120. Reply: "Done — circle on the left, square on the right."

**Example 2 — modify on existing canvas**

User: "make the login box red."

Call \`queryCanvas({})\` first. Find the rectangle whose label is "Login" (say its id is \`rect_login\`). Then call \`updateElements({ updates: [{ id: "rect_login", fields: { backgroundColor: "#fa5252", ...nulls } }] })\`. Reply: "Done — login box is now red."

**Example 3 — additive on existing canvas**

User: "add a Cache box between the API and the Database and route the API through the cache."

Call \`queryCanvas({})\`, locate \`rect_api\` and \`rect_db\`, then call \`addElements\` with one new rectangle \`rect_cache\` and two arrows. Do not redraw \`rect_api\` or \`rect_db\` — they already exist.`;

interface AgentArgs {
  model: LanguageModel;
  messages: ModelMessage[];
  // Eval-only: the simulated initial canvas. The worker doesn't pass this —
  // in production the live browser canvas is the source of truth, fetched on
  // demand via the queryCanvas client tool. The eval has no browser, so it
  // simulates one by seeding from this value and answering queryCanvas calls
  // inline against the simulated state.
  seedCanvas?: unknown[];
  system?: string;
  maxSteps?: number;
  env?: {
    TAVILY_API_KEY?: string;
    UPSTASH_VECTOR_REST_URL?: string;
    UPSTASH_VECTOR_REST_TOKEN?: string;
  };
}

// Streaming variant. Used by the worker for the live chat experience.
export function streamAgent({
  model,
  messages,
  system = SYSTEM_PROMPT,
  maxSteps = 8,
  env = {},
}: AgentArgs) {
  return streamText({
    model,
    system,
    messages,
    tools: buildTools(env),
    stopWhen: stepCountIs(maxSteps),
  });
}

// Non-streaming variant. Used by the eval harness so we can collect the full
// result and pull out elements for scoring. The eval needs queryCanvas to
// return SOMETHING (otherwise the agent loop hangs), so we override it here
// with an inline executor that reads from a mutable simulated canvas.
export async function runAgent({
  model,
  messages,
  seedCanvas = [],
  system = SYSTEM_PROMPT,
  maxSteps = 8,
  env = {},
}: AgentArgs) {
  // Mutable simulated canvas for the duration of this run. The eval has no
  // browser, so we maintain this in memory and let the agent's tool calls
  // mutate it. queryCanvas reads from it; addElements/updateElements/
  // removeElements write to it.
  const sim: Record<string, unknown>[] = (seedCanvas as Record<string, unknown>[]).map((el) => ({ ...el }));

  // Build eval-only versions of every tool that needs to touch `sim`. We
  // can't reuse the worker tool definitions because (a) queryCanvas has no
  // execute on the worker (it's client-side) and (b) the worker mutators
  // are passthroughs that don't actually update any canvas. Here, every
  // tool both returns the canonical shape AND mirrors the change into sim.
  const baseTools = buildTools(env);
  const evalTools = {
    addElements: tool({
      description: baseTools.addElements.description,
      inputSchema: baseTools.addElements.inputSchema as never,
      execute: async ({ elements }: { elements: unknown[] }) => {
        for (const el of elements) sim.push({ ...(el as object) });
        return { elements };
      },
    }),
    updateElements: tool({
      description: baseTools.updateElements.description,
      inputSchema: baseTools.updateElements.inputSchema as never,
      execute: async ({ updates }: { updates: { id: string; fields: Record<string, unknown> }[] }) => {
        const cleaned = updates.map(({ id, fields }) => {
          const filtered: Record<string, unknown> = {};
          for (const [key, value] of Object.entries(fields)) {
            if (value !== null) filtered[key] = value;
          }
          return { id, fields: filtered };
        });
        for (const { id, fields } of cleaned) {
          const target = sim.find((el) => el.id === id);
          if (target) Object.assign(target, fields);
        }
        return { updates: cleaned };
      },
    }),
    removeElements: tool({
      description: baseTools.removeElements.description,
      inputSchema: baseTools.removeElements.inputSchema as never,
      execute: async ({ ids }: { ids: string[] }) => {
        for (const id of ids) {
          const idx = sim.findIndex((el) => el.id === id);
          if (idx >= 0) sim.splice(idx, 1);
        }
        return { ids };
      },
    }),
    queryCanvas: tool({
      description: baseTools.queryCanvas.description,
      inputSchema: z.object({}),
      execute: async () => ({ summary: serializeCanvasState(sim) }),
    }),
    searchWeb: baseTools.searchWeb,
    searchKnowledge: baseTools.searchKnowledge,
  };

  const result = await generateText({
    model,
    system,
    messages,
    tools: evalTools,
    stopWhen: stepCountIs(maxSteps),
  });

  return {
    text: result.text,
    elements: sim,
    steps: result.steps,
  };
}
