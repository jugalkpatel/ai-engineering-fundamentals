// BoundArrows scorer: for every arrow in the output, check that BOTH
// startBinding.elementId and endBinding.elementId reference an element id
// that actually exists in the output. Catches the "arrows flying off into
// space" failure mode where the model creates arrows with raw points or
// references ids that don't exist.
//
// Output based, no golden dataset changes. Score is the ratio of properly
// bound arrows to total arrows. Skips cases with no arrows.

import type { EvalScorer } from "braintrust";
import type { AgentOutput } from "./schema";
import type { GoldenTestCase } from "../buildMessages";

export const boundArrowsScorer: EvalScorer<GoldenTestCase, AgentOutput, GoldenTestCase> = ({
  output,
}) => {
  const elements = (output.elements ?? []) as Record<string, unknown>[];
  const ids = new Set(
    elements.map((el) => (typeof el?.id === "string" ? el.id : null)).filter(Boolean) as string[]
  );

  const arrows = elements.filter((el) => el?.type === "arrow");
  if (arrows.length === 0) return null;

  let bound = 0;
  const broken: string[] = [];
  for (const arrow of arrows) {
    const start = arrow.startBinding as { elementId?: string } | null | undefined;
    const end = arrow.endBinding as { elementId?: string } | null | undefined;
    const ok = !!(start?.elementId && end?.elementId && ids.has(start.elementId) && ids.has(end.elementId));
    if (ok) bound += 1;
    else broken.push(typeof arrow.id === "string" ? arrow.id : "(no id)");
  }

  return {
    name: "BoundArrows",
    score: bound / arrows.length,
    metadata: { bound, total: arrows.length, broken },
  };
};
