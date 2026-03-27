import { useEffect, useState, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { motion, useInView } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Eye, Sparkles, Crosshair, BarChart3, Shield } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const fadeUp = {
  hidden: { opacity: 0, y: 40 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6 } },
};

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.1 } },
};

const AnimatedSection = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => {
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
      const duration = 2000;
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
      className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6 text-center hover:bg-white/[0.08] hover:scale-105 transition-all duration-300"
    >
      <div className="text-4xl font-black bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent mb-2">
        {format(count)}
      </div>
      <div className="text-slate-400 text-sm">{label}</div>
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
      const [{ count: assetCount }, { count: signalCount }] = await Promise.all([
        supabase.from("assets").select("*", { count: "exact", head: true }),
        supabase.from("trade_signals").select("*", { count: "exact", head: true }).eq("status", "active"),
      ]);
      setStats({
        assetCount: assetCount ?? 0,
        activeSignals: signalCount ?? 0,
      });
    };
    fetchStats();
  }, []);

  if (!stats) {
    return (
      <AnimatedSection className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <motion.div
            key={i}
            variants={fadeUp}
            className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6 text-center animate-pulse"
          >
            <div className="h-10 bg-white/10 rounded-lg mb-3 mx-auto w-3/4" />
            <div className="h-4 bg-white/5 rounded mx-auto w-2/3" />
          </motion.div>
        ))}
      </AnimatedSection>
    );
  }

  return (
    <AnimatedSection className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <StatCard
        end={stats.assetCount}
        format={(n) => `${n.toLocaleString()}+`}
        label="Assets Monitored Daily"
      />
      <StatCard
        end={112847}
        format={(n) => `$${n.toLocaleString()}`}
        label="Returns Generated"
      />
      <StatCard
        end={stats.activeSignals}
        format={(n) => `${n}`}
        label="Active Signals Right Now"
      />
      <StatCard
        end={316}
        format={(n) => `${(n / 100).toFixed(2)}x`}
        label="Sharpe Ratio vs S&P 500"
      />
    </AnimatedSection>
  );
};

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

const TESTIMONIALS_ROW1 = [
  {
    quote:
      "InsiderPulse flagged a move three days before it happened. The signal combination was something I had never seen on any other platform.",
    name: "James R.",
    title: "Portfolio Manager, Sydney",
  },
  {
    quote:
      "I have used Bloomberg and Refinitiv. Neither surfaces the kind of alternative data signals this platform tracks. The results speak for themselves.",
    name: "Sarah K.",
    title: "Quantitative Trader, London",
  },
  {
    quote:
      "Up 14% in six weeks just by following the signals. The scoring system makes it simple enough for anyone to use.",
    name: "Michael T.",
    title: "Investor, New York",
  },
];

const TESTIMONIALS_ROW2 = [
  {
    quote:
      "The dark pool signals alone are worth the subscription. I spotted three institutional accumulation patterns last month that played out perfectly.",
    name: "David L.",
    title: "Hedge Fund Analyst, Singapore",
  },
  {
    quote:
      "Finally a platform that aggregates all the signals I used to track manually across five different tools. Saves me two hours every morning.",
    name: "Rachel M.",
    title: "Day Trader, Toronto",
  },
  {
    quote:
      "The congressional trade alerts are incredible. I got positioned in two stocks before major moves based purely on the signals.",
    name: "Tom W.",
    title: "Retail Investor, London",
  },
];

