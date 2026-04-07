// BoundArrows scorer
// ===================
//
// What it measures:
//   For every arrow in the agent's output, are BOTH endpoints bound to an
//   element id that actually exists in the canvas? Score is the ratio of
//   properly bound arrows to total arrows.
//
// The failure mode it catches:
//   Before lesson 7, the agent constantly produced arrows with no bindings,
//   or with bindings that pointed at ids it had hallucinated. Visually those
//   arrows render as floating lines next to the diagram, completely detached
//   from the boxes they're supposed to connect. Schema didn't catch it (the
//   arrow had all required fields). Structure didn't catch it (the count was
//   right). LabelKeywords didn't catch it (the words were elsewhere). The
//   diagram looked broken to a human and passed every existing scorer.
//
// Why it lives in lesson 7 and not lesson 6:
//   The lesson 6 system prompt tells the model to bind both ends of every
//   connecting arrow, but the schema doesn't enforce it. Without the lesson 7
//   schema description work (the field that says "REQUIRED for arrows that
//   connect two shapes... if the id is wrong or missing, the arrow floats
//   free in space, which is always a bug"), the model still gets it wrong
//   often enough that the metric isn't actionable. We add the scorer in the
//   same lesson as the fix, so the eval shows a clean before/after.
//
// What kind of scorer this is:
//   Output based. It runs against the final canvas the eval simulator
//   produced (post-application of every tool call), not against the agent's
//   tool call history. That makes it surface-agnostic: it survives any tool
//   refactor as long as the canvas still uses arrow elements with bindings.
//
// Skips when:
//   - There are no arrows in the output (returns null, Braintrust ignores
//     the case for this scorer). A canvas with no arrows isn't a failure of
//     this scorer; it just isn't relevant.

import type { EvalScorer } from "braintrust";
import type { AgentOutput } from "./schema";
import type { GoldenTestCase } from "../buildMessages";

export const boundArrowsScorer: EvalScorer<GoldenTestCase, AgentOutput, GoldenTestCase> = ({
  output,
}) => {
  const elements = (output.elements ?? []) as Record<string, unknown>[];

  // Build a set of every id present in the output. We check binding targets
  // against this set: if an arrow points at an id we've never seen, the
  // binding is broken.
  const ids = new Set(
    elements.map((el) => (typeof el?.id === "string" ? el.id : null)).filter(Boolean) as string[]
  );

  const arrows = elements.filter((el) => el?.type === "arrow");
  if (arrows.length === 0) return null;

  let bound = 0;
  const broken: string[] = [];
  for (const arrow of arrows) {
    // Both endpoints must be present AND must reference an id we know about.
    // Either condition failing counts as a broken arrow.
    const start = arrow.startBinding as { elementId?: string } | null | undefined;
    const end = arrow.endBinding as { elementId?: string } | null | undefined;
    const ok = !!(
      start?.elementId &&
      end?.elementId &&
      ids.has(start.elementId) &&
      ids.has(end.elementId)
    );
    if (ok) bound += 1;
    else broken.push(typeof arrow.id === "string" ? arrow.id : "(no id)");
  }

  return {
    name: "BoundArrows",
    score: bound / arrows.length,
    // metadata is what shows up in the Braintrust dashboard when you click
    // a row. The list of broken arrow ids makes it easy to spot a pattern.
    metadata: { bound, total: arrows.length, broken },
  };
};
