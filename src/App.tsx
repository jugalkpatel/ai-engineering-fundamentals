import { useState, useCallback, useEffect, useRef } from "react";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import {
  convertToExcalidrawElements,
  CaptureUpdateAction,
  newElementWith,
} from "@excalidraw/excalidraw";
import { useAgent } from "agents/react";
import { useAgentChat } from "@cloudflare/ai-chat/react";
import Canvas from "./components/Canvas";
import ChatPanel from "./components/chat/ChatPanel";
import { serializeCanvasState } from "./context/canvas-state";
import { findOverlaps } from "./context/overlaps";
import "./App.css";

// One agent instance per page load. The canvas state lives only in the
// browser, so persisting chat history across refreshes would leave a dead
// conversation referencing diagrams that no longer exist.
const sessionId = crypto.randomUUID();

// Recursively drop null valued fields. Our tool schemas use nullable
// rather than optional so OpenAI strict mode stays on, which means the
// agent always sends every field. The Excalidraw skeleton helper expects
// undefined for "use the default," not null, and chokes on `label: null`
// or `start: null`. Recursion is required because nested objects (label,
// start, end) also carry nullable fields like fontSize and textAlign.
function stripNulls(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripNulls);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v !== null) out[k] = stripNulls(v);
    }
    return out;
  }
  return value;
}

