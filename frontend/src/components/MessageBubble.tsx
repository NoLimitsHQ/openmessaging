import type { Message } from "../api";

interface MessageBubbleProps {
  message: Message;
  isOutgoing: boolean;
  showSender?: boolean;
}

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function StatusTicks({ status }: { status: Message["status"] }) {
  if (status === "SENT") {
    return <span className="tick">✓</span>;
  }
  return <span className={`tick${status === "READ" ? " tick--read" : ""}`}>✓✓</span>;
}

export default function MessageBubble({ message, isOutgoing, showSender }: MessageBubbleProps) {
  return (
    <div className={`message-row ${isOutgoing ? "outgoing" : "incoming"}`}>
      <div className="message-bubble">
        {showSender && !isOutgoing && (
          <div className="message-sender">{message.senderUserTag ?? message.senderUsername}</div>
        )}
        <div className="message-content">{message.content}</div>
        <div className="message-time">
          <span>{formatTime(message.createdAt)}</span>
          {isOutgoing && <StatusTicks status={message.status} />}
        </div>
      </div>
    </div>
  );
}
