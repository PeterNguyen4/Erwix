"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, History, Plus, Search, SlashSquare, Trash2, Wrench, X } from "lucide-react";
import ScrollToBottomButton from "@/components/ScrollToBottomButton";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ToolbarTooltip } from "@/components/chart/ToolbarButton";
import { api, AttachedReference, DebriefAskEvent, DebriefMessage, DebriefSession } from "@/lib/api";
import ReferencePicker, { REFERENCE_TYPE_STYLE, ReferencePickerHandle } from "@/components/journal/ReferencePicker";
import { getDebriefChatDraft } from "@/lib/debriefChatDraft";
import { getSessionOverride, setSessionOverride } from "@/lib/debriefChatSession";
import { useClickOutside } from "@/lib/useClickOutside";

function toolLabelParts(tool: string): { verb: string; rest: string } {
  const words = tool.split("_").map((w) => w[0]?.toUpperCase() + w.slice(1));
  return { verb: words[0] ?? "", rest: words.slice(1).join(" ") };
}

const CHART_TOOLS = new Set(["draw_annotations", "spotlight_day", "spotlight_trade", "zoom_to_range", "quote_note"]);

function ToolCallBadge({ tool }: { tool: string }) {
  const Icon = CHART_TOOLS.has(tool) ? Wrench : Search;
  const { verb, rest } = toolLabelParts(tool);
  return (
    <div className="my-2 flex items-center gap-1.5 text-xs font-medium text-muted">
      <Icon size={12} strokeWidth={2.2} />
      <span className="font-extrabold">{verb}</span>
      {rest && <span>{rest}</span>}
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex items-center gap-1 py-1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-1.5 w-1.5 rounded-full bg-muted animate-bounce-dot"
          style={{ animationDelay: `${i * 150}ms` }}
        />
      ))}
    </div>
  );
}

const SLASH_COMMANDS: { cmd: string; description: string }[] = [
  { cmd: "/clear", description: "Start a new conversation" },
];

const NEW_SESSION_KEY = -1;

const PLACEHOLDER_PROMPTS = [
  "Reference any trade, note, or symbol",
  "Open commands with /",
  "e.g. what went wrong this week?",
];

const MARKDOWN_COMPONENTS = {
  p: (props: React.HTMLAttributes<HTMLParagraphElement>) => <p className="mb-2 last:mb-0" {...props} />,
  ul: (props: React.HTMLAttributes<HTMLUListElement>) => (
    <ul className="mb-2 list-disc space-y-0.5 pl-4 last:mb-0" {...props} />
  ),
  ol: (props: React.HTMLAttributes<HTMLOListElement>) => (
    <ol className="mb-2 list-decimal space-y-0.5 pl-4 last:mb-0" {...props} />
  ),
  li: (props: React.HTMLAttributes<HTMLLIElement>) => <li {...props} />,
  h1: (props: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h3 className="mb-1.5 mt-3 text-base font-semibold first:mt-0" {...props} />
  ),
  h2: (props: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h3 className="mb-1.5 mt-3 text-base font-semibold first:mt-0" {...props} />
  ),
  h3: (props: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h4 className="mb-1 mt-2.5 text-[13px] font-semibold first:mt-0" {...props} />
  ),
  strong: (props: React.HTMLAttributes<HTMLElement>) => <strong className="font-semibold text-fg" {...props} />,
  hr: () => <hr className="my-3 border-t border-muted/50" />,
  code: (props: React.HTMLAttributes<HTMLElement>) => (
    <code className="rounded bg-border/60 px-1 py-0.5 text-[0.85em]" {...props} />
  ),
  a: (props: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a className="underline decoration-dotted underline-offset-2" target="_blank" rel="noreferrer" {...props} />
  ),
};