export default function App() {
  const [excalidrawAPI, setExcalidrawAPI] =
    useState<ExcalidrawImperativeAPI | null>(null);
  const [theme, setTheme] = useState<"light" | "dark">("light");

  // Hold the latest excalidrawAPI in a ref so onToolCall (captured once at
  // hook init) always reads the live API instead of a stale closure copy.
  const excalidrawAPIRef = useRef<ExcalidrawImperativeAPI | null>(null);
  useEffect(() => {
    excalidrawAPIRef.current = excalidrawAPI;
  }, [excalidrawAPI]);

  const handleApiReady = useCallback((api: ExcalidrawImperativeAPI) => {
    setExcalidrawAPI(api);
  }, []);

  const agent = useAgent({ agent: "design-agent", name: sessionId });

  // All four canvas tools are client side. The worker streams the call here,
  // we apply it to the live Excalidraw scene, and submit the result via
  // addToolOutput so the agent loop resumes.
  const { messages, sendMessage, status } = useAgentChat({
    agent,
    onToolCall: async ({ toolCall, addToolOutput }) => {
      const api = excalidrawAPIRef.current;
      if (!api) {
        addToolOutput({ toolCallId: toolCall.toolCallId, output: { error: "canvas not ready" } });
        return;
      }

      if (toolCall.toolName === "queryCanvas") {
        addToolOutput({
          toolCallId: toolCall.toolCallId,
          output: { summary: serializeCanvasState(api.getSceneElements() as unknown[]) },
        });
        return;
      }

      if (toolCall.toolName === "addElements") {
        const { elements } = toolCall.input as { elements: unknown[] };
        // Strip null fields recursively before handing to
        // convertToExcalidrawElements. Our nullable schema forces the model
        // to send every field, but the skeleton helper expects undefined
        // (not null) for "use the default" and chokes on `label: null` or
        // `start: null`.
        const cleaned = elements.map(stripNulls) as Record<string, unknown>[];
        const newOnes = convertToExcalidrawElements(cleaned as never, { regenerateIds: false });

        // Cross call binding fix.
        // convertToExcalidrawElements only resolves arrow start/end ids
        // against elements in its OWN input batch. When the model splits a
        // diagram across multiple addElements calls (rectangles in call 1,
        // arrows in call 2), the helper drops the arrows' bindings and logs
        // "No element for start binding with id rect_X found." The runtime
        // arrow renders unbound and the diagram looks broken.
        //
        // The system prompt promises the model "in this call OR on the
        // canvas." To make that promise honest, we walk the skeleton input
        // and patch the runtime arrows ourselves: for each arrow whose
        // start/end id references an element already on the live scene,
        // restore the binding and update the target shape's boundElements
        // (Excalidraw uses bidirectional binding tracking).
        const existingScene = api.getSceneElements();
        const existingById = new Map(existingScene.map((el) => [el.id, el]));
        const newById = new Map(
          (newOnes as Array<{ id: string }>).map((el) => [el.id, el])
        );
        const incomingArrowsByTarget = new Map<string, string[]>();
        for (const skeleton of cleaned) {
          if (skeleton.type !== "arrow" && skeleton.type !== "line") continue;
          const arrow = newById.get(skeleton.id as string) as
            | Record<string, unknown>
            | undefined;
          if (!arrow) continue;
          const startId = (skeleton.start as { id?: string } | undefined)?.id;
          if (
            typeof startId === "string" &&
            existingById.has(startId) &&
            !arrow.startBinding
          ) {
            arrow.startBinding = { elementId: startId, focus: 0, gap: 8 };
            const list = incomingArrowsByTarget.get(startId) ?? [];
            list.push(skeleton.id as string);
            incomingArrowsByTarget.set(startId, list);
          }
          const endId = (skeleton.end as { id?: string } | undefined)?.id;
          if (
            typeof endId === "string" &&
            existingById.has(endId) &&
            !arrow.endBinding
          ) {
            arrow.endBinding = { elementId: endId, focus: 0, gap: 8 };
            const list = incomingArrowsByTarget.get(endId) ?? [];
            list.push(skeleton.id as string);
            incomingArrowsByTarget.set(endId, list);
          }
        }
        // Patch boundElements on existing target shapes so Excalidraw's
        // bidirectional binding tracking sees the new arrows.
        const patchedExisting = existingScene.map((el) => {
          const incoming = incomingArrowsByTarget.get(el.id);
          if (!incoming || incoming.length === 0) return el;
          const prev = ((el as unknown as { boundElements?: readonly { id: string; type: string }[] })
            .boundElements ?? []) as readonly { id: string; type: string }[];
          const merged: { id: string; type: string }[] = [
            ...prev,
            ...incoming
              .filter((id) => !prev.some((b) => b.id === id))
              .map((id) => ({ id, type: "arrow" })),
          ];
          return newElementWith(el, { boundElements: merged } as never);
        });

        const next = [...patchedExisting, ...newOnes];
        api.updateScene({ elements: next, captureUpdate: CaptureUpdateAction.IMMEDIATELY });
        api.scrollToContent(next, { fitToContent: true });
        // Detect overlaps in the post-add scene and surface them in the
        // tool result so the agent's next reasoning step sees collisions
        // and can self correct via updateElements. Same finding the
        // noOverlaps eval scorer would report.
        const overlaps = findOverlaps(next as unknown[]);
        addToolOutput({
          toolCallId: toolCall.toolCallId,
          output: { added: newOnes.length, overlaps },
        });
        return;
      }

      if (toolCall.toolName === "updateElements") {
        const { updates } = toolCall.input as {
          updates: { id: string; fields: Record<string, unknown> }[];
        };
        const byId = new Map(
          updates.map((u) => [u.id, stripNulls(u.fields) as Record<string, unknown>])
        );
        const next = api.getSceneElements().map((el) => {
          const fields = byId.get(el.id);
          return fields && Object.keys(fields).length > 0
            ? newElementWith(el, fields as never)
            : el;
        });
        api.updateScene({ elements: next, captureUpdate: CaptureUpdateAction.IMMEDIATELY });
        addToolOutput({ toolCallId: toolCall.toolCallId, output: { updated: byId.size } });
        return;
      }

      if (toolCall.toolName === "removeElements") {
        const { ids } = toolCall.input as { ids: string[] };
        const remove = new Set(ids);
        const next = api.getSceneElements().filter((el) => !remove.has(el.id));
        api.updateScene({ elements: next, captureUpdate: CaptureUpdateAction.IMMEDIATELY });
        addToolOutput({ toolCallId: toolCall.toolCallId, output: { removed: remove.size } });
        return;
      }
    },
  });

  return (
    <div className={`app ${theme}`}>
      <div className="canvas-container">
        <Canvas onApiReady={handleApiReady} onThemeChange={setTheme} />
      </div>
      <ChatPanel
        messages={messages}
        sendMessage={sendMessage}
        status={status}
      />
      <a href="#viewer" className="viewer-launch" title="Open diagram viewer for human scoring">
        viewer
      </a>
    </div>
  );
}
