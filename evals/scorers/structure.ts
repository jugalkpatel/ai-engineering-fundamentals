// Structure scorer: checks how well the produced elements match the test case's
// expected characteristics. Looks for "N type" patterns in the expected strings
// (e.g. "3 rectangle elements", "2 arrow elements") and scores by how close the
// actual element counts are.
//
// Code based, no LLM involved. Returns a 0-1 fractional score.

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
