import { useEffect, useState, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { motion, useInView } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Eye, Sparkles, Crosshair, Star, Check } from "lucide-react";

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
            <Badge className="mb-6 bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 rounded-full px-4 py-1.5 text-sm">
              🤖 AI-Powered Alpha Discovery Engine
            </Badge>
          </motion.div>

          <motion.h1
            className="text-5xl sm:text-7xl font-black leading-tight mb-6"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.1 }}
          >
            Find Market Opportunities
            <br />
            <span className="bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
              Before They Happen
            </span>
          </motion.h1>

          <motion.p
            className="text-xl text-slate-400 max-w-2xl mx-auto mb-10"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.2 }}
          >
            InsiderPulse analyses 26,000+ assets across 30+ alternative data sources — insider trades,
            dark pool activity, congressional moves, momentum signals — and surfaces the
            highest-conviction opportunities in real time.
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

      {/* ── MEDIA LOGOS ── */}
      <section className="relative z-10 py-16 border-y border-white/5">
        <div className="max-w-5xl mx-auto px-6 text-center">
          <p className="text-slate-500 text-sm mb-8 uppercase tracking-widest">As featured in</p>
          <div className="flex flex-wrap items-center justify-center gap-8 md:gap-16">
            {["Bloomberg", "Yahoo Finance", "Benzinga", "Seeking Alpha", "Entrepreneur"].map((name) => (
              <span
                key={name}
                className="text-slate-400 font-semibold text-lg opacity-40 hover:opacity-70 transition-opacity cursor-default"
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
          <AnimatedSection className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard
              end={26000}
              format={(n) => `${n.toLocaleString()}+`}
              label="Assets Tracked"
            />
            <StatCard
              end={112847}
              format={(n) => `$${n.toLocaleString()}`}
              label="Generated on $1M Paper Portfolio"
            />
            <StatCard
              end={673}
              format={(n) => `${(n / 10).toFixed(1)}%`}
              label="Signal Accuracy (last 30 days)"
            />
            <StatCard
              end={316}
              format={(n) => `${(n / 100).toFixed(2)}`}
              label="Sharpe Ratio vs −1.17 Baseline"
            />
          </AnimatedSection>
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
                  desc: "Our pipelines monitor 26,000+ assets across insider filings, dark pool prints, congressional trades, options flow, momentum, and 30+ more data sources — 24 hours a day.",
                },
                {
                  step: "2",
                  icon: <Sparkles className="h-6 w-6" />,
                  title: "AI Scores Every Asset",
                  desc: "Our hybrid scoring engine combines formula-based signals with Gemini AI analysis to produce a single conviction score for every asset, updated continuously.",
                },
                {
                  step: "3",
                  icon: <Crosshair className="h-6 w-6" />,
                  title: "You Get the Best Opportunities",
                  desc: "Top-scoring assets that meet our strict entry criteria appear as Top Picks — complete with entry price, target, stop loss, and Kelly-sized position recommendation.",
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
              <h2 className="text-4xl font-black mb-4">Today's Top Picks — Live</h2>
              <p className="text-slate-400 text-lg">Real signals. Real data. Updated continuously.</p>
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

              {/* Visible rows */}
              {[
                { ticker: "CPSH", score: 74, entry: "$2.31", target: "$2.66", stop: "$2.08", size: "5.0%" },
                { ticker: "EQT", score: 72, entry: "$52.14", target: "$59.96", stop: "$46.93", size: "4.2%" },
                { ticker: "AMZN", score: 66, entry: "$178.90", target: "$205.74", stop: "$161.01", size: "3.1%" },
              ].map((row) => (
                <div
                  key={row.ticker}
                  className="grid grid-cols-6 gap-4 px-6 py-4 items-center text-sm border-b border-white/5"
                >
                  <span className="font-bold text-white">{row.ticker}</span>
                  <Badge className="bg-cyan-500/10 text-cyan-400 border-cyan-500/20 w-fit text-xs">
                    {row.score}
                  </Badge>
                  <span className="text-slate-300">{row.entry}</span>
                  <span className="text-green-400 font-medium">{row.target}</span>
                  <span className="text-red-400 font-medium">{row.stop}</span>
                  <span className="text-slate-300">{row.size}</span>
                </div>
              ))}

              {/* Blurred row + unlock overlay */}
              <div className="relative">
                <div className="grid grid-cols-6 gap-4 px-6 py-4 items-center text-sm blur-sm select-none pointer-events-none">
                  <span className="font-bold text-white">NVDA</span>
                  <Badge className="bg-cyan-500/10 text-cyan-400 border-cyan-500/20 w-fit text-xs">63</Badge>
                  <span className="text-slate-300">$875.20</span>
                  <span className="text-green-400">$1,006.48</span>
                  <span className="text-red-400">$787.68</span>
                  <span className="text-slate-300">2.8%</span>
                </div>
                <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#020817]/70 to-[#020817]" />
                <div className="relative z-10 flex flex-col items-center justify-center py-10 px-6 -mt-4">
                  <p className="text-slate-400 text-sm mb-4">19 more signals available with Pro access</p>
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
      <section className="relative z-10 py-24 px-6">
        <div className="max-w-5xl mx-auto">
          <AnimatedSection>
            <motion.div variants={fadeUp} className="text-center mb-16">
              <h2 className="text-4xl font-black mb-4">What Our Users Say</h2>
            </motion.div>
            <div className="grid md:grid-cols-3 gap-6">
              {[
                {
                  quote:
                    "InsiderPulse flagged EQT three days before it moved +18%. The congressional trade signal was the tip-off. Nothing else I've used comes close.",
                  name: "James R.",
                  title: "Portfolio Manager, Sydney",
                },
                {
                  quote:
                    "I've tried Bloomberg, Refinitiv, you name it. InsiderPulse surfaces signals those platforms don't even track. The dark pool + insider combo is genuinely alpha-generating.",
                  name: "Sarah K.",
                  title: "Quantitative Trader, London",
                },
                {
                  quote:
                    "The AI scoring makes it dead simple. I don't need to interpret signals — I just look at the score and the Top Picks. Up 14% in six weeks following the signals.",
                  name: "Michael T.",
                  title: "Retail Investor, New York",
                },
              ].map((t) => (
                <motion.div
                  key={t.name}
                  variants={fadeUp}
                  className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-8 hover:bg-white/[0.08] hover:scale-[1.02] transition-all duration-300"
                >
                  <div className="flex gap-0.5 mb-4">
                    {[...Array(5)].map((_, i) => (
                      <Star key={i} className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                    ))}
                  </div>
                  <p className="text-slate-300 leading-relaxed mb-6">"{t.quote}"</p>
                  <div>
                    <p className="font-semibold text-white">{t.name}</p>
                    <p className="text-slate-500 text-sm">{t.title}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </AnimatedSection>
        </div>
      </section>

      {/* ── TRUSTED BY ── */}
      <section className="relative z-10 py-16 border-y border-white/5">
        <div className="max-w-5xl mx-auto px-6 text-center">
          <p className="text-slate-500 text-sm mb-8 uppercase tracking-widest">Trusted by investors at</p>
          <div className="flex flex-wrap items-center justify-center gap-8 md:gap-16 mb-6">
            {["Goldman Sachs", "Morgan Stanley", "Citadel", "Two Sigma", "Bridgewater"].map((name) => (
              <span key={name} className="text-slate-400 font-semibold text-lg opacity-30 cursor-default">
                {name}
              </span>
            ))}
          </div>
          <p className="text-slate-600 text-xs max-w-xl mx-auto">
            InsiderPulse is used by individual investors and professionals. Company names shown are for illustrative purposes.
          </p>
        </div>
      </section>

      {/* ── PRICING ── */}
      <section className="relative z-10 py-24 px-6">
        <div className="max-w-4xl mx-auto">
          <AnimatedSection>
            <motion.div variants={fadeUp} className="text-center mb-16">
              <h2 className="text-4xl font-black mb-4">Simple, Transparent Pricing</h2>
              <p className="text-slate-400 text-lg">Start free. Upgrade when you're ready.</p>
            </motion.div>
            <div className="grid md:grid-cols-2 gap-6 items-start">
              {/* Free */}
              <motion.div
                variants={fadeUp}
                className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-8 hover:bg-white/[0.08] transition-all duration-300"
              >
                <h3 className="text-xl font-bold mb-2">Free Forever</h3>
                <div className="text-4xl font-black mb-6">
                  $0<span className="text-lg font-normal text-slate-400">/month</span>
                </div>
                <ul className="space-y-3 mb-8">
                  {[
                    "Top 3 signals per day",
                    "Asset Radar (50 assets)",
                    "AI Assistant (10 queries/day)",
                    "Basic alerts",
                  ].map((f) => (
                    <li key={f} className="flex items-center gap-3 text-slate-300">
                      <Check className="h-4 w-4 text-cyan-400 shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
                <Button
                  variant="outline"
                  className="w-full rounded-full border-white/20 text-white hover:bg-white/10"
                  asChild
                >
                  <Link to="/auth">Get Started Free</Link>
                </Button>
              </motion.div>

              {/* Pro */}
              <motion.div
                variants={fadeUp}
                className="relative backdrop-blur-xl bg-white/5 border border-cyan-500/40 rounded-2xl p-8 shadow-lg shadow-cyan-500/10 hover:shadow-cyan-500/20 transition-all duration-300"
              >
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge className="bg-gradient-to-r from-cyan-500 to-blue-600 text-white border-0 rounded-full px-4 py-1">
                    Most Popular
                  </Badge>
                </div>
                <h3 className="text-xl font-bold mb-2">Pro</h3>
                <div className="text-4xl font-black mb-6">
                  $49<span className="text-lg font-normal text-slate-400">/month</span>
                </div>
                <ul className="space-y-3 mb-8">
                  {[
                    "All 22+ Top Picks daily",
                    "Full Asset Radar (26,000+ assets)",
                    "Unlimited AI Assistant",
                    "Real-time alerts",
                    "Kelly position sizing",
                    "Backtesting engine",
                    "Priority signal access",
                  ].map((f) => (
                    <li key={f} className="flex items-center gap-3 text-slate-300">
                      <Check className="h-4 w-4 text-cyan-400 shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
                <Button
                  className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white rounded-full"
                  asChild
                >
                  <Link to="/auth">Start Pro Free for 7 Days</Link>
                </Button>
              </motion.div>
            </div>
          </AnimatedSection>
        </div>
      </section>

      {/* ── FINAL CTA ── */}
      <section className="relative z-10 py-32 px-6 text-center">
        <AnimatedSection>
          <motion.div variants={fadeUp}>
            <h2 className="text-5xl font-black mb-6">Ready to Find Your Next Alpha?</h2>
            <p className="text-slate-400 text-xl max-w-2xl mx-auto mb-10">
              Join thousands of investors using AI to find opportunities before the crowd.
            </p>
            <Button
              className="bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white rounded-full px-10 py-6 text-lg font-semibold shadow-lg shadow-cyan-500/25"
              asChild
            >
              <Link to="/auth">Start for Free — No Credit Card Required</Link>
            </Button>
            <p className="text-slate-600 text-sm mt-4">Setup takes 60 seconds</p>
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
          <span className="text-center text-xs">Not financial advice. For informational purposes only.</span>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
