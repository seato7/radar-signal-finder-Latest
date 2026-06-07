import { useEffect, useState, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthModal } from "@/contexts/AuthModalContext";
import { motion, useInView, type Variants } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Eye, Sparkles, Crosshair, BarChart3, Shield, Star, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

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


/* Motion primitives */
const fadeUp: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] as const } },
};

const stagger: Variants = {
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

/* Live stats */
interface LiveStats {
  assetCount: number;
  activeSignals: number;
}

/* Testimonials */
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

/* Page */
const Landing = () => {
  const { isAuthenticated, loading } = useAuth();
  const { openAuthModal } = useAuthModal();
  const navigate = useNavigate();
  const [stats, setStats] = useState<LiveStats | null>(null);

  useEffect(() => {
    if (!loading && isAuthenticated) {
      navigate("/dashboard");
    }
  }, [isAuthenticated, loading, navigate]);

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

  if (loading) return null;

  const activeCount = stats?.activeSignals ?? 22;
  const hiddenCount = Math.max(0, activeCount - 1);

  return (
    <div className="min-h-screen bg-ds-background text-ds-text-primary overflow-x-hidden font-sans">
      <style>{`
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
        @keyframes marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .animate-marquee { animation: marquee 45s linear infinite; }
        .animate-marquee-slow { animation: marquee 60s linear infinite; }
      `}</style>


      {/* Subtle hero atmosphere */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div
          className="absolute -top-40 left-1/2 -translate-x-1/2 w-[900px] h-[600px] rounded-full opacity-[0.07]"
          style={{
            background:
              "radial-gradient(closest-side, hsl(var(--ds-brand-primary)), transparent 70%)",
          }}
        />
      </div>

      {/* NAVBAR */}
      <nav className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md bg-ds-background/80 border-b border-ds-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <Link to="/" className="text-h4 font-semibold tracking-tight text-ds-text-primary">
            InsiderPulse
          </Link>
          <div className="flex items-center gap-2">
            {/* Preview-first funnel: ANY anonymous landing CTA — including
                Sign In — routes to /asset-radar. The auth modal is reserved for
                interactions inside the preview surfaces (header, sticky bar,
                lock-points, sidebar). See mem://constraints/preview-first-funnel */}
            <Button
              variant="ghost"
              className="h-10 px-3 text-body-sm text-ds-text-secondary hover:text-ds-text-primary hover:bg-ds-surface"
              asChild
            >
              <Link to="/asset-radar">Sign In</Link>
            </Button>
            {/* Preview-first funnel: primary CTAs route to /asset-radar, NOT
                /auth?mode=signup. See mem://constraints/preview-first-funnel */}
            <Button
              className="h-10 px-4 rounded-ds-md bg-ds-brand-primary text-ds-brand-primary-foreground hover:bg-ds-brand-primary/90 font-medium text-body-sm"
              asChild
            >
              <Link to="/asset-radar">Start Free</Link>
            </Button>
          </div>
        </div>
      </nav>

      {/* STICKY BAR */}
      <div
        className="fixed top-14 left-0 right-0 z-40 bg-ds-brand-primary border-b border-ds-brand-primary/60"
        style={{ boxShadow: "0 4px 24px -4px hsl(var(--ds-brand-primary) / 0.55)" }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-12 flex items-center justify-center gap-3 sm:gap-4 text-body-sm">
          <span className="ds-live-dot inline-block w-2 h-2 rounded-full bg-ds-brand-primary-foreground shrink-0" />
          <span className="text-ds-brand-primary-foreground font-medium tracking-tight text-center">
            Free access shows 3 assets.{" "}
            <span className="font-semibold">Premium unlocks 26,000+.</span>
          </span>
          <Link
            to="/asset-radar"
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-ds-brand-primary-foreground text-ds-brand-primary text-caption sm:text-body-sm font-semibold hover:opacity-90 transition-opacity whitespace-nowrap shrink-0"
          >
            See Live Preview
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>


      {/* HERO */}
      <section className="relative z-10 px-4 sm:px-6 pt-36 pb-16 md:pt-48 md:pb-28">
        <div className="max-w-4xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] as const }}
          >
            <div className="inline-flex items-center gap-2 mb-6 px-3 py-1 rounded-ds-sm border border-ds-brand-primary/40 bg-ds-brand-primary/5 text-ds-brand-primary text-caption font-medium">
              <span className="ds-live-dot inline-block w-1.5 h-1.5 rounded-full bg-ds-brand-primary" />
              Real-Time Market Data Across 26,000+ Assets
            </div>
          </motion.div>

          <motion.h1
            className="text-h1 md:text-display font-semibold leading-[1.05] tracking-tight mb-5 text-ds-text-primary"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.05, ease: [0.16, 1, 0.3, 1] as const }}
          >
            See what the market is
            <br />
            <span className="text-ds-brand-primary">doing right now</span>
          </motion.h1>

          <motion.p
            className="text-body md:text-body-lg text-ds-text-secondary max-w-2xl mx-auto mb-8"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1, ease: [0.16, 1, 0.3, 1] as const }}
          >
            InsiderPulse watches insider trades filed with the SEC, congressional stock
            disclosures, options flow, dark pool activity and momentum data across 26,000+
            assets. Scored in real time. One view.
          </motion.p>

          <motion.div
            className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3 mb-6"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.15, ease: [0.16, 1, 0.3, 1] as const }}
          >
            {/* Preview-first funnel — see mem://constraints/preview-first-funnel */}
            <Button
              className="h-11 px-6 rounded-ds-md bg-ds-brand-primary text-ds-brand-primary-foreground hover:bg-ds-brand-primary/90 font-medium text-body"
              asChild
            >
              <Link to="/asset-radar">Start Free Access</Link>
            </Button>
          </motion.div>

          <motion.div
            className="flex items-center justify-center gap-2 text-ds-text-muted text-caption"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            <StarRow size={11} />
            <span>Used by investors across 40+ countries</span>
          </motion.div>
        </div>
      </section>

      {/* MEDIA LOGOS MARQUEE */}
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

      {/* STATS BAND */}

      <section className="relative z-10 py-12 md:py-16 px-4 sm:px-6 border-t border-ds-border">
        <div className="max-w-6xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
          {[
            { big: `${(stats?.assetCount ?? 26868).toLocaleString()}+`, label: "Assets Monitored Daily" },
            { big: "100+", label: "Data Sources Tracked" },
            { big: "156,000+", label: "Signals Processed Since January 2026" },
            { big: "Real Time", label: "Continuous Scoring" },

          ].map((s) => (
            <div
              key={s.label}
              className="bg-ds-surface border border-ds-border rounded-ds-lg p-5 text-center shadow-ds-md"
            >
              <div className="font-mono text-data-lg sm:text-h3 text-ds-text-primary mb-1.5 tabular-nums">
                {s.big}
              </div>
              <div className="text-ds-text-muted text-caption">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* PROOF BLOCK */}
      <section className="relative z-10 py-16 md:py-24 px-4 sm:px-6 border-t border-ds-border">
        <div className="max-w-4xl mx-auto">
          <AnimatedSection>
            <motion.div variants={fadeUp} className="text-center mb-10">
              <h2 className="text-h2 md:text-h1 font-semibold tracking-tight text-ds-text-primary">
                Signal Tracking Overview
              </h2>
            </motion.div>
            <div className="grid sm:grid-cols-2 gap-3 md:gap-4 mb-6">
              <motion.div
                variants={fadeUp}
                className="bg-ds-surface border border-ds-border rounded-ds-lg p-6 md:p-7 text-center shadow-ds-md flex flex-col justify-center"
              >
                <div className="text-h1 font-semibold text-ds-text-primary mb-2 tabular-nums leading-none tracking-tight">
                  156,000+
                </div>
                <div className="text-ds-text-primary text-body-sm font-medium mb-1">Signals Processed</div>
                <div className="text-ds-text-muted text-caption">Since January 2026</div>
              </motion.div>
              <motion.div
                variants={fadeUp}
                className="relative bg-ds-surface border border-ds-brand-primary/40 rounded-ds-lg p-6 md:p-7 text-center flex flex-col justify-center shadow-ds-md"
                style={{ boxShadow: "0 8px 32px -12px hsl(var(--ds-brand-primary) / 0.35)" }}
              >
                <div className="text-h1 font-semibold text-ds-brand-primary mb-2 tabular-nums leading-none tracking-tight">
                  +160.63%
                </div>
                <div className="text-ds-text-primary text-body-sm font-medium mb-1">Cumulative Return</div>
                <div className="text-ds-text-muted text-caption">Across All Tracked Signals</div>
              </motion.div>
            </div>


            <motion.p
              variants={fadeUp}
              className="text-ds-text-muted text-caption italic text-center max-w-3xl mx-auto"
            >
              Calculated as the aggregate of individual signal percentage returns from entry to
              target, stop loss or expiry. Past performance is not a reliable indicator of future
              performance. Aggregate across all signals; individual results vary.
            </motion.p>
          </AnimatedSection>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how-it-works" className="relative z-10 py-16 md:py-24 px-4 sm:px-6 border-t border-ds-border">
        <div className="max-w-5xl mx-auto">
          <AnimatedSection>
            <motion.div variants={fadeUp} className="text-center mb-12">
              <h2 className="text-h2 md:text-h1 font-semibold tracking-tight mb-3 text-ds-text-primary">
                How InsiderPulse Works
              </h2>
              <p className="text-ds-text-secondary text-body">From Raw Data to Structured Signals</p>

            </motion.div>
            <div className="grid md:grid-cols-3 gap-3 md:gap-4">
              {[
                {
                  step: "1",
                  icon: <Eye className="h-5 w-5" />,
                  title: "We Track Market Activity",
                  desc: "We monitor insider filings, dark pool activity, congressional trades, options flow and momentum signals across thousands of assets.",
                },
                {
                  step: "2",
                  icon: <Sparkles className="h-5 w-5" />,
                  title: "Every Asset Is Scored",
                  desc: "Our system processes incoming data continuously and assigns a score to each asset as conditions change.",
                },
                {
                  step: "3",
                  icon: <Crosshair className="h-5 w-5" />,
                  title: "Signals Are Surfaced",

                  desc: "Assets that meet scoring thresholds appear as active signals, including score, reference levels and risk indicators.",
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

      {/* WHAT WE ARE WATCHING RIGHT NOW */}
      <section className="relative z-10 py-16 md:py-24 px-4 sm:px-6 border-t border-ds-border">
        <div className="max-w-4xl mx-auto">
          <AnimatedSection>
            <motion.div variants={fadeUp} className="text-center mb-8">
              <h2 className="text-h2 md:text-h1 font-semibold tracking-tight mb-3 text-ds-text-primary">
                What We Are Watching Right Now
              </h2>
              <p className="text-ds-text-secondary text-body">
                One asset visible. Full set available with Pro access.
              </p>
            </motion.div>

            <motion.div
              variants={fadeUp}
              className="bg-ds-surface border border-ds-border rounded-ds-lg overflow-hidden shadow-ds-md"
            >
              <div className="flex items-center justify-between px-4 sm:px-5 py-2.5 border-b border-ds-border bg-ds-surface-elevated">
                <div className="flex items-center gap-2">
                  <span className="ds-live-dot w-1.5 h-1.5 rounded-full bg-ds-signal-positive" />
                  <span className="text-overline uppercase text-ds-text-muted">Active Signals</span>
                </div>
                <Badge className="rounded-ds-sm bg-ds-signal-positive/10 text-ds-signal-positive border border-ds-signal-positive/20 text-caption font-mono px-2 py-0.5">
                  {activeCount} active signals
                </Badge>
              </div>

              <div className="md:hidden flex items-center justify-end gap-1 px-4 py-1.5 text-caption text-ds-text-muted border-b border-ds-border">
                <span>swipe</span>
                <ChevronRight className="h-3 w-3" />
              </div>

              <div className="overflow-x-auto">
                <div className="min-w-[640px]">
                  <div className="grid grid-cols-6 gap-3 px-4 sm:px-5 py-2.5 border-b border-ds-border text-overline uppercase text-ds-text-muted">
                    <span>Ticker</span>
                    <span>Score</span>
                    <span>Entry</span>
                    <span className="text-ds-signal-positive">Target</span>
                    <span className="text-ds-signal-negative">Stop</span>
                    <span>Size</span>
                  </div>

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

              <div className="flex flex-col items-center justify-center py-6 px-4 border-t border-ds-border bg-ds-surface text-center">
                <p className="text-ds-text-primary text-body-sm font-medium mb-1">
                  {hiddenCount} assets hidden
                </p>
                <p className="text-ds-text-muted text-caption mb-4 max-w-md">
                  Full access includes score breakdown, reference levels, risk indicators and signal history
                </p>
                <Button
                  className="h-11 px-6 rounded-ds-md bg-ds-brand-primary text-ds-brand-primary-foreground hover:bg-ds-brand-primary/90 font-medium text-body"
                  onClick={() => openAuthModal("signup", { ref: "landing_pricing" })}
                >
                  Unlock Full Access
                </Button>
              </div>
            </motion.div>

            <motion.p variants={fadeUp} className="text-center text-ds-text-muted text-caption mt-4">
              Signals are generated from data models and publicly available information. Not financial advice.
            </motion.p>
          </AnimatedSection>
        </div>
      </section>

      {/* TESTIMONIALS */}
      <section className="relative z-10 py-16 md:py-24 px-4 sm:px-6 border-t border-ds-border">
        <div className="max-w-6xl mx-auto">
          <AnimatedSection>
            <motion.div variants={fadeUp} className="text-center mb-10">
              <h2 className="text-h2 md:text-h1 font-semibold tracking-tight text-ds-text-primary">
                Used by Investors Who Track Data Closely
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

      {/* INSTITUTIONS MARQUEE */}
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

      {/* CAPABILITIES */}

      <section className="relative z-10 py-16 md:py-24 px-4 sm:px-6 border-t border-ds-border">
        <div className="max-w-5xl mx-auto">
          <AnimatedSection>
            <motion.div variants={fadeUp} className="text-center mb-12">
              <h2 className="text-h2 md:text-h1 font-semibold tracking-tight text-ds-text-primary">
                Everything in One Structured View
              </h2>
            </motion.div>
            <div className="grid sm:grid-cols-2 gap-3 md:gap-4">
              {[
                {
                  icon: <Eye className="h-5 w-5" />,
                  title: "Multi-Source Coverage",
                  desc: "Track insider activity, options flow, dark pool data and more in one place",
                },
                {
                  icon: <Sparkles className="h-5 w-5" />,
                  title: "Continuous Scoring",
                  desc: "Every asset is scored dynamically as new data arrives",
                },
                {
                  icon: <BarChart3 className="h-5 w-5" />,
                  title: "Live Signal Monitoring",
                  desc: "Signals update as conditions change",
                },
                {
                  icon: <Shield className="h-5 w-5" />,
                  title: "Structured Risk Indicators",

                  desc: "View scoring data and reference levels for each signal",
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

      {/* FOUNDER SECTION */}
      <section className="relative z-10 py-16 md:py-24 px-4 sm:px-6 border-t border-ds-border">
        <div className="max-w-3xl mx-auto">
          <AnimatedSection>
            <motion.h2
              variants={fadeUp}
              className="text-h2 md:text-h1 font-semibold tracking-tight text-ds-text-primary text-center mb-10"
            >
              Why InsiderPulse Exists
            </motion.h2>
            <motion.div variants={fadeUp} className="space-y-5 text-ds-text-secondary text-body leading-relaxed">
              <p>
                Most market activity that matters isn't hidden. It's just scattered. Insider trades
                sit in SEC filings. Congressional disclosures live in a government database.
                Options flow is buried in broker feeds. Dark pool prints surface in fragments
                across data providers.
              </p>
              <p>
                You can find each of these. But finding them across thousands of assets, in real
                time, without switching between five tools and a dozen tabs, is a different problem.
              </p>
              <p>
                InsiderPulse exists because that problem was worth solving. The platform pulls
                these data sources into one place, scores every asset as the data arrives, and
                lets you watch the market from a single view.
              </p>
            </motion.div>
            <motion.p
              variants={fadeUp}
              className="text-ds-text-muted text-body-sm italic text-center mt-8"
            >
              Built and operated independently from Brisbane, Australia.
            </motion.p>
          </AnimatedSection>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="relative z-10 py-16 md:py-24 px-4 sm:px-6 text-center border-t border-ds-border">
        <AnimatedSection>
          <motion.div variants={fadeUp}>
            <h2 className="text-h2 md:text-h1 font-semibold tracking-tight mb-4 text-ds-text-primary">
              Start Watching the Market
            </h2>
            <p className="text-ds-text-secondary text-body md:text-body-lg max-w-2xl mx-auto mb-8">
              Free access shows 3 assets and one theme. Premium unlocks the full 26,000+ asset
              universe with live scoring and signal data.
            </p>
            {/* Preview-first funnel — see mem://constraints/preview-first-funnel */}
            <Button
              className="h-11 px-8 rounded-ds-md bg-ds-brand-primary text-ds-brand-primary-foreground hover:bg-ds-brand-primary/90 font-medium text-body"
              asChild
            >
              <Link to="/asset-radar">Start Free Access</Link>
            </Button>
          </motion.div>
        </AnimatedSection>
      </section>

      {/* FOOTER */}
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
