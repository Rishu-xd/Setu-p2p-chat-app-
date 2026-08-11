
"use client";

import { useState, useRef, useEffect } from "react";

interface Message {
  id: string;
  sender: "me" | "peer";
  text: string;
  timestamp: string;
}

interface ChatUIProps {
  role: "A" | "B";
  messages: Message[];
  onSendMessage: (text: string) => void;
  onReset: () => void;
}

export default function ChatUI({
  role,
  messages,
  onSendMessage,
  onReset,
}: ChatUIProps) {
  const [inputText, setInputText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: "smooth",
    });
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const text = inputText.trim();
    if (!text) return;

    onSendMessage(text);
    setInputText("");
  };

  const peer = role === "A" ? "B" : "A";

  return (
    <div className="flex min-h-screen w-full bg-[#09090b] text-white">
      <div className="flex h-screen w-full flex-col">

        {/* Header */}
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-white/[0.06] bg-[#09090b]/95 px-6 backdrop-blur-xl">
          <button
            onClick={onReset}
            className="group flex items-center gap-2 text-sm text-zinc-500 transition-colors hover:text-white"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              className="transition-transform duration-200 group-hover:-translate-x-1"
            >
              <path
                d="M15 19L8 12L15 5"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>

            Disconnect
          </button>

          {/* Connection */}
          <div className="absolute left-1/2 flex -translate-x-1/2 items-center gap-3">
            <div className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-800 text-xs font-semibold ring-1 ring-white/10">
              {peer}

              <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-[#09090b] bg-emerald-500" />
            </div>

            <div className="hidden sm:block">
              <div className="text-sm font-medium text-zinc-200">
                Device {peer}
              </div>

              <div className="flex items-center gap-1.5 text-[11px] text-emerald-500">
                <span className="h-1 w-1 rounded-full bg-emerald-500" />
                Connected
              </div>
            </div>
          </div>

          <div className="text-xs font-mono text-zinc-700">
            {role} → {peer}
          </div>
        </header>

        {/* Messages */}
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto flex w-full max-w-3xl flex-col px-5 py-8 sm:px-8">

            {/* Connection status */}
            <div className="mb-8 flex items-center justify-center gap-3 text-[10px] uppercase tracking-[0.18em] text-zinc-600">
              <span className="h-px w-12 bg-white/[0.06]" />

              <span>End-to-end encrypted</span>

              <span className="h-px w-12 bg-white/[0.06]" />
            </div>

            {messages.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center py-32 text-center">
                <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.025]">
                  <svg
                    width="22"
                    height="22"
                    viewBox="0 0 24 24"
                    fill="none"
                    className="text-zinc-600"
                  >
                    <path
                      d="M21 11.5C21 16.1944 16.9706 20 12 20C10.45 20 8.99 19.64 7.7 19L3 20L4.5 15.7C3.55 14.5 3 13.05 3 11.5C3 6.80558 7.02944 3 12 3C16.9706 3 21 6.80558 21 11.5Z"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    />
                  </svg>
                </div>

                <h2 className="text-sm font-medium text-zinc-300">
                  No messages yet
                </h2>

                <p className="mt-2 max-w-xs text-xs leading-5 text-zinc-600">
                  Messages are sent directly between the two connected devices.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {messages.map((msg, index) => {
                  const isMe = msg.sender === "me";
                  const previous = messages[index - 1];
                  const next = messages[index + 1];

                  const isFirst =
                    !previous || previous.sender !== msg.sender;

                  const isLast =
                    !next || next.sender !== msg.sender;

                  return (
                    <div
                      key={msg.id}
                      className={`message-enter flex ${
                        isMe ? "justify-end" : "justify-start"
                      }`}
                    >
                      <div
                        className={`group relative max-w-[75%] sm:max-w-[65%] ${
                          isFirst ? "mt-2" : ""
                        }`}
                      >
                        <div
                          className={`px-4 py-2.5 text-[14px] leading-6 ${
                            isMe
                              ? "bg-white text-black"
                              : "border border-white/[0.07] bg-[#151518] text-zinc-200"
                          } ${
                            isFirst && isLast
                              ? "rounded-2xl"
                              : isMe
                              ? isFirst
                                ? "rounded-2xl rounded-br-md"
                                : isLast
                                ? "rounded-2xl rounded-tr-md"
                                : "rounded-l-2xl"
                              : isFirst
                              ? "rounded-2xl rounded-bl-md"
                              : isLast
                              ? "rounded-2xl rounded-tl-md"
                              : "rounded-r-2xl"
                          }`}
                          style={{ overflowWrap: "anywhere" }}
                        >
                          {msg.text}
                        </div>

                        {/* Timestamp */}
                        {isLast && (
                          <div
                            className={`mt-1 px-1 text-[10px] text-zinc-700 opacity-0 transition-opacity duration-200 group-hover:opacity-100 ${
                              isMe ? "text-right" : "text-left"
                            }`}
                          >
                            {msg.timestamp}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}

                <div ref={messagesEndRef} className="h-4" />
              </div>
            )}
          </div>
        </main>

        {/* Input */}
        <div className="shrink-0 border-t border-white/[0.06] bg-[#09090b] px-5 py-4 sm:px-8">
          <form
            onSubmit={handleSubmit}
            className="mx-auto flex w-full max-w-3xl items-end gap-3"
          >
            <div className="relative flex-1">
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Write a message..."
                className="h-12 w-full rounded-xl border border-white/[0.08] bg-[#111113] px-4 pr-12 text-sm text-white outline-none transition-all duration-200 placeholder:text-zinc-600 hover:border-white/[0.12] focus:border-white/[0.18] focus:bg-[#141416]"
              />

              <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-mono text-zinc-700">
                ↵
              </div>
            </div>

            <button
              type="submit"
              disabled={!inputText.trim()}
              className={` cursor-pointer flex h-12 w-12 shrink-0 items-center justify-center rounded-xl transition-all duration-200 ${
                inputText.trim()
                  ? "bg-white text-black hover:scale-[1.03] hover:bg-zinc-200 active:scale-95"
                  : "cursor-not-allowed border border-white/[0.06] bg-[#111113] text-gray-100"
              }`}
            >
                    Send
            </button>
          </form>

          <div className="mx-auto mt-2 max-w-3xl text-center text-[10px] text-zinc-700">
            Direct device-to-device connection
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes messageEnter {
          from {
            opacity: 0;
            transform: translateY(8px);
          }

          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .message-enter {
          animation: messageEnter 0.22s cubic-bezier(0.16, 1, 0.3, 1);
        }

        @media (prefers-reduced-motion: reduce) {
          .message-enter {
            animation: none;
          }
        }

        main {
          scrollbar-width: thin;
          scrollbar-color: #27272a transparent;
        }

        main::-webkit-scrollbar {
          width: 5px;
        }

        main::-webkit-scrollbar-track {
          background: transparent;
        }

        main::-webkit-scrollbar-thumb {
          background: #27272a;
          border-radius: 10px;
        }
      `}</style>
    </div>
  );
}

