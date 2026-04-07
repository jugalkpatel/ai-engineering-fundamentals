// Connectivity scorer
// ===================
//
// What it measures:
//   For prompts that imply connected structure (the user says "flow",
//   "sequence", "between", "from X to Y", etc.), build a graph from the
//   bound arrows in the output and count what fraction of shapes are
//   reachable from the first one. Score is `reachable / total`.
//
// The failure mode it catches:
//   The agent draws five labeled boxes and then connects only two of them.
//   The other three sit on the canvas like orphans. From the user's
//   perspective the diagram is broken: they asked for a flow, they got
//   floating shapes. From the existing scorers' perspective everything is
//   fine: the elements exist, the labels match the prompt, the schema is
//   valid. This scorer is the one that says "no, those orphans are bad."
//
// Why it only fires for connected-sounding prompts:
//   Not every diagram is a graph. An ER diagram with a few entities and
//   no relationships is legitimately disconnected. Same for a state machine
//   with isolated states, or a freeform "draw me three icons" request.
//   Punishing those would be a false negative. The keyword filter (CONNECTED_HINTS)
//   is a coarse heuristic, not a guarantee, but it's good enough to keep
//   the scorer honest. If the prompt has a connectivity word in it, the
//   user expects connectivity.
//
// Why we measure reachability instead of "is the graph fully connected":
//   Reachability gives a continuous score (3/5 = 0.6) instead of a binary
//   (connected or not). Continuous scores show progress in the eval over
//   time as the model gets closer to the right answer. Binary scores are
//   noisier and give less signal.
//
// What kind of scorer this is:
//   Output based. Same as BoundArrows, it runs against the final canvas
//   regardless of how the agent built it.
//
// Skips when:
//   - The prompt has no connectivity hint
//   - There are fewer than 2 shapes (a single shape is trivially "connected")

import type { EvalScorer } from "braintrust";
import type { AgentOutput } from "./schema";
import type { GoldenTestCase } from "../buildMessages";

// Words that strongly imply the user wants a connected graph. We look for
// these in the prompt before deciding the scorer applies. If you find a
// failure case where the scorer should fire but doesn't, add the keyword
// here.
const CONNECTED_HINTS = ["flow", "sequence", "between", "from", "to ", "pipeline", "chain", "process"];

const SHAPE_TYPES = new Set(["rectangle", "ellipse", "diamond"]);

export const connectivityScorer: EvalScorer<GoldenTestCase, AgentOutput, GoldenTestCase> = ({
  output,
  input,
}) => {
  const prompt = (input?.input ?? "").toLowerCase();
  if (!CONNECTED_HINTS.some((h) => prompt.includes(h))) return null;

  const elements = (output.elements ?? []) as Record<string, unknown>[];
  const shapes = elements.filter(
    (el) => typeof el?.type === "string" && SHAPE_TYPES.has(el.type as string)
  );
  if (shapes.length < 2) return null;

  // Build an undirected adjacency map keyed by shape id. Arrows contribute
  // an edge in both directions (we don't care about arrow direction for
  // reachability, just whether the shapes are connected at all).
  const adj = new Map<string, Set<string>>();
  for (const shape of shapes) {
    if (typeof shape.id === "string") adj.set(shape.id, new Set());
  }

  for (const el of elements) {
    if (el?.type !== "arrow") continue;
    const start = (el.startBinding as { elementId?: string } | null | undefined)?.elementId;
    const end = (el.endBinding as { elementId?: string } | null | undefined)?.elementId;
    // Only count arrows whose BOTH endpoints land on shapes we know about.
    // Floating arrows don't contribute to connectivity (they can't, there's
    // nothing to connect to).
    if (!start || !end) continue;
    if (adj.has(start) && adj.has(end)) {
      adj.get(start)!.add(end);
      adj.get(end)!.add(start);
    }
  }

  // BFS from the first shape. Count how many distinct shapes we can reach.
  // Anything we don't visit is in a separate component (a disconnected
  // island), which lowers the score.
  const start = shapes[0]!.id as string;
  const seen = new Set<string>([start]);
  const queue = [start];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const next of adj.get(cur) ?? []) {
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }

  return {
    name: "Connectivity",
    score: seen.size / shapes.length,
    metadata: { reachable: seen.size, total: shapes.length },
  };
};
