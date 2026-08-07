"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, Search, Wrench, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ToolbarTooltip } from "@/components/chart/ToolbarButton";
import { api, AttachedReference, DebriefAskEvent, DebriefMessage } from "@/lib/api";
import ReferencePicker, { REFERENCE_TYPE_STYLE, ReferencePickerHandle } from "@/components/journal/ReferencePicker";
import { getDebriefChatDraft } from "@/lib/debriefChatDraft";

function toolLabel(tool: string): string {
  return tool
    .split("_")
    .map((w) => w[0]?.toUpperCase() + w.slice(1))
    .join(" ");
}

const CHART_TOOLS = new Set(["draw_annotations", "spotlight_day", "spotlight_trade", "zoom_to_range", "quote_note"]);

function ToolCallBadge({ tool }: { tool: string }) {
  const Icon = CHART_TOOLS.has(tool) ? Wrench : Search;
  return (
    <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted">
      <Icon size={12} strokeWidth={2.2} />
      <span className="font-extrabold">{toolLabel(tool)}</span>
    </div>
  );
}

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

export default function DebriefChat({ reportId }: { reportId: number }) {
  const [messages, setMessages] = useState<DebriefMessage[]>(() => getDebriefChatDraft(reportId).messages);
  const [input, setInput] = useState(() => getDebriefChatDraft(reportId).input);
  const [attached, setAttached] = useState<AttachedReference[]>(() => getDebriefChatDraft(reportId).attached);
  const [sending, setSending] = useState(false);
  const [sendHover, setSendHover] = useState(false);
  const nextTempId = useRef(-1);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sendButtonRef = useRef<HTMLButtonElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pickerRef = useRef<ReferencePickerHandle>(null);

  useEffect(() => {
    const draft = getDebriefChatDraft(reportId);
    if (draft.loaded) return;
    api
      .debriefMessages(reportId)
      .then((msgs) => {
        draft.loaded = true;
        draft.messages = msgs;
        setMessages(msgs);
      })
      .catch(() => {});
  }, [reportId]);

  useEffect(() => {
    getDebriefChatDraft(reportId).messages = messages;
  }, [messages, reportId]);

  useEffect(() => {
    getDebriefChatDraft(reportId).input = input;
  }, [input, reportId]);

  useEffect(() => {
    getDebriefChatDraft(reportId).attached = attached;
  }, [attached, reportId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [input]);

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;
    const references = attached;
    setInput("");
    setAttached([]);
    setSending(true);
    const userId = nextTempId.current--;
    const assistantId = nextTempId.current--;
    setMessages((prev) => [
      ...prev,
      { id: userId, role: "user", content: text, created_at: new Date().toISOString() },
      { id: assistantId, role: "assistant", content: "", tool_provenance: [], created_at: new Date().toISOString() },
    ]);

    const updateAssistant = (fn: (m: DebriefMessage) => DebriefMessage) =>
      setMessages((prev) => prev.map((m) => (m.id === assistantId ? fn(m) : m)));

    try {
      const url = await api.debriefAskStreamUrl(text, reportId, references);
      await new Promise<void>((resolve, reject) => {
        const ws = new WebSocket(url);
        ws.onmessage = (ev) => {
          const event: DebriefAskEvent = JSON.parse(ev.data);
          if (event.type === "token") {
            updateAssistant((m) => ({ ...m, content: m.content + event.text }));
          } else if (event.type === "tool_call") {
            updateAssistant((m) => ({
              ...m,
              tool_provenance: [...(m.tool_provenance ?? []), { tool: event.tool, args: event.args }],
            }));
          } else if (event.type === "done") {
            resolve();
          } else if (event.type === "error") {
            reject(new Error(event.detail));
          }
        };
        ws.onerror = () => reject(new Error("Connection lost."));
        ws.onclose = () => resolve();
      });
    } catch {
      updateAssistant((m) => ({ ...m, content: "Sorry, that follow-up failed. Try again?", tool_provenance: [] }));
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
  };

  return (
    <div className="flex h-full flex-col">
      <div ref={scrollRef} className="flex-1 space-y-2 overflow-auto py-2 pl-[22px] pr-4">
        {messages.map((m) => (
          <div
            key={m.id}
            className={
              m.role === "user"
                ? "ml-auto max-w-[85%] rounded-2xl rounded-tr-sm bg-accent/20 px-3 py-2 text-sm text-fg"
                : "max-w-[85%] rounded-2xl rounded-tl-sm bg-border/60 px-3 py-2 text-sm text-fg"
            }
          >
            {m.role === "assistant" &&
              (m.tool_provenance ?? []).map((call, i) => <ToolCallBadge key={`${call.tool}-${i}`} tool={call.tool} />)}
            {m.role === "assistant" ? (
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>
                {m.content}
              </ReactMarkdown>
            ) : (
              m.content
            )}
          </div>
        ))}
      </div>
      <div className="w-full shrink-0 px-4 py-3">
        <div className="flex w-full flex-col rounded-2xl border border-border bg-field focus-within:border-violet-400">
          {attached.length > 0 && (
            <div className="flex flex-wrap gap-1.5 px-[18px] pt-3">
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
          <div className="pl-[18px] pr-3 pt-3">
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
              placeholder="Ask a follow-up…"
              rows={1}
              className="chat-scroll max-h-40 min-h-[1.75rem] w-full resize-none overflow-y-auto bg-transparent pr-2 text-sm text-fg outline-none placeholder:text-muted"
            />
          </div>
          <div className="flex items-center justify-between px-3 pb-3">
            <ReferencePicker ref={pickerRef} onAttach={attach} />
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
    </div>
  );
}
