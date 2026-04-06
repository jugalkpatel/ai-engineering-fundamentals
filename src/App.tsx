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
import "./App.css";

// One agent instance per page load. The canvas state lives only in the
// browser, so persisting chat history across refreshes would leave a dead
// conversation referencing diagrams that no longer exist. Generated at the
// module level so React StrictMode's double mount doesn't change it.
const sessionId = crypto.randomUUID();

export default function App() {
  const [excalidrawAPI, setExcalidrawAPI] =
    useState<ExcalidrawImperativeAPI | null>(null);
  const [theme, setTheme] = useState<"light" | "dark">("light");

  // Track which tool calls we have already applied to the canvas so we
  // don't apply the same elements twice as messages re-render.
  const appliedToolCalls = useRef<Set<string>>(new Set());

  const handleApiReady = useCallback((api: ExcalidrawImperativeAPI) => {
    setExcalidrawAPI(api);
  }, []);

  // Connect to a fresh agent instance for this page load
  const agent = useAgent({ agent: "design-agent", name: sessionId });

  // useAgentChat manages the chat protocol on top of the agent connection.
  // It gives us the messages array, a sendMessage function, and a status.
  const { messages, sendMessage, status } = useAgentChat({ agent });

  // Watch messages for tool outputs and apply them to the canvas. We handle
  // both tools the agent has: generateDiagram (replace canvas) and
  // modifyDiagram (patch a single existing element by id).
  useEffect(() => {
    if (!excalidrawAPI) return;

    for (const message of messages) {
      if (message.role !== "assistant") continue;
      for (const part of message.parts ?? []) {
        if (
          part.type !== "tool-generateDiagram" &&
          part.type !== "tool-modifyDiagram"
        ) {
          continue;
        }
        if (part.state !== "output-available") continue;
        if (appliedToolCalls.current.has(part.toolCallId)) continue;

        if (part.type === "tool-generateDiagram") {
          appliedToolCalls.current.add(part.toolCallId);
          const output = part.output as { elements?: unknown };
          const skeletonElements = output?.elements;
          if (Array.isArray(skeletonElements) && skeletonElements.length > 0) {
            // The agent returns simplified element shapes. Excalidraw needs
            // full element data (seed, versionNonce, etc.) which this helper
            // fills in from a skeleton. Pass `regenerateIds: false` so the
            // ids the agent picked survive — otherwise the canvas ends up
            // with random uuids and any later modifyDiagram call (which uses
            // the agent's chosen ids) silently misses every element.
            const elements = convertToExcalidrawElements(
              skeletonElements as any,
              { regenerateIds: false }
            );
            excalidrawAPI.updateScene({ elements });
            excalidrawAPI.scrollToContent(elements, { fitToContent: true });
          }
        } else if (part.type === "tool-modifyDiagram") {
          appliedToolCalls.current.add(part.toolCallId);
          const output = part.output as {
            elementId?: string;
            updates?: Record<string, unknown>;
          };
          if (output?.elementId && output.updates) {
            // Use Excalidraw's `newElementWith` helper to merge updates into
            // the matching element. It bumps version + versionNonce + the
            // updated timestamp the way the reconciler expects.
            // CaptureUpdateAction.IMMEDIATELY forces the change into the
            // scene store right away instead of deferring to a future tick.
            const current = excalidrawAPI.getSceneElements();
            const next = current.map((el) =>
              el.id === output.elementId
                ? newElementWith(el, output.updates as never)
                : el
            );
            excalidrawAPI.updateScene({
              elements: next,
              captureUpdate: CaptureUpdateAction.IMMEDIATELY,
            });
          }
        }
      }
    }
  }, [messages, excalidrawAPI]);

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
