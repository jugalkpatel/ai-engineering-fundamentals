// One-shot dataset migration for lesson 8.
//
// Two changes:
//   1. Normalize the existing modify case seeds to runtime element shape.
//      The current seeds use { type: "rectangle", text: "Login" } which is
//      the broken vocabulary that doesn't render. The simulator pushes the
//      seed straight into sim and the BoundLabels scorer reads sim, so the
//      seed shapes count against the score forever. Fix: rewrite each seed
//      in runtime form (shape with boundElements, child text element with
//      containerId).
//   2. Append new test cases that stress layout: long labels, many shapes,
//      sequence diagrams, ER diagrams, state machines, plus an explicit
//      tight-grid case that should NOT trigger the noOverlaps scorer
//      (validates the 4px epsilon carve out).
//
// Run with: node scripts/update-golden.mjs

import { readFileSync, writeFileSync } from "node:fs";

const path = "evals/datasets/golden.json";
const data = JSON.parse(readFileSync(path, "utf-8"));

// Helper: convert a "old style" rect ({type, x, y, width, height, text})
// into a pair: rect with boundElements + child text element with
// containerId. Mirrors what convertToExcalidrawElements would produce.
function labeledRect(rect) {
  const childId = `${rect.id}_label`;
  const shape = { ...rect };
  delete shape.text;
  shape.boundElements = [{ id: childId, type: "text" }];
  const child = {
    id: childId,
    type: "text",
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
    text: rect.text,
    containerId: rect.id,
  };
  return [shape, child];
}

// Helper: convert a "naked arrow" (no bindings) into a runtime arrow that
// binds both ends. Caller supplies the start/end shape ids.
function boundArrow(arrow, startId, endId) {
  return {
    ...arrow,
    startBinding: { elementId: startId, focus: 0, gap: 8 },
    endBinding: { elementId: endId, focus: 0, gap: 8 },
  };
}

// Normalize modify case seeds.
const updates = {
  "modify-01": {
    elements: [
      ...labeledRect({ id: "rect_login", type: "rectangle", x: 100, y: 100, width: 200, height: 80, text: "login" }),
      ...labeledRect({ id: "rect_db", type: "rectangle", x: 500, y: 100, width: 200, height: 80, text: "database" }),
    ],
  },
  "modify-02": {
    elements: [
      ...labeledRect({ id: "rect_login", type: "rectangle", x: 100, y: 100, width: 200, height: 80, text: "login" }),
      ...labeledRect({ id: "rect_db", type: "rectangle", x: 500, y: 100, width: 200, height: 80, text: "database" }),
    ],
  },
  "modify-03": {
    elements: [
      ...labeledRect({ id: "rect_start", type: "rectangle", x: 100, y: 100, width: 160, height: 60, text: "Start" }),
      ...labeledRect({ id: "rect_process", type: "rectangle", x: 320, y: 100, width: 160, height: 60, text: "Process" }),
      ...labeledRect({ id: "rect_end", type: "rectangle", x: 540, y: 100, width: 160, height: 60, text: "End" }),
      boundArrow({ id: "arrow_1", type: "arrow", x: 260, y: 130, width: 60, height: 0 }, "rect_start", "rect_process"),
      boundArrow({ id: "arrow_2", type: "arrow", x: 480, y: 130, width: 60, height: 0 }, "rect_process", "rect_end"),
    ],
  },
  "modify-04": {
    elements: [
      ...labeledRect({ id: "rect_api", type: "rectangle", x: 100, y: 100, width: 160, height: 60, text: "API" }),
      ...labeledRect({ id: "rect_db", type: "rectangle", x: 500, y: 100, width: 160, height: 60, text: "Database" }),
      boundArrow({ id: "arrow_api_db", type: "arrow", x: 260, y: 130, width: 240, height: 0 }, "rect_api", "rect_db"),
    ],
  },
};

for (const tc of data) {
  const u = updates[tc.id];
  if (u && tc.seed) tc.seed.elements = u.elements;
}

