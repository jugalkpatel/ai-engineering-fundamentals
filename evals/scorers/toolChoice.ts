// ToolChoice scorer: did the agent reach for the right tool given the test
// case category? This replaces the old Preservation scorer, which was tied
// to the lesson 2 modifyDiagram tool surface and stopped meaning much once
// extractElements simulated the canvas headlessly.
//
// Rules, by category:
//   create: addElements must have been called at least once
//   modify: queryCanvas must come BEFORE any updateElements/removeElements,
//           and at least one of those mutators must have been called
//   domain: addElements must have been called (web search optional)
//   edge:   no rule, returns null and Braintrust skips it
//
// All checks run against output.toolCalls (the flat list of tool names in
// order, exposed by runAgent). No golden dataset changes required.

import type { EvalScorer } from "braintrust";
import type { AgentOutput } from "./schema";
import type { GoldenTestCase } from "../buildMessages";

export const toolChoiceScorer: EvalScorer<GoldenTestCase, AgentOutput, GoldenTestCase> = ({
  output,
  expected,
}) => {
  const calls = output.toolCalls ?? [];
  const category = expected?.category;

  if (category === "create" || category === "domain") {
    const ok = calls.includes("addElements");
    return {
      name: "ToolChoice",
      score: ok ? 1 : 0,
      metadata: { category, calls, reason: ok ? "addElements called" : "addElements not called" },
    };
  }

  if (category === "modify") {
    const queryAt = calls.indexOf("queryCanvas");
    const firstMutator = calls.findIndex(
      (name) => name === "updateElements" || name === "removeElements"
    );
    if (firstMutator < 0) {
      return {
        name: "ToolChoice",
        score: 0,
        metadata: { category, calls, reason: "no updateElements or removeElements call" },
      };
    }
    if (queryAt < 0 || queryAt > firstMutator) {
      return {
        name: "ToolChoice",
        score: 0.5,
        metadata: { category, calls, reason: "mutated without querying canvas first" },
      };
    }
    return {
      name: "ToolChoice",
      score: 1,
      metadata: { category, calls, reason: "queried then mutated" },
    };
  }

  return null;
};
