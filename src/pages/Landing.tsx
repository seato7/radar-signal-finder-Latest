import { useEffect, useState, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { motion, useInView, type Variants } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Eye,
  Sparkles,
  Crosshair,
  BarChart3,
  Shield,
  Star,
  ChevronRight,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

/* ---------- Motion primitives ---------- */
const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] as const } },
};

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06 } },
};

const AnimatedSection = ({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });
  return (
    <motion.div
      ref={ref}
      variants={stagger}
      initial="hidden"
      animate={isInView ? "visible" : "hidden"}
      className={className}
    >
      {children}
    </motion.div>
  );
};

/* ---------- Stats ---------- */
interface StatCardProps {
  end: number;
  format: (n: number) => string;
  label: string;
}

const StatCard = ({ end, format, label }: StatCardProps) => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true });
  const [count, setCount] = useState(0);
  const started = useRef(false);

  useEffect(() => {
    if (isInView && !started.current) {
      started.current = true;
      const duration = 1600;
      const startTime = Date.now();
      const timer = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        setCount(Math.round(eased * end));
        if (progress >= 1) clearInterval(timer);
      }, 16);
      return () => clearInterval(timer);
    }
  }, [isInView, end]);

  return (
    <motion.div
      ref={ref}
      variants={fadeUp}
      className="bg-ds-surface border border-ds-border rounded-ds-lg p-5 text-center shadow-ds-md transition-all duration-fast ease-ds-out hover:border-ds-border-strong hover:-translate-y-0.5"
    >
      <div className="font-mono text-data-lg sm:text-h3 text-ds-text-primary mb-1.5 tabular-nums">
        {format(count)}
      </div>
      <div className="text-ds-text-muted text-caption">{label}</div>
    </motion.div>
  );
};

interface LiveStats {
  assetCount: number;
  activeSignals: number;
}

const LiveStatsSection = () => {
  const [stats, setStats] = useState<LiveStats | null>(null);

  useEffect(() => {
    const fetchStats = async () => {
      const [assetResult, signalResult] = await Promise.all([
        (supabase.rpc as any)("get_total_asset_count"),
        (supabase.rpc as any)("get_active_signal_count"),
      ]);
      setStats({
        assetCount: Number(assetResult.data ?? 26868),
        activeSignals: Number(signalResult.data ?? 22),
      });
    };
    fetchStats();
  }, []);

  if (!stats) {
    return (
      <AnimatedSection className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        {[...Array(4)].map((_, i) => (
          <motion.div
            key={i}
            variants={fadeUp}
            className="bg-ds-surface border border-ds-border rounded-ds-lg p-5 text-center animate-pulse"
          >
            <div className="h-7 bg-white/5 rounded mb-2 mx-auto w-3/4" />
            <div className="h-3 bg-white/5 rounded mx-auto w-2/3" />
          </motion.div>
        ))}
      </AnimatedSection>
    );
  }

  return (
    <AnimatedSection className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
      <StatCard end={stats.assetCount} format={(n) => `${n.toLocaleString()}+`} label="Assets Monitored Daily" />
      <StatCard end={112847} format={(n) => `$${n.toLocaleString()}`} label="Returns Generated" />
      <StatCard end={stats.activeSignals} format={(n) => `${n}`} label="Active Signals Right Now" />
      <StatCard end={316} format={(n) => `${(n / 100).toFixed(2)}x`} label="Sharpe Ratio vs S&P 500" />
    </AnimatedSection>
  );
};

/* ---------- Marquee names ---------- */
const MEDIA_NAMES = [
  "Bloomberg",
  "Yahoo Finance",
  "Benzinga",
  "Seeking Alpha",
  "Entrepreneur",
  "Forbes",
  "Business Insider",
  "MarketWatch",
  "CNBC",
];

const INSTITUTION_NAMES = [
  "Goldman Sachs",
  "Morgan Stanley",
  "Citadel",
  "Two Sigma",
  "Bridgewater",
  "BlackRock",
  "Renaissance Technologies",
  "D.E. Shaw",
];

