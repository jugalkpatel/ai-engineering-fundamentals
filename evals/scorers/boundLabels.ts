// BoundLabels scorer
// ===================
//
// What it measures:
//   For every container shape (rectangle, ellipse, diamond) in the output,
//   does at least one text element have its `containerId` set to that
//   shape's id? Score is the ratio of labeled shapes to total shapes.
//
// The failure mode it catches:
//   The model creates a rectangle and sets `text: "Login"` on the rectangle
//   itself, expecting that to render as a label inside the box. It doesn't.
//   Excalidraw ignores `text` on shapes. To label a shape you have to create
//   a SEPARATE text element with `containerId` pointing back to the shape.
//   The lesson 6 system prompt told the model this in prose. Lesson 7 makes
//   it real by adding `containerId` to the schema and writing the field
//   description that explains when to use it.
//
// Why this scorer is the most visceral demo of the lesson:
//   The diagrams in the lesson 5/6 baseline have boxes with no visible
//   labels. They look like empty rectangles next to floating text. After
//   the lesson 7 schema work, the boxes are labeled. The eval number
//   matches what students see on the canvas: bound labels means readable
//   diagrams.
//
// Why it lives in lesson 7 and not lesson 6:
//   Lesson 6 doesn't have `containerId` in the schema. Without the field,
//   the model can't actually do the right thing even if it wanted to. The
//   scorer would always read 0 and never move. We add the scorer in the
//   same lesson as the schema field, so the metric goes from "broken" to
//   "fixed" in one shot.
//
// What kind of scorer this is:
//   Output based. Runs against the final canvas. Doesn't care about how
//   the agent built it. Survives any tool refactor that keeps the
//   container/contained text relationship.
//
// Skips when:
//   - There are no container shapes in the output (a pure text or arrow
//     canvas isn't a label-binding scenario).

import type { EvalScorer } from "braintrust";
import type { AgentOutput } from "./schema";
import type { GoldenTestCase } from "../buildMessages";

const SHAPE_TYPES = new Set(["rectangle", "ellipse", "diamond"]);

export const boundLabelsScorer: EvalScorer<GoldenTestCase, AgentOutput, GoldenTestCase> = ({
  output,
}) => {
  const elements = (output.elements ?? []) as Record<string, unknown>[];
  const shapes = elements.filter(
    (el) => typeof el?.type === "string" && SHAPE_TYPES.has(el.type as string)
  );
  if (shapes.length === 0) return null;

  // First pass: collect every shape id that has at least one text element
  // pointing at it via containerId. Containment is what makes a label
  // "bound" (and what makes Excalidraw center it inside the shape).
  const boundLabelShapeIds = new Set<string>();
  for (const el of elements) {
    if (el?.type !== "text") continue;
    const containerId = el.containerId;
    if (typeof containerId === "string" && containerId.length > 0) {
      boundLabelShapeIds.add(containerId);
    }
  }

  // Second pass: walk every shape and check whether it appears in the set
  // we just built. The unlabeled list goes into metadata so the dashboard
  // can show which shapes the model forgot to label.
  let labeled = 0;
  const unlabeled: string[] = [];
  for (const shape of shapes) {
    const id = typeof shape.id === "string" ? shape.id : null;
    if (id && boundLabelShapeIds.has(id)) labeled += 1;
    else unlabeled.push(id ?? "(no id)");
  }

  return {
    name: "BoundLabels",
    score: labeled / shapes.length,
    metadata: { labeled, total: shapes.length, unlabeled },
  };
};
