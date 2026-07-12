[1mdiff --git a/backend/app/config.py b/backend/app/config.py[m
[1mindex 4a91d34..ee5a80a 100644[m
[1m--- a/backend/app/config.py[m
[1m+++ b/backend/app/config.py[m
[36m@@ -29,6 +29,12 @@[m [mclass Settings(BaseSettings):[m
     # Embeddings for RAG[m
     voyage_api_key: str = ""[m
 [m
[32m+[m[32m    # LangGraph analyst agent — swappable model provider (see app/services/agent_graph.py)[m
[32m+[m[32m    llm_provider: str = "ollama"  # "anthropic" | "ollama"[m
[32m+[m[32m    anthropic_api_key: str = ""[m
[32m+[m[32m    ollama_base_url: str = "http://localhost:11434"[m
[32m+[m[32m    ollama_model: str = "llama3.1"[m
[32m+[m
     @property[m
     def has_alpaca_creds(self) -> bool:[m
         return bool(self.alpaca_api_key and self.alpaca_secret_key)[m
[36m@@ -37,6 +43,10 @@[m [mclass Settings(BaseSettings):[m
     def has_voyage_creds(self) -> bool:[m
         return bool(self.voyage_api_key)[m
 [m
[32m+[m[32m    @property[m
[32m+[m[32m    def has_anthropic_creds(self) -> bool:[m
[32m+[m[32m        return bool(self.anthropic_api_key)[m
[32m+[m
 [m
 @lru_cache[m
 def get_settings() -> Settings:[m
[1mdiff --git a/backend/app/main.py b/backend/app/main.py[m
[1mindex 9e04d94..1cfc2fe 100644[m
[1m--- a/backend/app/main.py[m
[1m+++ b/backend/app/main.py[m
[36m@@ -7,7 +7,7 @@[m [mfrom fastapi.middleware.cors import CORSMiddleware[m
 [m
 from app.config import get_settings[m
 from app.db import engine[m
[31m-from app.routers import analysis, journal, market, trading, user[m
[32m+[m[32mfrom app.routers import agent, analysis, journal, market, trading, user[m
 from app.routers.market import cancel_stream_task[m
 from app.services.execution_logger import reconcile_recent_fills, run_execution_logger[m
 [m
[36m@@ -58,6 +58,7 @@[m [mapp.include_router(trading.router)[m
 app.include_router(journal.router)[m
 app.include_router(user.router)[m
 app.include_router(analysis.router)[m
[32m+[m[32mapp.include_router(agent.router)[m
 [m
 [m
 @app.get("/api/health")[m
[1mdiff --git a/backend/app/models.py b/backend/app/models.py[m
[1mindex 72a22b6..63882d5 100644[m
[1m--- a/backend/app/models.py[m
[1m+++ b/backend/app/models.py[m
[36m@@ -18,6 +18,9 @@[m [mclass UserPreference(Base):[m
     last_symbol_name: Mapped[str | None] = mapped_column(String(128), default="Apple Inc.")[m
     last_timeframe: Mapped[str] = mapped_column(String(16), default="1Day")[m
 [m
[32m+[m[32m    # Last time the analyst debrief agent ran for this user (see app/routers/agent.py).[m
[32m+[m[32m    last_debrief_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))[m
[32m+[m
 [m
 class Trade(Base):[m
     """[m
[1mdiff --git a/backend/app/schemas.py b/backend/app/schemas.py[m
[1mindex ffb6774..a689dde 100644[m
[1m--- a/backend/app/schemas.py[m
[1m+++ b/backend/app/schemas.py[m
[36m@@ -91,6 +91,35 @@[m [mclass TradeNoteUpdate(BaseModel):[m
     notes: str[m
 [m
 [m
[32m+[m[32m# ---- Analyst agent (LangGraph) ----[m
[32m+[m[32mclass ChartAnnotation(BaseModel):[m
[32m+[m[32m    type: Literal["arrow", "circle", "marker", "line"][m
[32m+[m[32m    time: int  # unix seconds[m
[32m+[m[32m    price: float[m
[32m+[m[32m    label: str | None = None[m
[32m+[m[32m    color: str | None = None[m
[32m+[m
[32m+[m
[32m+[m[32mclass AgentReviewRequest(BaseModel):[m
[32m+[m[32m    from_: datetime = Field(alias="from")[m
[32m+[m[32m    to: datetime[m
[32m+[m[32m    symbol: str | None = None[m
[32m+[m[32m    query: str | None = None[m
[32m+[m
[32m+[m[32m    model_config = {"populate_by_name": True}[m
[32m+[m
[32m+[m
[32m+[m[32mclass AgentReviewResponse(BaseModel):[m
[32m+[m[32m    narrative: str[m
[32m+[m[32m    annotations: list[ChartAnnotation][m
[32m+[m
[32m+[m
[32m+[m[32mclass DebriefStatus(BaseModel):[m
[32m+[m[32m    has_new_trades: bool[m
[32m+[m[32m    new_trade_count: int[m
[32m+[m[32m    last_debrief_at: datetime | None[m
[32m+[m
[32m+[m
 # ---- User preferences ----[m
 class UserPreferenceOut(BaseModel):[m
     last_symbol: str = "AAPL"[m
[1mdiff --git a/backend/pyproject.toml b/backend/pyproject.toml[m
[1mindex 830be90..927a445 100644[m
[1m--- a/backend/pyproject.toml[m
[1m+++ b/backend/pyproject.toml[m
[36m@@ -16,6 +16,10 @@[m [mdependencies = [[m
     "websockets>=13.0",[m
     "pgvector>=0.3",[m
     "voyageai>=0.3",[m
[32m+[m[32m    "langgraph>=0.2",[m
[32m+[m[32m    "langchain-anthropic>=0.3",[m
[32m+[m[32m    "langchain-ollama>=0.2",[m
[32m+[m[32m    "langchain-core>=0.3",[m
 ][m
 [m
 [project.optional-dependencies][m
[1mdiff --git a/frontend/app/journal/page.tsx b/frontend/app/journal/page.tsx[m
[1mindex 8c4fb6e..9d49b51 100644[m
[1m--- a/frontend/app/journal/page.tsx[m
[1m+++ b/frontend/app/journal/page.tsx[m
[36m@@ -1,13 +1,19 @@[m
 "use client";[m
 [m
 import { useEffect, useState } from "react";[m
[31m-import { api, PortfolioHistory } from "@/lib/api";[m
[32m+[m[32mimport { api, DebriefRequest, PortfolioHistory } from "@/lib/api";[m
 import TradeCalendar from "@/components/journal/TradeCalendar";[m
 import JournalEntries from "@/components/journal/JournalEntries";[m
[32m+[m[32mimport AnalystDebrief from "@/components/journal/AnalystDebrief";[m
[32m+[m[32mimport SpotlightOverlay from "@/components/journal/SpotlightOverlay";[m
[32m+[m[32mimport { useDebriefStatus } from "@/lib/useDebriefStatus";[m
 [m
 export default function JournalPage() {[m
   const [history, setHistory] = useState<PortfolioHistory | null>(null);[m
   const [error, setError] = useState<string | null>(null);[m
[32m+[m[32m  const [spotlight, setSpotlight] = useState<string | null>(null);[m
[32m+[m[32m  const [debriefRequest, setDebriefRequest] = useState<DebriefRequest | null>(null);[m
[32m+[m[32m  const { hasNewTrades, newTradeCount, lastDebriefAt, refresh } = useDebriefStatus();[m
 [m
   // History (all-time) drives the calendar's green/red day coloring.[m
   useEffect(() => {[m
[36m@@ -17,6 +23,11 @@[m [mexport default function JournalPage() {[m
       .catch((e) => setError((e as Error).message));[m
   }, []);[m
 [m
[32m+[m[32m  const startDebrief = () => {[m
[32m+[m[32m    const from = lastDebriefAt ?? new Date(Date.now() - 30 * 86400000).toISOString();[m
[32m+[m[32m    setDebriefRequest({ from, to: new Date().toISOString() });[m
[32m+[m[32m  };[m
[32m+[m
   return ([m
     <main className="flex h-full flex-col">[m
       <header className="flex items-center justify-between border-b border-border bg-panel px-4 py-3 shrink-0">[m
[36m@@ -31,16 +42,42 @@[m [mexport default function JournalPage() {[m
           </div>[m
         )}[m
 [m
[32m+[m[32m        {hasNewTrades && !debriefRequest && ([m
[32m+[m[32m          <div className="mb-4 flex items-center justify-between rounded-lg border border-accent/40 bg-accent/10 px-4 py-3 animate-fade-in-up">[m
[32m+[m[32m            <div className="text-sm text-white">[m
[32m+[m[32m              Your analyst has a debrief ready — {newTradeCount} trade{newTradeCount === 1 ? "" : "s"} since your[m
[32m+[m[32m              last review.[m
[32m+[m[32m            </div>[m
[32m+[m[32m            <button[m
[32m+[m[32m              onClick={startDebrief}[m
[32m+[m[32m              className="shrink-0 rounded-md bg-accent px-4 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-accent/80"[m
[32m+[m[32m            >[m
[32m+[m[32m              Start Debrief[m
[32m+[m[32m            </button>[m
[32m+[m[32m          </div>[m
[32m+[m[32m        )}[m
[32m+[m
         {/* Calendar + full journal */}[m
         <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">[m
           <div className="lg:col-span-1">[m
             <TradeCalendar points={history?.points ?? []} />[m
           </div>[m
           <div className="lg:col-span-2">[m
[31m-            <JournalEntries refreshKey={0} />[m
[32m+[m[32m            <JournalEntries refreshKey={0} onDebriefTrade={setDebriefRequest} />[m
           </div>[m
         </div>[m
       </div>[m
[32m+[m
[32m+[m[32m      <SpotlightOverlay targetSelector={spotlight} />[m
[32m+[m
[32m+[m[32m      {debriefRequest && ([m
[32m+[m[32m        <AnalystDebrief[m
[32m+[m[32m          request={debriefRequest}[m
[32m+[m[32m          onClose={() => { setDebriefRequest(null); setSpotlight(null); }}[m
[32m+[m[32m          onSpotlight={setSpotlight}[m
[32m+[m[32m          onFinished={refresh}[m
[32m+[m[32m        />[m
[32m+[m[32m      )}[m
     </main>[m
   );[m
 }[m
[1mdiff --git a/frontend/components/Chart.tsx b/frontend/components/Chart.tsx[m
[1mindex 746c14c..b8987d9 100644[m
[1m--- a/frontend/components/Chart.tsx[m
[1m+++ b/frontend/components/Chart.tsx[m
[36m@@ -126,6 +126,7 @@[m [mexport default function Chart({ candles, liveCandle, annotations = [], symbol =[m
   const chartRef = useRef<IChartApi | null>(null);[m
   const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);[m
   const indicatorSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);[m
[32m+[m[32m  const annotationLinesRef = useRef<ReturnType<ISeriesApi<"Candlestick">["createPriceLine"]>[]>([]);[m
   const [chartReady, setChartReady] = useState(false);[m
   const [drawingState, setDrawingState] = useState<DrawingState>({[m
     isDrawing: false,[m
[36m@@ -207,13 +208,29 @@[m [mexport default function Chart({ candles, liveCandle, annotations = [], symbol =[m
     seriesRef.current.update(toSeriesData(liveCandle));[m
   }, [liveCandle]);[m
 [m
[31m-  // Draw annotation overlays.[m
[32m+[m[32m  // Draw annotation overlays: markers (arrow/circle/marker) via setMarkers,[m
[32m+[m[32m  // and "line" annotations as horizontal price levels via createPriceLine[m
[32m+[m[32m  // (an AI-drawn support/resistance/entry level, not time-bound like markers).[m
   useEffect(() => {[m
     const series = seriesRef.current;[m
     if (!series) return;[m
     series.setMarkers([m
       annotations.filter((a) => a.type !== "line").map(toMarker),[m
     );[m
[32m+[m
[32m+[m[32m    for (const line of annotationLinesRef.current) series.removePriceLine(line);[m
[32m+[m[32m    annotationLinesRef.current = annotations[m
[32m+[m[32m      .filter((a) => a.type === "line")[m
[32m+[m[32m      .map((a) =>[m
[32m+[m[32m        series.createPriceLine({[m
[32m+[m[32m          price: a.price,[m
[32m+[m[32m          color: a.color ?? "#3b82f6",[m
[32m+[m[32m          lineWidth: 2,[m
[32m+[m[32m          lineStyle: 2, // dashed[m
[32m+[m[32m          axisLabelVisible: true,[m
[32m+[m[32m          title: a.label ?? "",[m
[32m+[m[32m        }),[m
[32m+[m[32m      );[m
   }, [annotations]);[m
 [m
   // Compute SMA.[m
[1mdiff --git a/frontend/components/Sidebar.tsx b/frontend/components/Sidebar.tsx[m
[1mindex c77ecf0..198e8ec 100644[m
[1m--- a/frontend/components/Sidebar.tsx[m
[1m+++ b/frontend/components/Sidebar.tsx[m
[36m@@ -2,6 +2,7 @@[m
 [m
 import { usePathname, useRouter } from "next/navigation";[m
 import { UserButton } from "@clerk/nextjs";[m
[32m+[m[32mimport { useDebriefStatus } from "@/lib/useDebriefStatus";[m
 [m
 function IconChart() {[m
   return ([m
[36m@@ -52,6 +53,7 @@[m [mconst NAV_ITEMS = [[m
 export default function Sidebar() {[m
   const router = useRouter();[m
   const pathname = usePathname();[m
[32m+[m[32m  const { hasNewTrades } = useDebriefStatus();[m
 [m
   return ([m
     <nav className="flex flex-col items-center gap-1 border-r border-border bg-panel w-16 py-4 z-30 shrink-0">[m
[36m@@ -60,18 +62,24 @@[m [mexport default function Sidebar() {[m
       </div>[m
       {NAV_ITEMS.map(({ label, href, Icon }) => {[m
         const active = pathname === href;[m
[32m+[m[32m        const showBadge = href === "/journal" && hasNewTrades;[m
         return ([m
           <button[m
             key={href}[m
             onClick={() => router.push(href)}[m
[31m-            title={label}[m
[31m-            className={`flex flex-col items-center gap-1 w-full py-2 px-1 transition-colors ${[m
[32m+[m[32m            title={showBadge ? `${label} — analyst debrief ready` : label}[m
[32m+[m[32m            className={`relative flex flex-col items-center gap-1 w-full py-2 px-1 transition-colors ${[m
               active[m
                 ? "text-accent bg-accent/20"[m
                 : "text-muted hover:text-white hover:bg-accent/10"[m
             }`}[m
           >[m
[31m-            <Icon />[m
[32m+[m[32m            <span className="relative">[m
[32m+[m[32m              <Icon />[m
[32m+[m[32m              {showBadge && ([m
[32m+[m[32m                <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-accent animate-pulse" />[m
[32m+[m[32m              )}[m
[32m+[m[32m            </span>[m
             <span className="text-[10px] font-medium">{label}</span>[m
           </button>[m
         );[m
[1mdiff --git a/frontend/components/journal/JournalEntries.tsx b/frontend/components/journal/JournalEntries.tsx[m
[1mindex c690150..bc2b5a5 100644[m
[1m--- a/frontend/components/journal/JournalEntries.tsx[m
[1m+++ b/frontend/components/journal/JournalEntries.tsx[m
[36m@@ -2,7 +2,7 @@[m
 [m
 import { Fragment, useEffect, useRef, useState } from "react";[m
 import { useRouter } from "next/navigation";[m
[31m-import { api, Trade } from "@/lib/api";[m
[32m+[m[32mimport { api, DebriefRequest, Trade } from "@/lib/api";[m
 [m
 const WINDOWS = [[m
   { label: "1D", days: 1 },[m
[36m@@ -13,7 +13,12 @@[m [mconst WINDOWS = [[m
 [m
 const NOTE_SAVE_DEBOUNCE_MS = 600;[m
 [m
[31m-export default function JournalEntries({ refreshKey }: { refreshKey: number }) {[m
[32m+[m[32minterface JournalEntriesProps {[m
[32m+[m[32m  refreshKey: number;[m
[32m+[m[32m  onDebriefTrade?: (request: DebriefRequest) => void;[m
[32m+[m[32m}[m
[32m+[m
[32m+[m[32mexport default function JournalEntries({ refreshKey, onDebriefTrade }: JournalEntriesProps) {[m
   const router = useRouter();[m
   const [trades, setTrades] = useState<Trade[]>([]);[m
   const [days, setDays] = useState(30);[m
[36m@@ -133,19 +138,27 @@[m [mexport default function JournalEntries({ refreshKey }: { refreshKey: number }) {[m
                                 className="h-28 w-full resize-y rounded-md border border-border bg-panel p-2 text-sm text-white placeholder:text-muted focus:border-accent focus:outline-none"[m
                               />[m
                             </div>[m
[31m-                            {/* AI summary placeholder */}[m
[32m+[m[32m                            {/* AI reflection */}[m
                             <div>[m
                               <div className="mb-1 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted">[m
                                 AI Reflection[m
[31m-                                <span className="rounded bg-accent/20 px-1.5 py-0.5 text-[10px] font-normal text-accent">[m
[31m-                                  Coming soon[m
[31m-                                </span>[m
                               </div>[m
[31m-                              <div className="h-28 overflow-auto rounded-md border border-dashed border-border bg-panel/60 p-2 text-sm text-muted">[m
[31m-                                Once wired up, Claude will read this execution alongside your notes and[m
[31m-                                plan and give you a discipline-focused reflection — e.g. acknowledging[m
[31m-                                that you followed every confluence and stuck to your plan even when the[m
[31m-                                trade closed red.[m
[32m+[m[32m                              <div className="flex h-28 flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border bg-panel/60 p-2 text-center text-sm text-muted">[m
[32m+[m[32m                                <p>Ask uWick to walk through this trade with you on the whiteboard.</p>[m
[32m+[m[32m                                <button[m
[32m+[m[32m                                  onClick={() => {[m
[32m+[m[32m                                    const filled = new Date(t.filled_at);[m
[32m+[m[32m                                    onDebriefTrade?.({[m
[32m+[m[32m                                      from: new Date(filled.getTime() - 3 * 86400000).toISOString(),[m
[32m+[m[32m                                      to: new Date(filled.getTime() + 86400000).toISOString(),[m
[32m+[m[32m                                      symbol: t.symbol,[m
[32m+[m[32m                                      query: `Reflect specifically on my ${t.side} of ${t.symbol} filled at $${t.fill_price} on ${filled.toLocaleDateString()}.`,[m
[32m+[m[32m                                    });[m
[32m+[m[32m                                  }}[m
[32m+[m[32m                                  className="rounded-md bg-accent px-3 py-1 text-xs font-semibold text-white transition-colors hover:bg-accent/80"[m
[32m+[m[32m                                >[m
[32m+[m[32m                                  Debrief this trade[m
[32m+[m[32m                                </button>[m
                               </div>[m
                             </div>[m
                           </div>[m
[1mdiff --git a/frontend/components/journal/TradeCalendar.tsx b/frontend/components/journal/TradeCalendar.tsx[m
[1mindex e7065ed..cab9b6a 100644[m
[1m--- a/frontend/components/journal/TradeCalendar.tsx[m
[1m+++ b/frontend/components/journal/TradeCalendar.tsx[m
[36m@@ -88,6 +88,7 @@[m [mexport default function TradeCalendar({ points }: { points: PortfolioPoint[] })[m
           return ([m
             <div[m
               key={i}[m
[32m+[m[32m              data-daykey={k}[m
               title={hasData ? `${up ? "+" : ""}${fmtUsd(pl!)}` : undefined}[m
               className={`flex aspect-square flex-col items-center justify-center rounded text-xs tabular-nums ${[m
                 hasData[m
[1mdiff --git a/frontend/tailwind.config.ts b/frontend/tailwind.config.ts[m
[1mindex f2a6328..928f77d 100644[m
[1m--- a/frontend/tailwind.config.ts[m
[1m+++ b/frontend/tailwind.config.ts[m
[36m@@ -16,6 +16,25 @@[m [mconst config: Config = {[m
         up: "#26a69a",[m
         down: "#ef5350",[m
       },[m
[32m+[m[32m      keyframes: {[m
[32m+[m[32m        "fade-in-up": {[m
[32m+[m[32m          "0%": { opacity: "0", transform: "translateY(8px)" },[m
[32m+[m[32m          "100%": { opacity: "1", transform: "translateY(0)" },[m
[32m+[m[32m        },[m
[32m+[m[32m        "bounce-dot": {[m
[32m+[m[32m          "0%, 80%, 100%": { transform: "translateY(0)", opacity: "0.5" },[m
[32m+[m[32m          "40%": { transform: "translateY(-4px)", opacity: "1" },[m
[32m+[m[32m        },[m
[32m+[m[32m        "spotlight-in": {[m
[32m+[m[32m          "0%": { opacity: "0", transform: "scale(0.96)" },[m
[32m+[m[32m          "100%": { opacity: "1", transform: "scale(1)" },[m
[32m+[m[32m        },[m
[32m+[m[32m      },[m
[32m+[m[32m      animation: {[m
[32m+[m[32m        "fade-in-up": "fade-in-up 250ms ease-out",[m
[32m+[m[32m        "bounce-dot": "bounce-dot 1.2s ease-in-out infinite",[m
[32m+[m[32m        "spotlight-in": "spotlight-in 300ms ease-out",[m
[32m+[m[32m      },[m
     },[m
   },[m
   plugins: [],[m
