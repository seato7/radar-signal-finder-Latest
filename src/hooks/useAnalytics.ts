import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { track, trackOnce } from "@/lib/analytics";

/** Auto-fires page-view events on route change (PostHog SPA pageview). */
export function useRoutePageView() {
  const location = useLocation();
  const last = useRef<string>("");
  useEffect(() => {
    if (last.current === location.pathname) return;
    last.current = location.pathname;
    if (location.pathname === "/") track("landing_viewed");
    if (
      location.pathname === "/asset-radar" ||
      location.pathname === "/trading-signals" ||
      location.pathname === "/themes"
    ) {
      track("preview_viewed", { surface: location.pathname });
    }
    if (location.pathname === "/pricing") track("pricing_viewed");
    if (location.pathname === "/dashboard") trackOnce("first_dashboard_view");
  }, [location.pathname]);
}

/** IntersectionObserver hook — fires a session-scoped event when the element is 50% visible. */
export function useViewportOnceEvent(
  ref: React.RefObject<Element>,
  event: string,
  props: Record<string, unknown> = {},
) {
  useEffect(() => {
    if (!ref.current) return;
    const el = ref.current;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && e.intersectionRatio >= 0.5) {
            trackOnce(event, props);
            obs.disconnect();
            break;
          }
        }
      },
      { threshold: [0.5] },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [ref, event, JSON.stringify(props)]);
}

/** Scroll + time on surface — used inside the public preview pages. */
export function usePreviewEngagement() {
  useEffect(() => {
    const onScroll = () => {
      const doc = document.documentElement;
      const scrolled = (window.scrollY + window.innerHeight) / doc.scrollHeight;
      if (scrolled >= 0.5) trackOnce("preview_scroll_50");
      if (scrolled >= 0.9) trackOnce("preview_scroll_90");
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    const t30 = window.setTimeout(() => trackOnce("preview_time_30s"), 30_000);
    const t60 = window.setTimeout(() => trackOnce("preview_time_60s"), 60_000);
    return () => {
      window.removeEventListener("scroll", onScroll);
      clearTimeout(t30);
      clearTimeout(t60);
    };
  }, []);
}
