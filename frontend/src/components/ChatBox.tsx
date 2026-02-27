"use client";

import { useState, useRef, useEffect } from "react";
import axios from "axios";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";

interface Message {
  role: "user" | "assistant";
  content: string;
}

export default function ChatBox() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content:
        "Hello! I'm here to help you with RDF data generation, SHACL validation, and navigating the IUC02 framework. How can I assist you today?",
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [chatSize, setChatSize] = useState({ width: 600, height: 650 });
  const [isResizing, setIsResizing] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatRef = useRef<HTMLDivElement>(null);

  // Check for mobile on mount and resize
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 640);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing || !chatRef.current) return;

      const rect = chatRef.current.getBoundingClientRect();
      const newWidth = window.innerWidth - e.clientX;
      const newHeight = window.innerHeight - e.clientY;

      setChatSize({
        width: Math.max(350, Math.min(newWidth, window.innerWidth - 32)),
        height: Math.max(400, Math.min(newHeight, window.innerHeight - 32)),
      });
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "nwse-resize";
      document.body.style.userSelect = "none";
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing]);

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = { role: "user", content: input };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const response = await axios.post("/api/chat", {
        messages: [...messages, userMessage],
      });

      const assistantMessage: Message = {
        role: "assistant",
        content: response.data.message,
      };

      // Log if response was cached
      if (response.data.cached) {
        console.log("⚡ Response retrieved from cache (instant)");
      } else {
        console.log("🌐 Response from OpenAI API");
      }

      // Show warning if off-topic with strike count
      if (response.data.warning) {
        console.warn("⚠️", response.data.warning);

        // Add warning as a separate system message
        const warningMessage: Message = {
          role: "assistant",
          content: `⚠️ WARNING: ${response.data.warning}`,
        };
        setMessages((prev) => [...prev, assistantMessage, warningMessage]);
        return;
      }

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error: any) {
      console.error("Error sending message:", error);

      let errorContent = "Sorry, I encountered an error. Please try again.";

      // Handle penalty (403 Forbidden)
      if (error.response?.status === 403 && error.response.data?.isPenalty) {
        const retryAfter = error.response.data?.retryAfter || 300;
        const minutes = Math.ceil(retryAfter / 60);
        errorContent = `🚫 ${error.response.data.error}\n\nYou have ${minutes} minute(s) remaining. Please use this time to review the IUC02 documentation.`;
      }
      // Handle rate limiting
      else if (error.response?.status === 429) {
        const retryAfter = error.response.data?.retryAfter || 60;
        errorContent = `You're sending messages too quickly. Please wait ${retryAfter} seconds before trying again.`;
      } else if (error.response?.status === 400) {
        errorContent = "Invalid message format. Please try again.";
      }

      const errorMessage: Message = {
        role: "assistant",
        content: errorContent,
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <>
      {/* Chat Toggle Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-50 bg-blue-600 hover:bg-blue-700 text-white rounded-full p-3 sm:p-4 shadow-lg transition-all duration-300 hover:scale-110"
        aria-label="Toggle chat"
      >
        {isOpen ? (
          <svg
            className="w-5 h-5 sm:w-6 sm:h-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        ) : (
          <svg
            className="w-5 h-5 sm:w-6 sm:h-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
            />
          </svg>
        )}
      </button>

      {/* Chat Window */}
      {isOpen && (
        <div
          ref={chatRef}
          className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-50 bg-white rounded-lg shadow-2xl flex flex-col border border-gray-200"
          style={{
            width: isMobile ? 'calc(100vw - 2rem)' : `${chatSize.width}px`,
            height: isMobile ? 'calc(100vh - 2rem)' : `${chatSize.height}px`,
            maxHeight: 'calc(100vh - 2rem)',
          }}
        >
          {/* Resize Handle */}
          <div
            className="absolute top-0 left-0 w-4 h-4 cursor-nwse-resize hover:bg-blue-500 hover:bg-opacity-20 transition-colors rounded-tl-lg hidden sm:block"
            onMouseDown={() => setIsResizing(true)}
            title="Drag to resize"
          >
            <svg
              className="w-3 h-3 text-gray-400 absolute top-0.5 left-0.5"
              fill="currentColor"
              viewBox="0 0 16 16"
            >
              <path d="M0 0h2v2H0V0zm0 4h2v2H0V4zm4-4h2v2H4V0zm0 4h2v2H4V4z" />
            </svg>
          </div>

          {/* Header */}
          <div className="bg-blue-600 text-white px-3 sm:px-4 py-2 sm:py-3 rounded-t-lg shrink-0 flex-none">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-semibold text-sm sm:text-base">
                  IUC02 AI Assistant
                </h3>
                <p className="text-xs text-blue-100 mt-0.5">
                  Ask me about RDF, SHACL, or workflow
                </p>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="text-white hover:text-blue-200 transition-colors ml-2"
                aria-label="Close chat"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3 sm:space-y-4">
            {messages.map((message, index) => (
              <div
                key={index}
                className={`flex ${
                  message.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                <div
                  className={`max-w-[95%] rounded-lg px-3 sm:px-4 py-2 sm:py-3 break-words overflow-hidden ${
                    message.role === "user"
                      ? "bg-blue-600 text-white"
                      : "bg-gray-100 text-gray-800"
                  }`}
                >
                  {message.role === "user" ? (
                    <p className="text-xs sm:text-sm whitespace-pre-wrap break-words">
                      {message.content}
                    </p>
                  ) : (
                    <div className="text-xs sm:text-sm prose prose-sm max-w-none prose-headings:mt-3 prose-headings:mb-2 prose-p:my-2 prose-ul:my-2 prose-ol:my-2 prose-li:my-1 prose-code:text-xs prose-pre:my-2 prose-pre:overflow-x-auto">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          code({ node, inline, className, children, ...props }: any) {
                            const match = /language-(\w+)/.exec(className || "");
                            return !inline && match ? (
                              <SyntaxHighlighter
                                style={vscDarkPlus}
                                language={match[1]}
                                PreTag="div"
                                className="rounded-md text-xs overflow-x-auto"
                                wrapLongLines={false}
                                {...props}
                              >
                                {String(children).replace(/\n$/, "")}
                              </SyntaxHighlighter>
                            ) : (
                              <code className="bg-gray-200 text-gray-800 px-1 py-0.5 rounded text-xs break-all" {...props}>
                                {children}
                              </code>
                            );
                          },
                          ul: ({ children }) => (
                            <ul className="list-disc list-inside space-y-1 my-2">{children}</ul>
                          ),
                          ol: ({ children }) => (
                            <ol className="list-decimal list-inside space-y-1 my-2">{children}</ol>
                          ),
                          li: ({ children }) => (
                            <li className="ml-2">{children}</li>
                          ),
                          p: ({ children }) => (
                            <p className="my-2 leading-relaxed break-words">{children}</p>
                          ),
                          h1: ({ children }) => (
                            <h1 className="text-base font-bold mt-3 mb-2 break-words">{children}</h1>
                          ),
                          h2: ({ children }) => (
                            <h2 className="text-sm font-bold mt-3 mb-2 break-words">{children}</h2>
                          ),
                          h3: ({ children }) => (
                            <h3 className="text-sm font-semibold mt-2 mb-1 break-words">{children}</h3>
                          ),
                          a: ({ children, href }) => (
                            <a href={href} className="text-blue-600 hover:underline break-all" target="_blank" rel="noopener noreferrer">{children}</a>
                          ),
                          blockquote: ({ children }) => (
                            <blockquote className="border-l-4 border-gray-300 pl-3 my-2 italic">{children}</blockquote>
                          ),
                        }}
                      >
                        {message.content}
                      </ReactMarkdown>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-gray-100 text-gray-800 rounded-lg px-3 sm:px-4 py-2">
                  <div className="flex space-x-2">
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                    <div
                      className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                      style={{ animationDelay: "0.1s" }}
                    ></div>
                    <div
                      className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                      style={{ animationDelay: "0.2s" }}
                    ></div>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="border-t border-gray-200 p-3 sm:p-4 shrink-0">
            <div className="flex gap-2 items-center">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Type your message..."
                className="flex-1 min-w-0 border border-gray-300 rounded-lg px-3 sm:px-4 py-2 text-sm sm:text-base focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800"
                disabled={isLoading}
              />
              <button
                onClick={sendMessage}
                disabled={isLoading || !input.trim()}
                className="bg-blue-600 hover:bg-blue-700 text-white px-2 py-2 sm:px-3 sm:py-2 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex-shrink-0"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                  />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
