"use client";

import { useEffect, useRef, useState } from "react";
import { Clock } from "lucide-react";
import { api, UserPreference } from "@/lib/api";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]; // index matches Python's date.weekday() (0=Mon..6=Sun), which the backend scheduler compares against

const pad = (n: number) => n.toString().padStart(2, "0");
// dayIdx (0=Mon..6=Sun, matching DAYS/backend) <-> JS Date.getDay() (0=Sun..6=Sat)
const dayIdxToJsDay = (dayIdx: number) => (dayIdx + 1) % 7;
const jsDayToDayIdx = (jsDay: number) => (jsDay + 6) % 7;
// Jan 1 2024 is a Monday in both UTC and any local calendar — used as a
// weekday-agnostic anchor to convert between local wall-clock day/time (what
// the picker shows) and UTC day/time (what debrief_day_of_week/debrief_time
// are stored as, since the backend scheduler compares against datetime.now(UTC)).
function localSlotToUtc(localDay: number, localTime: string): { day: number; time: string } {
  const [hh, mm] = localTime.split(":").map(Number);
  const ref = new Date(2024, 0, 1);
  ref.setDate(ref.getDate() + ((dayIdxToJsDay(localDay) - ref.getDay() + 7) % 7));
  ref.setHours(hh, mm, 0, 0);
  return { day: jsDayToDayIdx(ref.getUTCDay()), time: `${pad(ref.getUTCHours())}:${pad(ref.getUTCMinutes())}` };
}
function utcSlotToLocal(utcDay: number, utcTime: string): { day: number; time: string } {
  const [hh, mm] = utcTime.split(":").map(Number);
  const ref = new Date(Date.UTC(2024, 0, 1));
  ref.setUTCDate(ref.getUTCDate() + ((dayIdxToJsDay(utcDay) - ref.getUTCDay() + 7) % 7));
  ref.setUTCHours(hh, mm, 0, 0);
  return { day: jsDayToDayIdx(ref.getDay()), time: `${pad(ref.getHours())}:${pad(ref.getMinutes())}` };
}

function ClockIcon() {
  return <Clock size={14} strokeWidth={1.9} />;
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${checked ? "bg-accent" : "bg-border"}`}
    >
      <span
        className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform"
        style={{ transform: checked ? "translateX(16px)" : "translateX(0)" }}
      />
    </button>
  );
}

/** Popover settings for the scheduled background debrief — persisted to
 * UserPreference.debrief_enabled/debrief_day_of_week/debrief_time via
 * PATCH /api/user/preferences (see routers/user.py). */
export default function DebriefScheduleSettings() {
  const [prefs, setPrefs] = useState<UserPreference | null>(null);
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.getPreferences().then(setPrefs).catch(() => {});
  }, []);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  if (!prefs) return null;

  const save = (patch: Partial<UserPreference>) => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    api
      .savePreferences(patch)
      .then(() => {
        setSaved(true);
        if (savedTimer.current) clearTimeout(savedTimer.current);
        savedTimer.current = setTimeout(() => setSaved(false), 1500);
      })
      .catch(() => setPrefs(prefs));
  };

  // debrief_day_of_week/debrief_time are stored in UTC (the backend scheduler
  // compares against datetime.now(UTC)) — convert to local wall-clock for display,
  // and convert local picker input back to UTC before saving.
  const local =
    prefs.debrief_day_of_week != null && prefs.debrief_time
      ? utcSlotToLocal(prefs.debrief_day_of_week, prefs.debrief_time)
      : null;

  const saveLocalDay = (localDay: number) => {
    const localTime = local?.time ?? "09:00";
    const utc = localSlotToUtc(localDay, localTime);
    save({ debrief_day_of_week: utc.day, debrief_time: `${utc.time}:00` });
  };
  const saveLocalTime = (localTime: string) => {
    const localDay = local?.day ?? 0;
    const utc = localSlotToUtc(localDay, localTime);
    save({ debrief_day_of_week: utc.day, debrief_time: `${utc.time}:00` });
  };

  const summary = !prefs.debrief_enabled ? "Off" : local ? `${DAYS[local.day]} ${local.time}` : "Not set";

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs text-muted transition-colors hover:border-accent hover:text-fg"
      >
        <ClockIcon />
        <span>Debrief: {summary}</span>
      </button>

      {open && (
        <div className="absolute right-0 z-40 mt-2 w-72 animate-fade-in-up rounded-xl border border-border bg-panel/95 p-4 shadow-2xl backdrop-blur-sm">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-fg">Weekly debrief</div>
              <div className="text-[11px] text-muted">Auto-generate a report on a schedule</div>
            </div>
            <Toggle checked={prefs.debrief_enabled} onChange={(v) => save({ debrief_enabled: v })} />
          </div>

          <div className={prefs.debrief_enabled ? "" : "pointer-events-none opacity-40"}>
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted">Day</div>
            <div className="mb-3 grid grid-cols-7 gap-1">
              {DAYS.map((d, i) => (
                <button
                  key={d}
                  onClick={() => saveLocalDay(i)}
                  className={`rounded-md py-1.5 text-[11px] font-medium transition-colors ${
                    local?.day === i
                      ? "bg-accent text-on-accent"
                      : "bg-border/50 text-muted hover:bg-border hover:text-fg"
                  }`}
                >
                  {d[0]}
                </button>
              ))}
            </div>

            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
              Time <span className="normal-case text-muted/70">(your local time)</span>
            </div>
            <input
              type="time"
              value={local?.time ?? ""}
              onChange={(e) => e.target.value && saveLocalTime(e.target.value)}
              className="w-full rounded-md border border-border bg-transparent px-2 py-1.5 text-sm text-fg outline-none focus:border-accent"
            />
          </div>

          <div className="mt-3 h-4 text-right text-[11px] text-accent">
            {saved && <span className="animate-fade-in-up">✓ Saved</span>}
          </div>
        </div>
      )}
    </div>
  );
}