// New test cases. These exercise layout stress points the existing dataset
// doesn't cover: many shapes, long labels, sequence diagrams, state
// machines, ER diagrams, plus a flush grid that should NOT trip noOverlaps.
const newCases = [
  {
    id: "create-architecture-jwt",
    input: "Draw a JWT auth flow with User, Auth Server, Resource API, Database, and Token Storage",
    expectedCharacteristics: [
      "5 labeled boxes",
      "Arrows showing the flow from User through Auth Server to Resource API and Database",
      "Token Storage connected to Auth Server",
    ],
    expectedKeywords: ["user", "auth server", "resource api", "database", "token storage"],
    difficulty: "medium",
    category: "create",
  },
  {
    id: "create-sequence-oauth",
    input: "Draw an OAuth sequence diagram with these actors: User, Browser, Auth Provider, App Server, Resource Server",
    expectedCharacteristics: [
      "5 labeled actor rectangles across the top",
      "Vertical lifelines below each actor",
      "Numbered messages between adjacent lifelines",
    ],
    expectedKeywords: ["user", "browser", "auth provider", "app server", "resource server"],
    difficulty: "hard",
    category: "create",
  },
  {
    id: "create-flowchart-deploy",
    input: "Draw a deployment flowchart with these steps: build, test, lint, package, deploy, smoke test, with a rollback path on failure",
    expectedCharacteristics: [
      "Rectangles for each step",
      "At least one diamond decision",
      "Arrows top to bottom",
      "Rollback branch",
    ],
    expectedKeywords: ["build", "test", "lint", "package", "deploy", "smoke", "rollback"],
    difficulty: "hard",
    category: "create",
  },
  {
    id: "create-erd-blog",
    input: "Draw an entity relationship diagram for a blog with these entities: User, Post, Comment, Tag, Category",
    expectedCharacteristics: [
      "5 labeled entity rectangles",
      "Lines connecting related entities",
      "Spread out enough to be readable",
    ],
    expectedKeywords: ["user", "post", "comment", "tag", "category"],
    difficulty: "medium",
    category: "create",
  },
  {
    id: "create-state-machine-order",
    input: "Draw a state machine for an order with these states: pending, paid, shipped, delivered, cancelled, refunded",
    expectedCharacteristics: [
      "6 labeled ellipses",
      "Arrows labeled with the transition trigger",
      "Cancelled and refunded reachable from earlier states",
    ],
    expectedKeywords: ["pending", "paid", "shipped", "delivered", "cancelled", "refunded"],
    difficulty: "hard",
    category: "create",
  },
  {
    id: "create-long-labels",
    input: "Draw an architecture diagram with these services: Authentication Service, Notification Service, Payment Processor, Database Cluster",
    expectedCharacteristics: [
      "4 labeled rectangles",
      "Each box wide enough to fit its full label without clipping",
      "No overlapping shapes",
    ],
    expectedKeywords: ["authentication", "notification", "payment", "database"],
    difficulty: "medium",
    category: "create",
  },
  {
    id: "create-three-word-labels",
    input: "Draw a system diagram with these components: Real Time Analytics, Customer Data Platform, Event Stream Processor",
    expectedCharacteristics: [
      "3 labeled rectangles",
      "Each box wide enough for its three-word label",
      "Connected with arrows showing data flow",
    ],
    expectedKeywords: ["real time", "customer data", "event stream"],
    difficulty: "medium",
    category: "create",
  },
  {
    id: "create-tight-grid",
    input: "Draw a 2x2 grid of labeled boxes: top-left A, top-right B, bottom-left C, bottom-right D, sharing edges",
    expectedCharacteristics: [
      "4 labeled rectangles",
      "Arranged as a 2x2 grid",
      "Boxes share edges (intentional flush layout)",
    ],
    expectedKeywords: ["a", "b", "c", "d"],
    difficulty: "simple",
    category: "create",
  },
];

// Append new cases.
for (const tc of newCases) data.push(tc);

writeFileSync(path, JSON.stringify(data, null, 2) + "\n");
console.log(`updated ${path}: ${data.length} total cases (${newCases.length} new)`);
