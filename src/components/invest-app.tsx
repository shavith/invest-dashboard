import { useEffect } from "react";
import { cancelRefresh, refreshDesk } from "@/lib/model/refresh";
import { dailyRefreshDue } from "@/lib/model/refresh-policy";
import { FeedView } from "@/components/feed-view";
import { PilotBoard } from "@/components/pilot-board";
import { ReferenceView } from "@/components/reference-view";
import { ResearchDesk } from "@/components/research-desk";
import { RulesView } from "@/components/rules-view";
import { Button } from "@/components/ui/button";
import { UsMarket } from "@/components/us-market";
import { useDesk, type DeskView } from "@/lib/model/store";

const NAV: { id: DeskView; label: string }[] = [
  { id: "board", label: "Pilot board" },
  { id: "listings", label: "US stocks" },
  { id: "research", label: "Research" },
  { id: "rules", label: "Rules" },
  { id: "equations", label: "Equations" },
  { id: "feed", label: "Live feed" },
];

export function InvestApp() {
  const view = useDesk((state) => state.view);
  const setView = useDesk((state) => state.setView);
  const hydrate = useDesk((state) => state.hydrate);
  const resetWorkbook = useDesk((state) => state.resetWorkbook);
  const apiProvider = useDesk((state) => state.apiProvider);
  const lastPull = useDesk((state) => state.lastPull);

  useEffect(() => {
    hydrate();
    const readHash = () => {
      const section = window.location.hash.slice(1);
      const match = NAV.find((item) => item.id === section);
      if (match) setView(match.id);
    };
    readHash();
    window.addEventListener("hashchange", readHash);
    const checkDaily = () => {
      const state = useDesk.getState();
      if (document.visibilityState === "visible" && state.hydrated && state.refresh.phase === "idle" &&
        dailyRefreshDue(state.autoRefresh, state.apiKey, state.apiProvider, state.lastAttempt)) void refreshDesk();
    };
    checkDaily();
    const timer = window.setInterval(checkDaily, 60_000);
    document.addEventListener("visibilitychange", checkDaily);
    return () => { window.clearInterval(timer); window.removeEventListener("hashchange", readHash); document.removeEventListener("visibilitychange", checkDaily); };
  }, [hydrate, setView]);

  return (
    <div className="min-h-screen bg-bg text-fg">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-5 md:px-6">
          <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
            <div className="min-w-0">
              <p className="font-mono text-xs tracking-widest text-brass">INVEST</p>
              <h1 className="font-serif text-3xl leading-none sm:text-4xl">Ranking desk</h1>
            </div>
            <div className="text-sm">
              <p className="text-faint">{lastPull ? liveLabel(lastPull.at) : "Snapshot 3 Oct 2026"}</p>
              <p className="text-muted">{apiProvider === "Not connected" ? "Manual inputs" : lastPull ? `${lastPull.provider} · refreshed` : apiProvider}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <nav className="flex flex-wrap gap-2" aria-label="Sections">
              {NAV.map((item) => (
                <Button key={item.id} variant={view === item.id ? "primary" : "ghost"} onClick={() => { setView(item.id); window.location.hash = item.id; }}>
                  {item.label}
                </Button>
              ))}
            </nav>
            <Button variant="ghost" className="shrink-0" onClick={() => { cancelRefresh(); resetWorkbook(); }}>
              Reset
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto min-w-0 max-w-6xl px-4 py-6 md:px-6">
        {view === "board" ? <PilotBoard /> : null}
        {view === "listings" ? <UsMarket /> : null}
        {view === "research" ? <ResearchDesk /> : null}
        {view === "rules" ? <RulesView /> : null}
        {view === "equations" ? <ReferenceView /> : null}
        {view === "feed" ? <FeedView /> : null}
      </main>
    </div>
  );
}

function liveLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Refresh recorded";
  return `Refreshed ${date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}`;
}
