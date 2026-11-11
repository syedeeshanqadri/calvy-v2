"use client";
import { useState } from "react";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { TrialBanner } from "./TrialBanner";
import { BottomNav } from "./BottomNav";
import { PushSetup } from "./PushSetup";
import { PushBanner } from "./PushBanner";
import { InstallPrompt } from "./InstallPrompt";
import { cn } from "@/lib/utils";

interface DashboardLayoutProps {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
}

export function DashboardLayout({ children, title, subtitle }: DashboardLayoutProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="flex h-dvh overflow-clip bg-[#f5f5f7]">
      {/* Sidebar — desktop only */}
      <div className={cn("hidden lg:flex flex-col flex-shrink-0 transition-all duration-300", collapsed ? "w-16" : "w-64")}>
        <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
      </div>

      {/* Main */}
      <div className="flex flex-col flex-1 min-w-0 overflow-clip">
        <Header title={title} subtitle={subtitle} />
        <TrialBanner />
        <InstallPrompt />
        <PushBanner />
        <main className="flex-1 overflow-y-auto overscroll-contain">
          <div className="p-4 sm:p-6 pb-mobile-nav lg:pb-6 max-w-[1600px] mx-auto">
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