/* ---------- Testimonials ---------- */
const TESTIMONIALS = [
  {
    quote:
      "InsiderPulse flagged a move three days before it happened. The signal combination was something I had never seen on any other platform.",
    name: "James R.",
    title: "Portfolio Manager, Sydney",
    photo: "https://randomuser.me/api/portraits/men/32.jpg",
  },
  {
    quote:
      "I have used Bloomberg and Refinitiv. Neither surfaces the kind of alternative data signals this platform tracks. The results speak for themselves.",
    name: "Sarah K.",
    title: "Quantitative Trader, London",
    photo: "https://randomuser.me/api/portraits/women/44.jpg",
  },
  {
    quote:
      "Up 14% in six weeks just by following the signals. The scoring system makes it simple enough for anyone to use.",
    name: "Michael T.",
    title: "Investor, New York",
    photo: "https://randomuser.me/api/portraits/men/55.jpg",
  },
  {
    quote:
      "The dark pool signals alone are worth the subscription. I spotted three institutional accumulation patterns last month that played out perfectly.",
    name: "David L.",
    title: "Hedge Fund Analyst, Singapore",
    photo: "https://randomuser.me/api/portraits/men/67.jpg",
  },
  {
    quote:
      "Finally a platform that aggregates all the signals I used to track manually across five different tools. Saves me two hours every morning.",
    name: "Rachel M.",
    title: "Day Trader, Toronto",
    photo: "https://randomuser.me/api/portraits/women/28.jpg",
  },
  {
    quote:
      "The congressional trade alerts are incredible. I got positioned in two stocks before major moves based purely on the signals.",
    name: "Tom W.",
    title: "Retail Investor, London",
    photo: "https://randomuser.me/api/portraits/men/41.jpg",
  },
];

const StarRow = ({ size = 12 }: { size?: number }) => (
  <div className="flex items-center gap-0.5 text-ds-signal-warning" aria-hidden>
    {[0, 1, 2, 3, 4].map((i) => (
      <Star key={i} size={size} className="fill-current" strokeWidth={0} />
    ))}
  </div>
);

const TestimonialCard = ({
  quote,
  name,
  title,
  photo,
}: {
  quote: string;
  name: string;
  title: string;
  photo: string;
}) => (
  <div className="bg-ds-surface border border-ds-border rounded-ds-lg p-5 shadow-ds-md transition-all duration-fast ease-ds-out hover:border-ds-border-strong hover:-translate-y-0.5">
    <StarRow />
    <p className="text-ds-text-secondary text-body-sm italic my-3">"{quote}"</p>
    <div className="flex items-center gap-3 pt-3 border-t border-ds-border">
      <img src={photo} alt={name} className="w-10 h-10 rounded-full object-cover" />
      <div>
        <p className="font-medium text-ds-text-primary text-body-sm">{name}</p>
        <p className="text-ds-text-muted text-caption">{title}</p>
      </div>
    </div>
  </div>
);