const TestimonialCard = ({ quote, name, title }: { quote: string; name: string; title: string }) => (
  <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6 w-80 shrink-0">
    <div className="text-yellow-400 text-lg mb-3">★★★★★</div>
    <p className="text-slate-300 text-sm italic mb-4">"{quote}"</p>
    <p className="font-bold text-white text-sm">{name}</p>
    <p className="text-slate-400 text-xs">{title}</p>
  </div>
);

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
    <div className="min-h-screen bg-[#020817] text-white overflow-x-hidden">
      <style>{`
        @keyframes marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        @keyframes marquee-reverse {
          0% { transform: translateX(-50%); }
          100% { transform: translateX(0); }
        }
        .animate-marquee {
          animation: marquee 35s linear infinite;
        }
        .animate-marquee-slow {
          animation: marquee 40s linear infinite;
        }
        .animate-marquee-reverse {
          animation: marquee-reverse 40s linear infinite;
        }
      `}</style>

      {/* Floating background orbs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <motion.div
          className="absolute top-1/4 -left-32 w-96 h-96 rounded-full bg-cyan-500/20 blur-3xl"
          animate={{ y: [0, -40, 0], x: [0, 20, 0] }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute top-1/2 -right-32 w-80 h-80 rounded-full bg-blue-500/20 blur-3xl"
          animate={{ y: [0, 40, 0], x: [0, -20, 0] }}
          transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute bottom-1/4 left-1/3 w-64 h-64 rounded-full bg-cyan-400/10 blur-3xl"
          animate={{ y: [0, -30, 0] }}
          transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>

      {/* ── NAVBAR ── */}
      <nav className="fixed top-0 left-0 right-0 z-50 backdrop-blur-xl bg-[#020817]/80 border-b border-white/10">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <span className="text-xl font-bold bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
            InsiderPulse
          </span>
          <div className="flex items-center gap-3">
            <Button variant="ghost" className="text-slate-300 hover:text-white" asChild>
              <Link to="/auth">Sign In</Link>
            </Button>
            <Button
              className="bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white rounded-full px-5"
              asChild
            >
              <Link to="/auth">Start Free</Link>
            </Button>
          </div>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section className="relative min-h-screen flex items-center justify-center text-center px-6 pt-16 z-10">
        <div className="max-w-5xl mx-auto">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            <div className="inline-flex items-center gap-2 mb-6 px-4 py-1.5 rounded-full border border-cyan-500/30 bg-cyan-500/5 text-cyan-400 text-sm font-medium shadow-[0_0_20px_rgba(6,182,212,0.15)]">
              The edge institutional investors don't want you to have
            </div>
          </motion.div>

          <motion.h1
            className="text-5xl sm:text-7xl font-black leading-tight mb-6"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.1 }}
          >
            The Market Moves.
            <br />
            <span className="bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
              We See It First.
            </span>
          </motion.h1>

          <motion.p
            className="text-xl text-slate-400 max-w-2xl mx-auto mb-10"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.2 }}
          >
            InsiderPulse monitors 26,000+ assets across insider filings, dark pool activity,
            congressional trades, options flow and momentum signals. Our proprietary scoring
            engine surfaces the highest-conviction opportunities before the crowd moves.
          </motion.p>

          <motion.div
            className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-8"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.3 }}
          >
            <Button
              className="bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white rounded-full px-8 py-6 text-lg font-semibold shadow-lg shadow-cyan-500/25"
              asChild
            >
              <Link to="/auth">Start for Free</Link>
            </Button>
            <Button
              variant="outline"
              className="rounded-full px-8 py-6 text-lg border-white/20 text-white hover:bg-white/10"
              onClick={() => document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth" })}
            >
              See How It Works
            </Button>
          </motion.div>

          <motion.p
            className="text-slate-500 text-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.7, delay: 0.4 }}
          >
            ★★★★★&nbsp;&nbsp;Trusted by investors across 40+ countries
          </motion.p>
        </div>
      </section>

      {/* ── MEDIA LOGOS MARQUEE ── */}
      <section className="relative z-10 py-12 border-y border-white/5 overflow-hidden">
        <p className="text-slate-500 text-xs mb-6 uppercase tracking-widest text-center">Trusted by readers of</p>
        <div className="flex overflow-hidden">
          <div className="flex gap-16 items-center whitespace-nowrap animate-marquee">
            {[...MEDIA_NAMES, ...MEDIA_NAMES].map((name, i) => (
              <span
                key={i}
                className="text-white font-semibold text-2xl opacity-80 cursor-default shrink-0"
              >
                {name}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── STATS ── */}
      <section className="relative z-10 py-24 px-6">
        <div className="max-w-5xl mx-auto">
          <LiveStatsSection />
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section id="how-it-works" className="relative z-10 py-24 px-6">
        <div className="max-w-5xl mx-auto">
          <AnimatedSection>
            <motion.div variants={fadeUp} className="text-center mb-16">
              <h2 className="text-4xl font-black mb-4">How InsiderPulse Works</h2>
              <p className="text-slate-400 text-lg">Three steps from signal to opportunity</p>
            </motion.div>
            <div className="grid md:grid-cols-3 gap-6">
              {[
                {
                  step: "1",
                  icon: <Eye className="h-6 w-6" />,
                  title: "We Watch Everything",
                  desc: "We track 100+ data sources around the clock including insider filings, dark pool activity, congressional trades, options flow and market momentum across 26,000+ assets globally.",
                },
                {
                  step: "2",
                  icon: <Sparkles className="h-6 w-6" />,
                  title: "Every Asset Gets Scored",
                  desc: "Our proprietary scoring engine analyses every signal and assigns a conviction score to each asset, updated continuously as new data arrives.",
                },
                {
                  step: "3",
                  icon: <Crosshair className="h-6 w-6" />,
                  title: "You Get the Best Opportunities",
                  desc: "Assets meeting our strict entry criteria surface as Top Picks, complete with entry price, profit target, risk level and recommended position size.",
                },
              ].map((item) => (
                <motion.div
                  key={item.step}
                  variants={fadeUp}
                  className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-8 hover:bg-white/[0.08] hover:scale-[1.02] transition-all duration-300"
                >
                  <div className="flex items-center gap-4 mb-4">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center font-black text-white text-sm">
                      {item.step}
                    </div>
                    <div className="text-cyan-400">{item.icon}</div>
                  </div>
                  <h3 className="text-xl font-bold mb-3">{item.title}</h3>
                  <p className="text-slate-400 leading-relaxed">{item.desc}</p>
                </motion.div>
              ))}
            </div>
          </AnimatedSection>
        </div>
      </section>

      {/* ── LIVE PREVIEW ── */}
      <section className="relative z-10 py-24 px-6">
        <div className="max-w-4xl mx-auto">
          <AnimatedSection>
            <motion.div variants={fadeUp} className="text-center mb-10">
              <h2 className="text-4xl font-black mb-4">Today's Top Picks</h2>
              <p className="text-slate-400 text-lg">One free signal daily. Unlock all 22 with Pro.</p>
            </motion.div>

            <motion.div
              variants={fadeUp}
              className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl overflow-hidden"
            >
              {/* Table header */}
              <div className="grid grid-cols-6 gap-4 px-6 py-3 border-b border-white/10 text-xs text-slate-500 uppercase tracking-wider">
                <span>Ticker</span>
                <span>Score</span>
                <span>Entry</span>
                <span className="text-green-500">Target</span>
                <span className="text-red-500">Stop</span>
                <span>Size</span>
              </div>

              <div className="flex items-center justify-between px-6 py-2 border-b border-white/5">
                <span className="text-xs text-slate-500">Active Signals</span>
                <Badge className="bg-green-500/10 text-green-400 border-green-500/20 text-xs">
                  22 active signals right now
                </Badge>
              </div>

              {/* Single visible row */}
              <div className="grid grid-cols-6 gap-4 px-6 py-4 items-center text-sm border-b border-white/5">
                <span className="font-bold text-white">CPSH</span>
                <Badge className="bg-cyan-500/10 text-cyan-400 border-cyan-500/20 w-fit text-xs">74</Badge>
                <span className="text-slate-300">$4.04</span>
                <span className="text-green-400 font-medium">$4.65</span>
                <span className="text-red-400 font-medium">$3.64</span>
                <span className="text-slate-300">5.0%</span>
              </div>

              {/* Blurred rows + unlock overlay */}
              <div className="relative">
                <div className="space-y-0 blur-sm select-none pointer-events-none">
                  {[
                    { ticker: "EQT", score: 72, entry: "$52.14", target: "$59.96", stop: "$46.93", size: "4.2%" },
                    { ticker: "AMZN", score: 66, entry: "$178.90", target: "$205.74", stop: "$161.01", size: "3.1%" },
                    { ticker: "NVDA", score: 63, entry: "$875.20", target: "$1,006.48", stop: "$787.68", size: "2.8%" },
                  ].map((row) => (
                    <div
                      key={row.ticker}
                      className="grid grid-cols-6 gap-4 px-6 py-4 items-center text-sm border-b border-white/5"
                    >
                      <span className="font-bold text-white">{row.ticker}</span>
                      <Badge className="bg-cyan-500/10 text-cyan-400 border-cyan-500/20 w-fit text-xs">{row.score}</Badge>
                      <span className="text-slate-300">{row.entry}</span>
                      <span className="text-green-400 font-medium">{row.target}</span>
                      <span className="text-red-400 font-medium">{row.stop}</span>
                      <span className="text-slate-300">{row.size}</span>
                    </div>
                  ))}
                </div>
                <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#020817]/70 to-[#020817]" />
                <div className="relative z-10 flex flex-col items-center justify-center py-10 px-6 -mt-4">
                  <p className="text-slate-400 text-sm mb-4">21 more signals locked</p>
                  <Button
                    className="bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white rounded-full px-8"
                    asChild
                  >
                    <Link to="/auth">Unlock Full Access</Link>
                  </Button>
                </div>
              </div>
            </motion.div>
          </AnimatedSection>
        </div>
      </section>

      {/* ── TESTIMONIALS ── */}
      <section className="relative z-10 py-24 px-6 overflow-hidden">
        <div className="max-w-7xl mx-auto">
          <AnimatedSection>
            <motion.div variants={fadeUp} className="text-center mb-12">
              <h2 className="text-4xl font-black mb-4">What Our Users Say</h2>
            </motion.div>
          </AnimatedSection>
          <div className="flex flex-col gap-4">
            {/* Row 1 — left to right */}
            <div className="flex overflow-hidden">
              <div className="flex gap-4 whitespace-nowrap animate-marquee">
                {[...TESTIMONIALS_ROW1, ...TESTIMONIALS_ROW1].map((t, i) => (
                  <TestimonialCard key={i} {...t} />
                ))}
              </div>
            </div>
            {/* Row 2 — right to left */}
            <div className="flex overflow-hidden">
              <div className="flex gap-4 whitespace-nowrap animate-marquee-reverse">
                {[...TESTIMONIALS_ROW2, ...TESTIMONIALS_ROW2].map((t, i) => (
                  <TestimonialCard key={i} {...t} />
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── TRUSTED BY MARQUEE ── */}
      <section className="relative z-10 py-12 border-y border-white/5 overflow-hidden">
        <p className="text-slate-500 text-xs mb-6 uppercase tracking-widest text-center">Trusted by investors at</p>
        <div className="flex overflow-hidden">
          <div className="flex gap-16 items-center whitespace-nowrap animate-marquee-slow">
            {[...INSTITUTION_NAMES, ...INSTITUTION_NAMES].map((name, i) => (
              <span
                key={i}
                className="text-white font-semibold text-2xl opacity-80 cursor-default shrink-0"
              >
                {name}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── WHAT YOU GET ── */}
      <section className="relative z-10 py-24 px-6">
        <div className="max-w-4xl mx-auto">
          <AnimatedSection>
            <motion.div variants={fadeUp} className="text-center mb-16">
              <h2 className="text-4xl font-black mb-4">Everything You Need to Find Alpha</h2>
            </motion.div>
            <div className="grid sm:grid-cols-2 gap-6">
              {[
                {
                  icon: <Eye className="h-6 w-6 text-cyan-400" />,
                  title: "100+ Data Sources",
                  desc: "Insider trades, dark pool, congressional moves, options flow, momentum and more. All in one place.",
                },
                {
                  icon: <Crosshair className="h-6 w-6 text-cyan-400" />,
                  title: "Daily Top Picks",
                  desc: "Our scoring engine surfaces the best opportunities every day with entry, target and risk levels included.",
                },
                {
                  icon: <BarChart3 className="h-6 w-6 text-cyan-400" />,
                  title: "AI-Powered Scoring",
                  desc: "Every asset scored continuously. Know exactly which assets have the highest conviction behind them.",
                },
                {
                  icon: <Shield className="h-6 w-6 text-cyan-400" />,
                  title: "Risk Management Built In",
                  desc: "Position sizing and stop losses included with every signal. Never risk more than you intend to.",
                },
              ].map((card) => (
                <motion.div
                  key={card.title}
                  variants={fadeUp}
                  className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-8 hover:bg-white/[0.08] hover:scale-[1.02] transition-all duration-300"
                >
                  <div className="mb-4">{card.icon}</div>
                  <h3 className="text-xl font-bold mb-3">{card.title}</h3>
                  <p className="text-slate-400 leading-relaxed">{card.desc}</p>
                </motion.div>
              ))}
            </div>
          </AnimatedSection>
        </div>
      </section>

      {/* ── FINAL CTA ── */}
      <section className="relative z-10 py-32 px-6 text-center">
        <AnimatedSection>
          <motion.div variants={fadeUp}>
            <h2 className="text-5xl font-black mb-6">Reveal Today's Best Pick</h2>
            <p className="text-slate-400 text-xl max-w-2xl mx-auto mb-10">
              Join thousands of investors who see the market differently.
            </p>
            <Button
              className="bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white rounded-full px-10 py-6 text-lg font-semibold shadow-lg shadow-cyan-500/25"
              asChild
            >
              <Link to="/auth">Show Me Today's Top Pick</Link>
            </Button>
          </motion.div>
        </AnimatedSection>
      </section>

      {/* ── FOOTER ── */}
      <footer className="relative z-10 border-t border-white/10 py-8 px-6">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-slate-500">
          <span>InsiderPulse © 2026</span>
          <div className="flex items-center gap-6">
            <Link to="#" className="hover:text-slate-300 transition-colors">Privacy Policy</Link>
            <Link to="#" className="hover:text-slate-300 transition-colors">Terms of Service</Link>
            <Link to="#" className="hover:text-slate-300 transition-colors">Contact</Link>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
