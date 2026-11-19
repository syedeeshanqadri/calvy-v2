"use client";
import { Suspense, useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * A thin top bar for route changes, no library. It starts the instant a same-site link is clicked or history.pushState/replaceState is called
 * (which is what router.push does) and finishes when the new path or query has rendered. Tiny on purpose: it sits in every page's bundle, tenant sites included.
 */
function Bar() {
  const el = useRef<HTMLDivElement>(null);
  const timer = useRef<number | null>(null);
  const progress = useRef(0);
  const active = useRef(false);

  const paint = (p: number, visible: boolean) => {
    const e = el.current; if (!e) return;
    e.style.transform = `scaleX(${p})`;
    e.style.opacity = visible ? "1" : "0";
  };
  const stop = () => { if (timer.current) { window.clearInterval(timer.current); timer.current = null; } };
  const start = () => {
    if (active.current) return;
    active.current = true; progress.current = 0.08; paint(0.08, true);
    stop();
    timer.current = window.setInterval(() => { progress.current += (0.92 - progress.current) * 0.08; paint(progress.current, true); }, 120);
    window.setTimeout(done, 15000); // never leave the bar hanging
  };
  const done = () => {
    if (!active.current) return;
    active.current = false; stop(); paint(1, true);
    window.setTimeout(() => paint(1, false), 220);
    window.setTimeout(() => { if (!active.current) paint(0, false); }, 480);
  };

  const pathname = usePathname();
  const search = useSearchParams().toString();
  useEffect(() => { done(); }, [pathname, search]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const here = () => location.pathname + location.search;
    const onClick = (ev: MouseEvent) => {
      if (ev.defaultPrevented || ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
      const a = (ev.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || (a.target && a.target !== "_self") || a.hasAttribute("download")) return;
      const u = new URL(a.href, location.href);
      if (u.origin !== location.origin || (u.pathname === location.pathname && u.search === location.search)) return;
      start();
    };
    const wrap = (name: "pushState" | "replaceState") => {
      const orig = history[name];
      history[name] = function (this: History, ...args: Parameters<History["pushState"]>) {
        const next = args[2] ? new URL(String(args[2]), location.href) : null;
        const changes = next && next.origin === location.origin && next.pathname + next.search !== here();
        const r = orig.apply(this, args);
        if (changes) start();
        return r;
      } as History[typeof name];
      return () => { history[name] = orig; };
    };
    document.addEventListener("click", onClick, true);
    const un = [wrap("pushState"), wrap("replaceState")];
    const onPop = () => start();
    window.addEventListener("popstate", onPop);
    return () => { document.removeEventListener("click", onClick, true); window.removeEventListener("popstate", onPop); un.forEach((f) => f()); stop(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={el} aria-hidden="true" className="route-progress" />;
}

export function RouteProgress() {
  return <Suspense fallback={null}><Bar /></Suspense>;
}
