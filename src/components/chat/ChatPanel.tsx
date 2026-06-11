import { useState } from "react";
import type { UIMessage } from "ai";
import MessageList from "./MessageList";
import "./chat.css";

interface ChatPanelProps {
  messages: UIMessage[];
  sendMessage: (message: {
    role: "user";
    parts: { type: "text"; text: string }[];
  }) => void;
  status: string;
}

export default function ChatPanel({
  messages,
  sendMessage,
  status,
}: ChatPanelProps) {
  const [input, setInput] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Non-functional — wired up in lesson 3
    if (!input.trim()) return;
    console.log({ input });
    sendMessage({
      role: "user",
      parts: [
        {
          text: input,
          type: "text",
        },
      ],
    });
    setInput("");
  };

  const isStreaming = status === "submitted" || status === "streaming";

  return (
    <div className="chat-panel">
      <div className="chat-header">
        <h2>Chat</h2>
      </div>
      <MessageList messages={messages} />
      <form className="chat-input-form" onSubmit={handleSubmit}>
        <input
          type="text"
          className="chat-input"
          placeholder="Describe a diagram..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={isStreaming}
        />
        <button
          type="submit"
          className="chat-send-btn"
          disabled={isStreaming || !input.trim()}
        >
          {isStreaming ? "..." : "Send"}
        </button>
      </form>
    </div>
  );
}
