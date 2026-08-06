import type { AttachedReference, DebriefMessage } from "@/lib/api";

interface DebriefChatDraft {
  messages: DebriefMessage[];
  input: string;
  attached: AttachedReference[];
  loaded: boolean;
}

const drafts = new Map<number, DebriefChatDraft>();

/** Per-report chat draft, kept in module memory so switching pages/closing and
 * reopening a DebriefReportView (both of which unmount DebriefChat) doesn't
 * lose in-progress messages/attachments — mirrors backtestDraft.ts. */
export function getDebriefChatDraft(reportId: number): DebriefChatDraft {
  let draft = drafts.get(reportId);
  if (!draft) {
    draft = { messages: [], input: "", attached: [], loaded: false };
    drafts.set(reportId, draft);
  }
  return draft;
}
