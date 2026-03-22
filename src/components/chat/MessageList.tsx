import { useEffect, useRef } from "react";
import type { UIMessage } from "ai";
import MessageBubble from "./MessageBubble";

interface MessageListProps {
  messages: UIMessage[];
}

export default function MessageList({ messages }: MessageListProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // Track whether the user was at (or near) the bottom before the last update
  // so we only auto scroll when they were already following along.
  const wasAtBottomRef = useRef(true);

  const handleScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    wasAtBottomRef.current = distanceFromBottom < 50;
  };

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    if (wasAtBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="message-list empty">
        <p className="placeholder-text">
          Describe a diagram and the AI will create it for you.
        </p>
      </div>
    );
  }

  return (
    <div className="message-list" ref={containerRef} onScroll={handleScroll}>
      {messages.map((msg) => (
        <MessageBubble key={msg.id} message={msg} />
      ))}
    </div>
  );
}
