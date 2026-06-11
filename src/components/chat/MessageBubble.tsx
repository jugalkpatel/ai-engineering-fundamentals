import type { UIMessage } from "ai";
import MarkdownRenderer from "./MarkdownRenderer";
import ToolStatus from "../streaming/ToolStatus";
import "../streaming/streaming.css";

interface MessageBubbleProps {
  message: UIMessage;
}

export default function MessageBubble({ message }: MessageBubbleProps) {
  return (
    <div className={`message-bubble ${message.role}`}>
      <div className="message-role">
        {message.role === "user" ? "You" : "Assistant"}
      </div>
      <div className="message-content">
        {message.parts?.map((part, i) => {
          if (part.type === "text") {
            if (message.role === "assistant") {
              return <MarkdownRenderer key={i} content={part.text} />;
            }

            return <p key={i}>{part.text}</p>;
          }

          if (part.type?.startsWith("tool-")) {
            const toolName = part.type.replace("tool-", "");
            const toolPart = part as { state?: string };
            const status =
              toolPart?.state === "output-available"
                ? "complete"
                : toolPart.state === "output-error"
                  ? "error"
                  : "running";

            return <ToolStatus key={i} status={status} name={toolName} />;
          }

          return null;
        })}
      </div>
    </div>
  );
}
