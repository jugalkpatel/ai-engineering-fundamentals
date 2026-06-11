import { useState, useCallback, useRef, useEffect } from "react";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import Canvas from "./components/Canvas";
import ChatPanel from "./components/chat/ChatPanel";
import "./App.css";
import { useAgent } from "agents/react";
// import { useAgentChat } from "agents/ai-react";
import { useAgentChat } from "@cloudflare/ai-chat/react";
import {
  CaptureUpdateAction,
  convertToExcalidrawElements,
  newElementWith,
} from "@excalidraw/excalidraw";

const sessionId = crypto.randomUUID();

export default function App() {
  const [excalidrawAPI, setExcalidrawAPI] =
    useState<ExcalidrawImperativeAPI | null>(null);
  const [theme, setTheme] = useState<"light" | "dark">("light");

  // track which tool calls we've already applied to the canvas so we
  // don't apply the same elements twice as messages re-render
  const appliedToolCalls = useRef<Set<string>>(new Set());

  const handleApiReady = useCallback((api: ExcalidrawImperativeAPI) => {
    setExcalidrawAPI(api);
  }, []);

  // connect fresh agent instance for this page load
  const agent = useAgent({ agent: "design-agent", name: sessionId });

  // useAgentChat manages the chat protocol on top of agent connection.
  const { messages, sendMessage, status } = useAgentChat({ agent });

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
            // the agent returns simplified elements shapes.
            // Excalidraw needs full element data(seen, versionNonce etc.)
            // which this helper fills in from a skeleton. Pass `regenerateIds: false` so the
            // ids the agent picked survive - otherwise the canvas ends up with
            // random uuids and later modifyDiagram call (which uses)
            // the agent's chose ids) silently misses every element.
            const elements = convertToExcalidrawElements(
              skeletonElements as any,
              { regenerateIds: false },
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
            // use Excalidraw's `newElementWith` helper to merge updates into
            // the matching element. It bumps version + versionNonce + the
            // updated timestamp the way the reconciler expects.
            // CaptureUpdateAction.IMMEDIATELY forces the change into the
            // scene store right away instead of deferring to a future tick.
            const current = excalidrawAPI.getSceneElements();
            const next = current.map((el) => {
              return el.id === output.elementId
                ? newElementWith(el, output.updates as never)
                : el;
            });
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
    </div>
  );
}
