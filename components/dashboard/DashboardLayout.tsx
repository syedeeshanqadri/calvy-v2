"use client";
import { useCallback, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { PULL_THRESHOLD, usePullToRefresh } from "@/lib/usePullToRefresh";
import { REFRESH_EVENT } from "@/lib/useLivePoll";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { TrialBanner } from "./TrialBanner";
import { BottomNav } from "./BottomNav";
import { PushSetup } from "./PushSetup";
import { PushBanner } from "./PushBanner";
import { InstallPrompt } from "./InstallPrompt";
import { cn } from "@/lib/utils";

const NARROW = "(max-width: 1023px)";
function subscribeNarrow(cb: () => void) {
  const m = window.matchMedia(NARROW);
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
}

interface DashboardLayoutProps {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
}

export function DashboardLayout({ children, title, subtitle }: DashboardLayoutProps) {
  // 768px and up shows the sidebar (tablets, phones in landscape); below 1024px it starts icon-only so the content keeps its room.
  const narrow = useSyncExternalStore(subscribeNarrow, () => window.matchMedia(NARROW).matches, () => false);
  const [chosen, setChosen] = useState<boolean | null>(null);
  const router = useRouter();
  const mainRef = useRef<HTMLElement>(null);
  // Phones: pull down at the top to refresh. Today and Queue listen for the event and re-read at once; server data refreshes too.
  const onRefresh = useCallback(async () => { window.dispatchEvent(new Event(REFRESH_EVENT)); router.refresh(); await new Promise((r) => setTimeout(r, 700)); }, [router]);
  const { pull, refreshing } = usePullToRefresh(mainRef, onRefresh);
  const collapsed = chosen ?? narrow;
  const setCollapsed = (v: boolean) => setChosen(v);

  return (
    <div className="flex h-dvh overflow-clip bg-[#f5f5f7]">
      {/* Sidebar: 768px and up. Below that, the bottom nav. */}
      <div className={cn("hidden md:flex flex-col flex-shrink-0 transition-all duration-300", collapsed ? "w-16" : "w-64")}>
        <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
      </div>

      {/* Main */}
      <div className="flex flex-col flex-1 min-w-0 overflow-clip">
        <Header title={title} subtitle={subtitle} />
        <TrialBanner />
        <InstallPrompt />
        <PushBanner />
        <main ref={mainRef} className="flex-1 overflow-y-auto overscroll-contain">
          {(pull > 0 || refreshing) && (
            <div className="flex items-end justify-center overflow-hidden text-sky-600" style={{ height: refreshing ? 40 : pull }} role="status" aria-label={refreshing ? "Refreshing" : "Pull to refresh"}>
              <RefreshCw size={18} className={refreshing ? "animate-spin mb-2" : "mb-2"} style={refreshing ? undefined : { transform: `rotate(${(pull / PULL_THRESHOLD) * 270}deg)`, opacity: Math.min(1, pull / 40) }} />
            </div>
          )}
          <div className="p-4 sm:p-6 pb-mobile-nav md:pb-6 max-w-[1600px] mx-auto">
            {children}
          </div>
        </main>
      </div>

      {/* Mobile bottom nav */}
      <BottomNav />
      <PushSetup />
    </div>
  );
}
