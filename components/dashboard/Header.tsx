"use client";
import { releaseThisDevice } from "@/components/dashboard/PushSetup";
import { Bell, X, HelpCircle, LogOut, Calendar, CreditCard } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { useSession, signOut } from "next-auth/react";
import Link from "next/link";
import { requestPushPermission } from "./PushSetup";
import { Logo } from "@/components/ui/Logo";

interface Notification {
  id: string;
  title: string;
  body: string;
  url: string;
  read: boolean;
  createdAt: string;
}

interface HeaderProps { title: string; subtitle?: string; }

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export function Header({ title, subtitle }: HeaderProps) {
  const [showNotifications, setShowNotifications] = useState(false);
  const [toast, setToast] = useState("");
  const [pushEnabled, setPushEnabled] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);

  const { data: session, update: updateSession } = useSession();
  const userName = session?.user?.name ?? "User";
  const userEmail = session?.user?.email ?? "";
  const initials = userName.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase();

  useEffect(() => {
    setPushEnabled(typeof Notification !== "undefined" && Notification.permission === "granted");
  }, []);

  useEffect(() => {
    const handleVisibility = () => { if (document.visibilityState === "visible") updateSession(); };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [updateSession]);

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/notifications");
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications ?? []);
        setUnreadCount(data.unreadCount ?? 0);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch count on mount and poll every 30s
  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  const openPanel = async () => {
    setShowNotifications(true);
    await fetchNotifications();
    // Mark all as read
    if (unreadCount > 0) {
      await fetch("/api/notifications", { method: "PATCH" });
      setUnreadCount(0);
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    }
  };

  return (
    <>
      <header className="bg-white border-b border-[#e8e6e0] flex items-center px-4 sm:px-6 gap-3 sticky top-0 z-30 safe-header-14">
        {/* Mobile: logo */}
        <Link href="/dashboard" className="lg:hidden flex-shrink-0">
          <Logo width={64} priority />
        </Link>

        {/* Title */}
        <div className="flex-1 min-w-0">
          <h1 className="font-syne font-bold text-[15px] lg:text-lg leading-tight truncate">{title}</h1>
          {subtitle && <p className="text-xs text-[#6b6b80] hidden lg:block">{subtitle}</p>}
        </div>

        {/* Right actions */}
        <div className="flex items-center gap-1">
          {/* Help — desktop only */}
          <button
            onClick={() => { setToast("Help center coming soon!"); setTimeout(() => setToast(""), 3000); }}
            className="hidden lg:flex p-2 rounded-xl text-[#6b6b80] hover:bg-[#f8f7f4] hover:text-[#0f0f1a] transition-colors"
            title="Help"
          >
            <HelpCircle size={18} />
          </button>

          {/* Bell */}
          <button
            onClick={openPanel}
            className="relative p-2 rounded-xl text-[#6b6b80] hover:bg-[#f8f7f4] hover:text-[#0f0f1a] transition-colors"
            title="Notifications"
          >
            <Bell size={18} />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 min-w-[16px] h-4 bg-accent rounded-full border-2 border-white flex items-center justify-center text-[9px] font-bold text-white px-0.5">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
            {unreadCount === 0 && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-accent rounded-full border-2 border-white" />
            )}
          </button>

          {/* Sign out — desktop only */}
          <button
            onClick={async () => { await releaseThisDevice(); await signOut({ callbackUrl: "/login" }); }}
            className="hidden lg:flex p-2 rounded-xl text-[#6b6b80] hover:bg-[#f8f7f4] hover:text-red-500 transition-colors"
            title="Sign out"
          >
            <LogOut size={18} />
          </button>

          {/* Profile chip */}
          <div className="flex items-center gap-2.5 pl-3 ml-1 border-l border-[#e8e6e0]">
            <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
              {initials}
            </div>
            <div className="hidden lg:block min-w-0">
              <p className="text-xs font-semibold text-[#0f0f1a] truncate max-w-[120px]">{userName}</p>
              <p className="text-[10px] text-[#6b6b80] truncate max-w-[120px]">{userEmail}</p>
            </div>
          </div>
        </div>
      </header>

      {/* Toast */}
      {toast && (
        <div className="fixed top-16 right-4 z-50 px-4 py-2 rounded-xl bg-[#0f0f1a] text-white text-xs shadow-lg">
          {toast}
        </div>
      )}

      {/* Notifications panel */}
      {showNotifications && (
        <div className="fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowNotifications(false)} />
          <div className="relative ml-auto w-full max-w-sm h-full bg-white shadow-2xl flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#e8e6e0]">
              <h2 className="font-syne font-bold text-base">Notifications</h2>
              <button onClick={() => setShowNotifications(false)} className="p-1.5 rounded-lg hover:bg-[#f8f7f4] transition-colors text-[#6b6b80]">
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {loading && notifications.length === 0 ? (
                <div className="flex items-center justify-center py-16">
                  <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                </div>
              ) : notifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-8 text-center gap-4 h-full">
                  <Bell size={32} className="text-[#c5c3bf]" />
                  <div>
                    <p className="text-sm font-medium text-[#3d3d4d]">No notifications yet</p>
                    <p className="text-xs text-[#6b6b80] mt-1">New bookings and payment events will appear here.</p>
                  </div>
                  {!pushEnabled && (
                    <button
                      onClick={async () => {
                        const r = await requestPushPermission();
                        if (r.ok) setPushEnabled(true);
                        else alert(r.error);
                      }}
                      className="flex items-center gap-2 px-4 py-2.5 bg-accent text-white text-xs font-semibold rounded-xl hover:bg-accent-hover transition-colors"
                    >
                      <Bell size={14} />
                      Enable push notifications
                    </button>
                  )}
                </div>
              ) : (
                <div className="divide-y divide-[#f0ede8]">
                  {notifications.map(n => (
                    <Link
                      key={n.id}
                      href={n.url}
                      onClick={() => setShowNotifications(false)}
                      className={`flex gap-3 px-5 py-4 hover:bg-[#f8f7f4] transition-colors ${!n.read ? "bg-blue-50/50" : ""}`}
                    >
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${!n.read ? "bg-accent/15" : "bg-[#f0ede8]"}`}>
                        {n.title.toLowerCase().includes("payment") || n.title.toLowerCase().includes("paid")
                          ? <CreditCard size={14} className={!n.read ? "text-accent" : "text-[#6b6b80]"} />
                          : <Calendar size={14} className={!n.read ? "text-accent" : "text-[#6b6b80]"} />
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm leading-snug ${!n.read ? "font-semibold text-[#0f0f1a]" : "font-medium text-[#3d3d4d]"}`}>{n.title}</p>
                        <p className="text-xs text-[#6b6b80] mt-0.5 line-clamp-2">{n.body}</p>
                        <p className="text-[10px] text-[#9b9b9b] mt-1">{timeAgo(n.createdAt)}</p>
                      </div>
                      {!n.read && <div className="w-2 h-2 rounded-full bg-accent flex-shrink-0 mt-2" />}
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {/* Push enable footer */}
            {notifications.length > 0 && !pushEnabled && (
              <div className="border-t border-[#f0ede8] px-5 py-3 bg-sky-50">
                <button
                  onClick={async () => {
                    const r = await requestPushPermission();
                    if (r.ok) setPushEnabled(true);
                    else alert(r.error);
                  }}
                  className="w-full flex items-center justify-center gap-2 py-2 text-xs font-semibold text-sky-700 hover:text-sky-900 transition-colors"
                >
                  <Bell size={13} /> Enable browser push notifications
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