export default function DebriefChat({ reportId }: { reportId?: number | null }) {
  const [activeReportId, setActiveReportId] = useState<number | null>(() => {
    if (reportId == null) return null;
    const override = getSessionOverride(reportId);
    if (override === "blank") return null;
    if (typeof override === "number") return override;
    return reportId;
  });
  const draftKey = activeReportId ?? NEW_SESSION_KEY;
  const [messages, setMessages] = useState<DebriefMessage[]>(() => getDebriefChatDraft(draftKey).messages);
  const [input, setInput] = useState(() => getDebriefChatDraft(draftKey).input);
  const [attached, setAttached] = useState<AttachedReference[]>(() => getDebriefChatDraft(draftKey).attached);
  const [sending, setSending] = useState(false);
  const [sendHover, setSendHover] = useState(false);
  const [commandsOpen, setCommandsOpen] = useState(false);
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [sessions, setSessions] = useState<DebriefSession[]>([]);
  const [sessionsOpen, setSessionsOpen] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const nextTempId = useRef(-1);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sendButtonRef = useRef<HTMLButtonElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pickerRef = useRef<ReferencePickerHandle>(null);
  const commandsRef = useRef<HTMLDivElement>(null);
  const sessionsRef = useRef<HTMLDivElement>(null);
  useClickOutside(commandsRef, () => setCommandsOpen(false), commandsOpen);
  useClickOutside(sessionsRef, () => setSessionsOpen(false), sessionsOpen);

  const loadSessions = () => api.listDebriefSessions().then(setSessions).catch(() => {});
  useEffect(() => {
    loadSessions();
  }, []);

  useEffect(() => {
    const draft = getDebriefChatDraft(draftKey);
    setMessages(draft.messages);
    setInput(draft.input);
    setAttached(draft.attached);
    if (activeReportId != null && !draft.loaded) {
      api
        .debriefMessages(activeReportId)
        .then((msgs) => {
          draft.loaded = true;
          draft.messages = msgs;
          setMessages(msgs);
        })
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeReportId]);

  useEffect(() => {
    getDebriefChatDraft(draftKey).messages = messages;
  }, [messages, draftKey]);

  useEffect(() => {
    getDebriefChatDraft(draftKey).input = input;
  }, [input, draftKey]);

  useEffect(() => {
    getDebriefChatDraft(draftKey).attached = attached;
  }, [attached, draftKey]);

  const [atBottom, setAtBottom] = useState(true);

  const scrollToBottom = () => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  };

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 24);
  };

  useEffect(() => {
    scrollToBottom();
    setAtBottom(true);
  }, [messages]);

  const latestMessagesRef = useRef(messages);
  useEffect(() => {
    latestMessagesRef.current = messages;
  }, [messages]);

  const isEmpty = messages.length === 0;

  useEffect(() => {
    if (!isEmpty || input) return;
    const id = setInterval(() => {
      setPlaceholderIndex((i) => (i + 1) % PLACEHOLDER_PROMPTS.length);
    }, 10000);
    return () => clearInterval(id);
  }, [isEmpty, input]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [input]);

  const startNewSession = async () => {
    if (sending) return;
    setSessionsOpen(false);
    const session = await api.createDebriefSession().catch(() => null);
    if (!session) return;
    const fresh = getDebriefChatDraft(session.id);
    fresh.messages = [];
    fresh.input = "";
    fresh.attached = [];
    fresh.loaded = true;
    if (reportId != null) setSessionOverride(reportId, session.id);
    setSessions((prev) => [session, ...prev]);
    setActiveReportId(session.id);
  };

  const loadSession = (id: number) => {
    setSessionsOpen(false);
    if (id === activeReportId) return;
    if (reportId != null) setSessionOverride(reportId, id);
    setActiveReportId(id);
  };

  const deleteSession = async (id: number) => {
    await api.deleteDebriefSession(id).catch(() => {});
    setSessions((prev) => prev.filter((s) => s.id !== id));
    if (id === activeReportId) await startNewSession();
  };

  const currentSession = sessions.find((s) => s.id === activeReportId) ?? null;

  const startEditTitle = () => {
    if (activeReportId == null) return;
    setTitleDraft(currentSession?.title ?? "New chat");
    setEditingTitle(true);
  };

  const commitTitle = async () => {
    setEditingTitle(false);
    const trimmed = titleDraft.trim();
    if (!trimmed || activeReportId == null) return;
    const updated = await api.renameDebriefSession(activeReportId, trimmed).catch(() => null);
    if (updated) setSessions((prev) => prev.map((s) => (s.id === activeReportId ? { ...s, title: updated.title } : s)));
  };

  const runCommand = async (cmd: string) => {
    setCommandsOpen(false);
    if (cmd === "/clear") startNewSession();
  };

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;
    if (SLASH_COMMANDS.some((c) => c.cmd === text)) {
      await runCommand(text);
      return;
    }
    const references = attached;
    setInput("");
    setAttached([]);
    setSending(true);
    const userId = nextTempId.current--;
    const assistantId = nextTempId.current--;
    setMessages((prev) => [
      ...prev,
      { id: userId, role: "user", content: text, created_at: new Date().toISOString() },
      { id: assistantId, role: "assistant", content: "", parts: [], created_at: new Date().toISOString() },
    ]);

    const updateAssistant = (fn: (m: DebriefMessage) => DebriefMessage) =>
      setMessages((prev) => prev.map((m) => (m.id === assistantId ? fn(m) : m)));

    try {
      const url = await api.debriefAskStreamUrl(text, activeReportId, references);
      await new Promise<void>((resolve, reject) => {
        const ws = new WebSocket(url);
        ws.onmessage = (ev) => {
          const event: DebriefAskEvent = JSON.parse(ev.data);
          if (event.type === "report") {
            if (activeReportId == null) {
              const newDraft = getDebriefChatDraft(event.report_id);
              newDraft.messages = latestMessagesRef.current;
              newDraft.loaded = true;
              if (reportId != null) setSessionOverride(reportId, event.report_id);
              setActiveReportId(event.report_id);
            }
          } else if (event.type === "token") {
            updateAssistant((m) => {
              const parts = m.parts ?? [];
              const last = parts[parts.length - 1];
              const nextParts =
                last?.type === "text"
                  ? [...parts.slice(0, -1), { type: "text" as const, text: last.text + event.text }]
                  : [...parts, { type: "text" as const, text: event.text }];
              return { ...m, content: m.content + event.text, parts: nextParts };
            });
          } else if (event.type === "tool_call") {
            updateAssistant((m) => ({
              ...m,
              parts: [...(m.parts ?? []), { type: "tool_call" as const, tool: event.tool, args: event.args }],
            }));
          } else if (event.type === "done") {
            loadSessions();
            resolve();
          } else if (event.type === "error") {
            reject(new Error(event.detail));
          }
        };
        ws.onerror = () => reject(new Error("Connection lost."));
        ws.onclose = () => resolve();
      });
    } catch {
      updateAssistant((m) => ({
        ...m,
        content: "Sorry, that follow-up failed. Try again?",
        parts: [{ type: "text", text: "Sorry, that follow-up failed. Try again?" }],
      }));
    } finally {
      setSending(false);
    }
  };

  const attach = (ref: AttachedReference) => {
    setAttached((prev) => (prev.some((r) => r.type === ref.type && r.refId === ref.refId) ? prev : [...prev, ref]));
  };

  const detach = (ref: AttachedReference) => {
    setAttached((prev) => prev.filter((r) => !(r.type === ref.type && r.refId === ref.refId)));
  };

  const onInputChange = (value: string) => {
    setInput(value);
    const cursor = textareaRef.current?.selectionStart ?? value.length;
    const beforeCursor = value.slice(0, cursor);
    const match = beforeCursor.match(/(?:^|\s)@(\S*)$/);
    if (match) pickerRef.current?.openWithQuery(match[1]);
    setCommandsOpen(value.startsWith("/") && !value.includes(" "));
  };

  const matchingCommands = input.startsWith("/")
    ? SLASH_COMMANDS.filter((c) => c.cmd.startsWith(input))
    : SLASH_COMMANDS;

  const inputRow = (
    <div className="w-full shrink-0 px-4 py-3">
      <div className="relative mx-auto flex w-full max-w-2xl flex-col rounded-2xl border border-border bg-field focus-within:border-violet-400">
        {attached.length > 0 && (
          <div className="flex flex-wrap gap-1.5 px-[18px] pt-2">
            {attached.map((ref) => {
              const style = REFERENCE_TYPE_STYLE[ref.type];
              const Icon = style.icon;
              return (
                <span
                  key={`${ref.type}-${ref.refId}`}
                  className={`flex items-center gap-1.5 rounded-full border ${style.borderClass} ${style.bgClass} px-3 py-1 text-[11px] text-fg`}
                >
                  <Icon size={11} strokeWidth={2.2} className={`shrink-0 ${style.textClass}`} />
                  {ref.label}
                  <button
                    type="button"
                    onClick={() => detach(ref)}
                    aria-label={`Remove ${ref.label}`}
                    className="text-muted transition-colors hover:text-fg"
                  >
                    <X size={10} strokeWidth={2.2} />
                  </button>
                </span>
              );
            })}
          </div>
        )}
        <div className={`relative pl-[18px] pr-3 pt-3 ${isEmpty ? "pb-1" : "pb-0"}`}>
          {isEmpty && !input && (
            <div className="pointer-events-none absolute left-[18px] top-3 right-4 h-5 overflow-hidden">
              <div key={placeholderIndex} className="animate-fade-in-up text-sm text-muted">
                {PLACEHOLDER_PROMPTS[placeholderIndex]}
              </div>
            </div>
          )}
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder={isEmpty ? "" : "Ask a follow-up…"}
            rows={1}
            className="chat-scroll max-h-40 min-h-[1.75rem] w-full resize-none overflow-y-auto bg-transparent pr-2 text-sm text-fg outline-none placeholder:text-muted"
          />
        </div>
        <div className="flex items-center justify-between px-3 pb-3">
          <div className="flex items-center gap-1">
            <ReferencePicker ref={pickerRef} onAttach={attach} />
            <div ref={commandsRef}>
              <button
                type="button"
                onClick={() => setCommandsOpen((v) => !v)}
                aria-label="Chat commands"
                className="flex shrink-0 items-center justify-center rounded-full bg-field p-1.5 text-muted transition-colors hover:bg-fg/10 hover:text-fg"
              >
                <SlashSquare size={15} strokeWidth={2} />
              </button>
              {commandsOpen && matchingCommands.length > 0 && (
                <div className="absolute bottom-full left-0 z-20 mb-2 w-56 rounded-md border border-border bg-panel py-1 shadow-lg">
                  {matchingCommands.map((c) => (
                    <button
                      key={c.cmd}
                      type="button"
                      onClick={() => runCommand(c.cmd)}
                      className="flex w-full flex-col items-start px-3 py-1.5 text-left transition-colors hover:bg-violet-500/10"
                    >
                      <span className="font-mono text-xs text-fg">{c.cmd}</span>
                      <span className="truncate text-[10px] text-muted">{c.description}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div
            className="relative flex items-center"
            onMouseEnter={() => setSendHover(true)}
            onMouseLeave={() => setSendHover(false)}
          >
            <button
              ref={sendButtonRef}
              onClick={send}
              disabled={sending || !input.trim()}
              aria-label="Send"
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-accent text-on-accent transition-colors hover:bg-accent/80 disabled:opacity-50"
            >
              <ArrowUp size={13} strokeWidth={2.5} />
            </button>
            <ToolbarTooltip label="Send" hover={sendHover} placement="top" anchorRef={sendButtonRef} />
          </div>
        </div>
      </div>
    </div>
  );

  const sessionsMenu = (
    <div ref={sessionsRef} className="relative">
      <button
        type="button"
        onClick={() => setSessionsOpen((o) => !o)}
        aria-label="Chat sessions"
        className="flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs text-muted transition-colors hover:border-accent hover:text-fg"
      >
        <History size={13} strokeWidth={2} />
        Sessions
      </button>
      {sessionsOpen && (
        <div className="absolute right-0 top-full z-30 mt-1 max-h-72 w-64 overflow-y-auto rounded-md border border-border bg-panel py-1 shadow-lg">
          <button
            type="button"
            onClick={startNewSession}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs font-medium text-accent transition-colors hover:bg-violet-500/10"
          >
            <Plus size={12} strokeWidth={2.2} />
            New chat
          </button>
          {sessions.length > 0 && <div className="my-1 border-t border-border" />}
          {sessions.map((s) => (
            <div
              key={s.id}
              className={`group flex items-center gap-1 ${s.id === activeReportId ? "bg-violet-500/10" : ""}`}
            >
              <button
                type="button"
                onClick={() => loadSession(s.id)}
                className="min-w-0 flex-1 truncate px-3 py-1.5 text-left text-xs text-fg transition-colors hover:text-accent"
              >
                {s.title}
              </button>
              <button
                type="button"
                onClick={() => deleteSession(s.id)}
                aria-label={`Delete ${s.title}`}
                className="mr-1 shrink-0 rounded p-1 text-muted opacity-0 transition-opacity hover:text-down group-hover:opacity-100"
              >
                <Trash2 size={11} strokeWidth={2} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const titleBar =
    activeReportId != null ? (
      editingTitle ? (
        <input
          autoFocus
          value={titleDraft}
          onChange={(e) => setTitleDraft(e.target.value)}
          onBlur={commitTitle}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitTitle();
            if (e.key === "Escape") setEditingTitle(false);
          }}
          className="w-40 rounded border border-violet-400 bg-field px-1.5 py-0.5 text-xs font-medium text-fg outline-none"
        />
      ) : (
        <button
          type="button"
          onClick={startEditTitle}
          title="Rename chat"
          className="min-w-0 truncate rounded px-1.5 py-0.5 text-xs font-medium text-muted transition-colors hover:bg-fg/10 hover:text-fg"
        >
          {currentSession?.title ?? "New chat"}
        </button>
      )
    ) : (
      <div />
    );

  if (isEmpty) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex shrink-0 items-center justify-between px-4 pt-3">
          {titleBar}
          {sessionsMenu}
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-5 px-4">
          <h2 className="text-lg font-normal text-fg">Ask anything about your trading</h2>
          {inputRow}
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-2">
        {titleBar}
        {sessionsMenu}
      </div>
      <div className="pointer-events-none absolute inset-x-0 top-[41px] z-10 h-6 bg-gradient-to-b from-panel to-transparent" />
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="chat-scroll flex-1 space-y-2 overflow-y-auto overflow-x-hidden px-4 pb-32 pt-6"
      >
        {messages.map((m) => (
          <div
            key={m.id}
            className={
              m.role === "user"
                ? "ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-accent/20 px-3 py-2 text-sm text-fg"
                : "text-sm text-fg"
            }
          >
            {m.role === "assistant" ? (
              m.parts ? (
                m.parts.length === 0 ? (
                  <div className="py-0.5 pl-[18px]">
                    <TypingIndicator />
                  </div>
                ) : (
                  m.parts.map((part, i) =>
                    part.type === "tool_call" ? (
                      <ToolCallBadge key={i} tool={part.tool} />
                    ) : (
                      <div key={i} className="whitespace-pre-wrap py-0.5 pl-[18px]">
                        <ReactMarkdown remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>
                          {part.text}
                        </ReactMarkdown>
                      </div>
                    ),
                  )
                )
              ) : (
                <>
                  {(m.tool_provenance ?? []).map((call, i) => (
                    <ToolCallBadge key={`${call.tool}-${i}`} tool={call.tool} />
                  ))}
                  <div className="whitespace-pre-wrap py-0.5 pl-[18px]">
                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>
                      {m.content}
                    </ReactMarkdown>
                  </div>
                </>
              )
            ) : (
              m.content
            )}
          </div>
        ))}
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-16 bg-gradient-to-t from-panel to-transparent" />
      {!atBottom && (
        <ScrollToBottomButton onClick={scrollToBottom} className="absolute bottom-24 left-1/2 z-20 -translate-x-1/2" />
      )}
      <div className="absolute inset-x-0 bottom-0 z-20">{inputRow}</div>
    </div>
  );
}
