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
import "./App.css";

// One agent instance per page load. The canvas state lives only in the
// browser, so persisting chat history across refreshes would leave a dead
// conversation referencing diagrams that no longer exist.
const sessionId = crypto.randomUUID();

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
  // we apply it to the live Excalidraw scene, and return a result the agent
  // sees on its next step.
  const { messages, sendMessage, status } = useAgentChat({
    agent,
    onToolCall: async ({ toolCall, addToolOutput }) => {
      const api = excalidrawAPIRef.current;
      if (!api) return;

      if (toolCall.toolName === "queryCanvas") {
        addToolOutput({
          toolCallId: toolCall.toolCallId,
          output: { summary: serializeCanvasState(api.getSceneElements() as unknown[]) },
        });
        return;
      }

      if (toolCall.toolName === "addElements") {
        const { elements } = toolCall.input as { elements: unknown[] };
        // regenerateIds: false so the agent's chosen ids survive, otherwise
        // later updateElements/removeElements calls miss.
        const newOnes = convertToExcalidrawElements(elements as never, { regenerateIds: false });
        const next = [...api.getSceneElements(), ...newOnes];
        api.updateScene({ elements: next, captureUpdate: CaptureUpdateAction.IMMEDIATELY });
        api.scrollToContent(next, { fitToContent: true });
        addToolOutput({ toolCallId: toolCall.toolCallId, output: { added: newOnes.length } });
        return;
      }

      if (toolCall.toolName === "updateElements") {
        const { updates } = toolCall.input as {
          updates: { id: string; fields: Record<string, unknown> }[];
        };
        // Strip nulls. The schema makes the model mention every field; only
        // the non null ones should actually apply.
        const byId = new Map(
          updates.map((u) => {
            const fields: Record<string, unknown> = {};
            for (const [k, v] of Object.entries(u.fields)) if (v !== null) fields[k] = v;
            return [u.id, fields];
          })
        );
        const next = api.getSceneElements().map((el) => {
          const fields = byId.get(el.id);
          return fields ? newElementWith(el, fields as never) : el;
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