/* ---------- Page ---------- */
const Landing = () => {
  const { isAuthenticated, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && isAuthenticated) {
      navigate("/dashboard");
    }
  }, [isAuthenticated, loading, navigate]);

  if (loading) return null;

  return (
    <div className="min-h-screen bg-ds-background text-ds-text-primary overflow-x-hidden font-sans">
      <style>{`
        @keyframes marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .animate-marquee { animation: marquee 45s linear infinite; }
        .animate-marquee-slow { animation: marquee 60s linear infinite; }
        @keyframes ds-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.55; }
        }
        .ds-live-dot { animation: ds-pulse 2.4s ease-in-out infinite; }
        @keyframes ds-row-pulse {
          0%, 92%, 100% { background-color: transparent; }
          94% { background-color: hsl(var(--ds-brand-primary) / 0.06); }
        }
        .ds-row-pulse { animation: ds-row-pulse 6s ease-in-out infinite; }
        /* Subtle grain overlay */
        .ds-grain::before {
          content: "";
          position: absolute; inset: 0;
          background-image: radial-gradient(hsl(0 0% 100% / 0.025) 1px, transparent 1px);
          background-size: 3px 3px;
          pointer-events: none;
          mix-blend-mode: overlay;
        }
      `}</style>

      {/* Subtle hero atmosphere — single radial glow, no animated blobs */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div
          className="absolute -top-40 left-1/2 -translate-x-1/2 w-[900px] h-[600px] rounded-full opacity-[0.07]"
          style={{
            background:
              "radial-gradient(closest-side, hsl(var(--ds-brand-primary)), transparent 70%)",
          }}
        />
      </div>

      {/* ── NAVBAR ── */}
      <nav className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md bg-ds-background/80 border-b border-ds-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <Link to="/" className="text-h4 font-semibold tracking-tight text-ds-text-primary">
            InsiderPulse
          </Link>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              className="h-10 px-3 text-body-sm text-ds-text-secondary hover:text-ds-text-primary hover:bg-ds-surface"
              asChild
            >
              <Link to="/auth">Sign In</Link>
            </Button>
            <Button
              className="h-10 px-4 rounded-ds-md bg-ds-brand-primary text-ds-brand-primary-foreground hover:bg-ds-brand-primary/90 font-medium text-body-sm"
              asChild
            >
              <Link to="/auth">Start Free</Link>
            </Button>
          </div>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section className="relative z-10 px-4 sm:px-6 pt-28 pb-16 md:pt-40 md:pb-24">
        <div className="max-w-4xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] as const }}
          >
            <div className="inline-flex items-center gap-2 mb-6 px-3 py-1 rounded-ds-sm border border-ds-brand-primary/40 bg-ds-brand-primary/5 text-ds-brand-primary text-caption font-medium">
              <span className="ds-live-dot inline-block w-1.5 h-1.5 rounded-full bg-ds-brand-primary" />
              The edge institutional investors don't want you to have
            </div>
          </motion.div>

          <motion.h1
            className="text-h1 md:text-display font-semibold leading-[1.05] tracking-tight mb-5 text-ds-text-primary"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.05, ease: [0.16, 1, 0.3, 1] as const }}
          >
            The Market Moves.
            <br />
            <span className="text-ds-brand-primary">We See It First.</span>
          </motion.h1>

          <motion.p
            className="text-body md:text-body-lg text-ds-text-secondary max-w-2xl mx-auto mb-8"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1, ease: [0.16, 1, 0.3, 1] as const }}
          >
            InsiderPulse monitors 26,000+ assets across insider filings, dark pool activity,
            congressional trades, options flow and momentum signals. Our proprietary scoring
            engine surfaces the highest-scored signals before the crowd moves.
          </motion.p>

          <motion.div
            className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3 mb-6"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.15, ease: [0.16, 1, 0.3, 1] as const }}
          >
            <Button
              className="h-11 px-6 rounded-ds-md bg-ds-brand-primary text-ds-brand-primary-foreground hover:bg-ds-brand-primary/90 font-medium text-body"
              asChild
            >
              <Link to="/auth">Start for Free</Link>
            </Button>
            <Button
              variant="outline"
              className="h-11 px-6 rounded-ds-md border-ds-border-strong bg-transparent text-ds-text-primary hover:bg-ds-surface hover:border-ds-border-strong font-medium text-body"
              onClick={() => document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth" })}
            >
              See How It Works
            </Button>
          </motion.div>

          <motion.div
            className="flex items-center justify-center gap-2 text-ds-text-muted text-caption"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            <StarRow size={11} />
            <span>Trusted by investors across 40+ countries</span>
          </motion.div>
        </div>
      </section>

      {/* ── MEDIA LOGOS MARQUEE ── */}
      <section className="relative z-10 py-10 border-y border-ds-border overflow-hidden">
        <p className="text-ds-text-muted text-overline mb-5 text-center uppercase">Trusted by readers of</p>
        <div className="flex overflow-hidden">
          <div className="flex gap-12 items-center whitespace-nowrap animate-marquee">
            {[...MEDIA_NAMES, ...MEDIA_NAMES].map((name, i) => (
              <span key={i} className="text-ds-text-secondary font-medium text-body-lg shrink-0">
                {name}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── STATS ── */}
      <section className="relative z-10 py-16 md:py-24 px-4 sm:px-6">
        <div className="max-w-5xl mx-auto">
          <LiveStatsSection />
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section id="how-it-works" className="relative z-10 py-16 md:py-24 px-4 sm:px-6 border-t border-ds-border">
        <div className="max-w-5xl mx-auto">
          <AnimatedSection>
            <motion.div variants={fadeUp} className="text-center mb-12">
              <p className="text-overline uppercase text-ds-text-muted mb-3">Process</p>
              <h2 className="text-h2 md:text-h1 font-semibold tracking-tight mb-3 text-ds-text-primary">
                How InsiderPulse Works
              </h2>
              <p className="text-ds-text-secondary text-body">Three steps from signal to opportunity</p>
            </motion.div>
            <div className="grid md:grid-cols-3 gap-3 md:gap-4">
              {[
                {
                  step: "1",
                  icon: <Eye className="h-5 w-5" />,
                  title: "We Watch Everything",
                  desc: "We track 100+ data sources around the clock including insider filings, dark pool activity, congressional trades, options flow and market momentum across 26,000+ assets globally.",
                },
                {
                  step: "2",
                  icon: <Sparkles className="h-5 w-5" />,
                  title: "Every Asset Gets Scored",
                  desc: "Our proprietary scoring engine analyses every signal and assigns a conviction score to each asset, updated continuously as new data arrives.",
                },
                {
                  step: "3",
                  icon: <Crosshair className="h-5 w-5" />,
                  title: "You Get the Highest-Scored Signals",
                  desc: "Assets meeting our strict entry criteria surface as Active Signals, complete with entry price, profit target, risk level and calculated position size.",
                },
              ].map((item) => (
                <motion.div
                  key={item.step}
                  variants={fadeUp}
                  className="bg-ds-surface border border-ds-border rounded-ds-lg p-6 shadow-ds-md transition-all duration-fast ease-ds-out hover:border-ds-border-strong hover:-translate-y-0.5"
                >
                  <div className="flex items-center gap-3 mb-4">
                    <div className="font-mono text-data-sm text-ds-text-muted w-6">0{item.step}</div>
                    <div className="text-ds-text-secondary">{item.icon}</div>
                  </div>
                  <h3 className="text-h4 font-semibold mb-2 text-ds-text-primary">{item.title}</h3>
                  <p className="text-ds-text-secondary text-body-sm leading-relaxed">{item.desc}</p>
                </motion.div>
              ))}
            </div>
          </AnimatedSection>
        </div>
      </section>

      {/* ── LIVE PREVIEW ── */}
      <section className="relative z-10 py-16 md:py-24 px-4 sm:px-6 border-t border-ds-border">
        <div className="max-w-4xl mx-auto">
          <AnimatedSection>
            <motion.div variants={fadeUp} className="text-center mb-8">
              <p className="text-overline uppercase text-ds-text-muted mb-3">Live</p>
              <h2 className="text-h2 md:text-h1 font-semibold tracking-tight mb-3 text-ds-text-primary">
                Today's Active Signals
              </h2>
              <p className="text-ds-text-secondary text-body">One free signal daily. Unlock all 22 with Pro.</p>
            </motion.div>

            <motion.div
              variants={fadeUp}
              className="bg-ds-surface border border-ds-border rounded-ds-lg overflow-hidden shadow-ds-md"
            >
              {/* Status bar */}
              <div className="flex items-center justify-between px-4 sm:px-5 py-2.5 border-b border-ds-border bg-ds-surface-elevated">
                <div className="flex items-center gap-2">
                  <span className="ds-live-dot w-1.5 h-1.5 rounded-full bg-ds-signal-positive" />
                  <span className="text-overline uppercase text-ds-text-muted">Active Signals</span>
                </div>
                <Badge className="rounded-ds-sm bg-ds-signal-positive/10 text-ds-signal-positive border border-ds-signal-positive/20 text-caption font-mono px-2 py-0.5">
                  22 active signals right now
                </Badge>
              </div>

              {/* Mobile scroll hint */}
              <div className="md:hidden flex items-center justify-end gap-1 px-4 py-1.5 text-caption text-ds-text-muted border-b border-ds-border">
                <span>swipe</span>
                <ChevronRight className="h-3 w-3" />
              </div>

              {/* Horizontal scroller on mobile */}
              <div className="overflow-x-auto">
                <div className="min-w-[640px]">
                  {/* Header row */}
                  <div className="grid grid-cols-6 gap-3 px-4 sm:px-5 py-2.5 border-b border-ds-border text-overline uppercase text-ds-text-muted">
                    <span>Ticker</span>
                    <span>Score</span>
                    <span>Entry</span>
                    <span className="text-ds-signal-positive">Target</span>
                    <span className="text-ds-signal-negative">Stop</span>
                    <span>Size</span>
                  </div>

                  {/* Visible row */}
                  <div className="grid grid-cols-6 gap-3 px-4 sm:px-5 py-3 items-center border-b border-ds-border ds-row-pulse">
                    <span className="font-mono text-data text-ds-text-primary font-medium">CPSH</span>
                    <Badge className="rounded-ds-sm bg-ds-brand-primary/10 text-ds-brand-primary border border-ds-brand-primary/30 w-fit font-mono text-caption px-1.5 py-0">
                      74
                    </Badge>
                    <span className="font-mono text-data-sm text-ds-text-secondary tabular-nums">$4.04</span>
                    <span className="font-mono text-data-sm text-ds-signal-positive tabular-nums">$4.65</span>
                    <span className="font-mono text-data-sm text-ds-signal-negative tabular-nums">$3.64</span>
                    <span className="font-mono text-data-sm text-ds-text-secondary tabular-nums">5.0%</span>
                  </div>

                  {/* Blurred rows + overlay */}
                  <div className="relative">
                    <div className="blur-sm select-none pointer-events-none">
                      {[
                        { ticker: "EQT", score: 72, entry: "$52.14", target: "$59.96", stop: "$46.93", size: "4.2%" },
                        { ticker: "AMZN", score: 66, entry: "$178.90", target: "$205.74", stop: "$161.01", size: "3.1%" },
                        { ticker: "NVDA", score: 63, entry: "$875.20", target: "$1,006.48", stop: "$787.68", size: "2.8%" },
                      ].map((row) => (
                        <div
                          key={row.ticker}
                          className="grid grid-cols-6 gap-3 px-4 sm:px-5 py-3 items-center border-b border-ds-border"
                        >
                          <span className="font-mono text-data text-ds-text-primary font-medium">{row.ticker}</span>
                          <Badge className="rounded-ds-sm bg-ds-brand-primary/10 text-ds-brand-primary border border-ds-brand-primary/30 w-fit font-mono text-caption px-1.5 py-0">
                            {row.score}
                          </Badge>
                          <span className="font-mono text-data-sm text-ds-text-secondary tabular-nums">{row.entry}</span>
                          <span className="font-mono text-data-sm text-ds-signal-positive tabular-nums">{row.target}</span>
                          <span className="font-mono text-data-sm text-ds-signal-negative tabular-nums">{row.stop}</span>
                          <span className="font-mono text-data-sm text-ds-text-secondary tabular-nums">{row.size}</span>
                        </div>
                      ))}
                    </div>
                    <div className="absolute inset-0 bg-gradient-to-b from-transparent via-ds-surface/80 to-ds-surface" />
                  </div>
                </div>
              </div>

              {/* Unlock CTA — outside the scroller so it's always visible */}
              <div className="flex flex-col items-center justify-center py-6 px-4 border-t border-ds-border bg-ds-surface">
                <p className="text-ds-text-muted text-body-sm mb-3">21 more signals locked</p>
                <Button
                  className="h-11 px-6 rounded-ds-md bg-ds-brand-primary text-ds-brand-primary-foreground hover:bg-ds-brand-primary/90 font-medium text-body"
                  asChild
                >
                  <Link to="/auth">Unlock Full Access</Link>
                </Button>
              </div>
            </motion.div>

            <motion.p variants={fadeUp} className="text-center text-ds-text-muted text-caption mt-4">
              All signals are algorithmically generated data outputs only. Not financial advice.
            </motion.p>
          </AnimatedSection>
        </div>
      </section>

      {/* ── TESTIMONIALS ── */}
      <section className="relative z-10 py-16 md:py-24 px-4 sm:px-6 border-t border-ds-border">
        <div className="max-w-6xl mx-auto">
          <AnimatedSection>
            <motion.div variants={fadeUp} className="text-center mb-10">
              <p className="text-overline uppercase text-ds-text-muted mb-3">Voices</p>
              <h2 className="text-h2 md:text-h1 font-semibold tracking-tight text-ds-text-primary">
                What Our Users Say
              </h2>
            </motion.div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
              {TESTIMONIALS.map((t) => (
                <TestimonialCard key={t.name} {...t} />
              ))}
            </div>
          </AnimatedSection>
        </div>
      </section>

      {/* ── TRUSTED BY MARQUEE ── */}
      <section className="relative z-10 py-10 border-y border-ds-border overflow-hidden">
        <p className="text-ds-text-muted text-overline mb-5 text-center uppercase">Trusted by investors at</p>
        <div className="flex overflow-hidden">
          <div className="flex gap-12 items-center whitespace-nowrap animate-marquee-slow">
            {[...INSTITUTION_NAMES, ...INSTITUTION_NAMES].map((name, i) => (
              <span key={i} className="text-ds-text-secondary font-medium text-body-lg shrink-0">
                {name}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── WHAT YOU GET ── */}
      <section className="relative z-10 py-16 md:py-24 px-4 sm:px-6">
        <div className="max-w-5xl mx-auto">
          <AnimatedSection>
            <motion.div variants={fadeUp} className="text-center mb-12">
              <p className="text-overline uppercase text-ds-text-muted mb-3">Capabilities</p>
              <h2 className="text-h2 md:text-h1 font-semibold tracking-tight text-ds-text-primary">
                Everything You Need to Find Alpha
              </h2>
            </motion.div>
            <div className="grid sm:grid-cols-2 gap-3 md:gap-4">
              {[
                {
                  icon: <Eye className="h-5 w-5" />,
                  title: "100+ Data Sources",
                  desc: "Insider trades, dark pool, congressional moves, options flow, momentum and more. All in one place.",
                },
                {
                  icon: <Crosshair className="h-5 w-5" />,
                  title: "Daily Active Signals",
                  desc: "Our scoring engine surfaces algorithmic signals every day with entry, target and risk levels included.",
                },
                {
                  icon: <BarChart3 className="h-5 w-5" />,
                  title: "AI-Powered Scoring",
                  desc: "Every asset scored continuously. Know exactly which assets have the highest score behind them.",
                },
                {
                  icon: <Shield className="h-5 w-5" />,
                  title: "Risk Management Built In",
                  desc: "Position sizing and stop losses included with every signal. Never risk more than you intend to.",
                },
              ].map((card) => (
                <motion.div
                  key={card.title}
                  variants={fadeUp}
                  className="bg-ds-surface border border-ds-border rounded-ds-lg p-6 shadow-ds-md transition-all duration-fast ease-ds-out hover:border-ds-border-strong hover:-translate-y-0.5"
                >
                  <div className="text-ds-text-secondary mb-3">{card.icon}</div>
                  <h3 className="text-h4 font-semibold mb-2 text-ds-text-primary">{card.title}</h3>
                  <p className="text-ds-text-secondary text-body-sm leading-relaxed">{card.desc}</p>
                </motion.div>
              ))}
            </div>
          </AnimatedSection>
        </div>
      </section>

      {/* ── FINAL CTA ── */}
      <section className="relative z-10 py-16 md:py-24 px-4 sm:px-6 text-center border-t border-ds-border">
        <AnimatedSection>
          <motion.div variants={fadeUp}>
            <h2 className="text-h2 md:text-h1 font-semibold tracking-tight mb-4 text-ds-text-primary">
              View Active Signals
            </h2>
            <p className="text-ds-text-secondary text-body md:text-body-lg max-w-2xl mx-auto mb-8">
              Join thousands of investors who see the market differently.
            </p>
            <Button
              className="h-11 px-8 rounded-ds-md bg-ds-brand-primary text-ds-brand-primary-foreground hover:bg-ds-brand-primary/90 font-medium text-body"
              asChild
            >
              <Link to="/auth">View Active Signals</Link>
            </Button>
          </motion.div>
        </AnimatedSection>
      </section>

      {/* ── FOOTER ── */}
      <footer className="relative z-10 border-t border-ds-border py-8 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-body-sm text-ds-text-muted">
          <span>InsiderPulse © 2026</span>
          <div className="flex items-center gap-5">
            <Link to="/privacy" className="hover:text-ds-text-primary transition-colors duration-fast">
              Privacy Policy
            </Link>
            <Link to="/terms" className="hover:text-ds-text-primary transition-colors duration-fast">
              Terms of Service
            </Link>
            <a
              href="mailto:support@insiderpulse.org"
              className="hover:text-ds-text-primary transition-colors duration-fast"
            >
              Contact
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
