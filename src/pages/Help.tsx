import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  Radar,
  Crosshair,
  Sparkles,
  Tag,
  Bell,
  Star,
  Bot,
  Mail,
  Copy,
  Check,
  Menu,
  Lightbulb,
  AlertCircle,
  ArrowRight,
} from "lucide-react";

interface TocItem {
  id: string;
  label: string;
  depth: 0 | 1;
}

const TOC: TocItem[] = [
  { id: "how-it-works", label: "How it works", depth: 0 },
  { id: "core-loop", label: "The signal-to-opportunity loop", depth: 0 },
  { id: "features", label: "Features in detail", depth: 0 },
  { id: "feature-asset-radar", label: "Asset Radar", depth: 1 },
  { id: "feature-active-signals", label: "Active Signals", depth: 1 },
  { id: "feature-themes", label: "Themes", depth: 1 },
  { id: "feature-ai-assistant", label: "AI Assistant", depth: 1 },
  { id: "feature-alerts", label: "Alerts", depth: 1 },
  { id: "feature-watchlist", label: "Watchlist", depth: 1 },
  { id: "feature-bots", label: "Trading Bots", depth: 1 },
  { id: "plans", label: "Plans & pricing", depth: 0 },
  { id: "faq", label: "FAQ", depth: 0 },
  { id: "contact", label: "Contact", depth: 0 },
];

const GlassCard = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <div
    className={`backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl ${className}`}
  >
    {children}
  </div>
);

const ProTip = ({ children }: { children: React.ReactNode }) => (
  <div className="flex items-start gap-3 rounded-xl border border-cyan-500/20 bg-cyan-500/5 px-4 py-3 mt-4">
    <Lightbulb className="h-4 w-4 text-cyan-400 mt-0.5 shrink-0" />
    <p className="text-sm text-slate-300">
      <span className="font-semibold text-cyan-400">Pro tip: </span>
      {children}
    </p>
  </div>
);

const InlineDisclaimer = ({ children }: { children: React.ReactNode }) => (
  <div className="flex items-start gap-2 mt-4 text-xs text-slate-500">
    <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-slate-500" />
    <p>{children}</p>
  </div>
);

const FeatureSection = ({
  id,
  title,
  icon: Icon,
  what,
  how,
  proTip,
  disclaimer,
}: {
  id: string;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  what: string;
  how: string;
  proTip?: string;
  disclaimer?: string;
}) => (
  <section id={id} className="scroll-mt-24">
    <div className="flex items-center gap-3 mb-4">
      <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-600/20 border border-cyan-500/30 flex items-center justify-center">
        <Icon className="h-5 w-5 text-cyan-400" />
      </div>
      <h3 className="text-2xl font-black text-white">{title}</h3>
    </div>
    <GlassCard className="p-6 sm:p-8">
      <div className="space-y-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-slate-500 mb-2">What it does</p>
          <p className="text-slate-300 leading-relaxed">{what}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-widest text-slate-500 mb-2">How to use it</p>
          <p className="text-slate-300 leading-relaxed">{how}</p>
        </div>
        {proTip && <ProTip>{proTip}</ProTip>}
        {disclaimer && <InlineDisclaimer>{disclaimer}</InlineDisclaimer>}
      </div>
    </GlassCard>
  </section>
);

const Help = () => {
  const [activeId, setActiveId] = useState<string>(TOC[0].id);
  const [copied, setCopied] = useState(false);
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const { toast } = useToast();
  const { isAuthenticated } = useAuth();

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => (a.target as HTMLElement).offsetTop - (b.target as HTMLElement).offsetTop);
        if (visible.length > 0) {
          setActiveId((visible[0].target as HTMLElement).id);
        }
      },
      { rootMargin: "-80px 0px -70% 0px", threshold: 0 },
    );
    TOC.forEach((item) => {
      const el = document.getElementById(item.id);
      if (el) observer.observe(el);
    });
    observerRef.current = observer;
    return () => observer.disconnect();
  }, []);

  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    setMobileSheetOpen(false);
  };

  const copyEmail = async () => {
    try {
      await navigator.clipboard.writeText("support@insiderpulse.org");
      setCopied(true);
      toast({ title: "Email copied to clipboard" });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "Could not copy", variant: "destructive" });
    }
  };

  const TocLinks = ({ onNavigate }: { onNavigate?: () => void }) => (
    <nav className="space-y-1">
      {TOC.map((item) => {
        const isActive = activeId === item.id;
        return (
          <button
            key={item.id}
            onClick={() => {
              scrollTo(item.id);
              onNavigate?.();
            }}
            className={`block w-full text-left text-sm transition-colors ${
              item.depth === 1 ? "pl-5" : ""
            } ${
              isActive
                ? "text-cyan-400 font-medium"
                : "text-slate-400 hover:text-slate-200"
            } py-1.5 px-3 rounded-lg hover:bg-white/5`}
          >
            {item.label}
          </button>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen bg-[#020817] text-white overflow-x-hidden">
      {/* Floating background orbs, matching Landing */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute top-1/4 -left-32 w-96 h-96 rounded-full bg-cyan-500/20 blur-3xl" />
        <div className="absolute top-1/2 -right-32 w-80 h-80 rounded-full bg-blue-500/20 blur-3xl" />
        <div className="absolute bottom-1/4 left-1/3 w-64 h-64 rounded-full bg-cyan-400/10 blur-3xl" />
      </div>

      {/* Navbar, matching Landing */}
      <nav className="fixed top-0 left-0 right-0 z-50 backdrop-blur-xl bg-[#020817]/80 border-b border-white/10">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to={isAuthenticated ? "/dashboard" : "/"} className="text-xl font-bold bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
            InsiderPulse
          </Link>
          <div className="flex items-center gap-3">
            {isAuthenticated ? (
              <Button
                className="bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white rounded-full px-5"
                asChild
              >
                <Link to="/dashboard">
                  Back to Dashboard
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Link>
              </Button>
            ) : (
              <>
                <Button variant="ghost" className="text-slate-300 hover:text-white" asChild>
                  <Link to="/auth">Sign In</Link>
                </Button>
                <Button
                  className="bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white rounded-full px-5"
                  asChild
                >
                  <Link to="/auth">Start Free</Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* Mobile jump-to-section button */}
      <Sheet open={mobileSheetOpen} onOpenChange={setMobileSheetOpen}>
        <SheetTrigger asChild>
          <Button
            className="lg:hidden fixed bottom-6 right-6 z-40 rounded-full h-14 w-14 bg-gradient-to-r from-cyan-500 to-blue-600 shadow-lg shadow-cyan-500/25 p-0"
            aria-label="Jump to section"
          >
            <Menu className="h-5 w-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="right" className="bg-[#0a1223] border-white/10 text-white">
          <SheetHeader>
            <SheetTitle className="text-white">Jump to section</SheetTitle>
          </SheetHeader>
          <div className="mt-6">
            <TocLinks onNavigate={() => setMobileSheetOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>

      <div className="relative z-10 pt-24 pb-24 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="lg:grid lg:grid-cols-[16rem_1fr] lg:gap-12">
            {/* Desktop sticky ToC */}
            <aside className="hidden lg:block">
              <div className="sticky top-24">
                <p className="text-xs uppercase tracking-widest text-slate-500 mb-4 px-3">
                  On this page
                </p>
                <TocLinks />
              </div>
            </aside>

            {/* Content column */}
            <main className="max-w-4xl">
              {/* ── SECTION 1: Hero ── */}
              <section id="how-it-works" className="scroll-mt-24 mb-20">
                <h1 className="text-4xl sm:text-5xl font-black leading-tight mb-6">
                  How InsiderPulse works
                </h1>
                <p className="text-lg text-slate-400 leading-relaxed mb-6">
                  InsiderPulse is a market signals platform. We monitor 26,000+ assets
                  across insider filings, dark pool activity, congressional trades,
                  options flow and momentum data, then surface the highest-scored
                  signals through an algorithmic scoring engine. Everything on this
                  page explains how to use it. Nothing here is investment advice.
                </p>
                <Badge
                  variant="outline"
                  className="inline-flex items-center gap-2 border-amber-500/30 bg-amber-500/5 text-amber-400 px-3 py-1.5 rounded-full font-normal"
                >
                  <AlertCircle className="h-3.5 w-3.5" />
                  Not financial advice. Algorithmically generated data outputs only.
                </Badge>
              </section>

              <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent mb-20" />

              {/* ── SECTION 2: The core loop ── */}
              <section id="core-loop" className="scroll-mt-24 mb-20">
                <h2 className="text-3xl sm:text-4xl font-black mb-4">
                  The signal-to-opportunity loop
                </h2>
                <p className="text-slate-400 mb-10 max-w-2xl leading-relaxed">
                  Most users move through three steps: browse the full universe on
                  Asset Radar, narrow to the highest-scored opportunities on Active
                  Signals, then ask the AI Assistant to fill in context before making
                  any decision.
                </p>
                <div className="grid md:grid-cols-3 gap-5">
                  {[
                    {
                      step: "01",
                      name: "Asset Radar",
                      desc: "Browse all 26,000+ scored assets ranked by our algorithmic scoring engine. Filter by sector, asset class, or score band to find opportunities that match your thesis.",
                    },
                    {
                      step: "02",
                      name: "Active Signals",
                      desc: "The highest-scored signals surfaced as reference data, with entry price, target, and stop-loss ranges generated by the model. These are data outputs, not instructions to trade.",
                    },
                    {
                      step: "03",
                      name: "AI Assistant",
                      desc: "Ask questions about any asset, signal, or theme. The assistant pulls from real-time news, your watchlist, and live market context.",
                    },
                  ].map((item) => (
                    <GlassCard
                      key={item.step}
                      className="p-6 hover:bg-white/[0.08] transition-colors"
                    >
                      <div className="text-4xl font-black bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent mb-3">
                        {item.step}
                      </div>
                      <h3 className="text-lg font-bold text-white mb-2">{item.name}</h3>
                      <p className="text-sm text-slate-400 leading-relaxed">{item.desc}</p>
                    </GlassCard>
                  ))}
                </div>
              </section>

              <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent mb-20" />

              {/* ── SECTION 3: Features in detail ── */}
              <section id="features" className="scroll-mt-24 mb-20">
                <h2 className="text-3xl sm:text-4xl font-black mb-4">
                  Every feature, explained
                </h2>
                <p className="text-slate-400 mb-10 max-w-2xl leading-relaxed">
                  A deeper walkthrough of each section of the app, with how to find
                  it, how to use it, and where the limits are.
                </p>

                <div className="space-y-12">
                  <FeatureSection
                    id="feature-asset-radar"
                    title="Asset Radar"
                    icon={Radar}
                    what="The full universe browser. Every asset with a computed score, filterable and sortable."
                    how="Navigate to Asset Radar from the sidebar. Use the filter bar to narrow by sector, asset class, or score threshold. Click any ticker to see its detail page."
                    proTip="The score distribution shifts over time. An asset scoring 70 in a quiet week may score 50 in a volatile one. Watch for relative movement, not absolute thresholds."
                    disclaimer="Scores are algorithmic outputs, not recommendations to buy or sell."
                  />

                  <FeatureSection
                    id="feature-active-signals"
                    title="Active Signals"
                    icon={Crosshair}
                    what="The highest-scored signals across the universe, presented as reference data with entry, target, and stop-loss ranges."
                    how="Navigate to Active Signals from the sidebar. Each signal shows a ticker, entry reference, target reference, stop-loss reference, and live price. Use the disclaimer banner at the top of the page as context. These are data outputs, not trade instructions."
                    proTip="The Live dot next to a price means the data is under 10 minutes old. Delayed or daily-close data is flagged."
                    disclaimer="Entry, target, and stop-loss figures are reference data generated by the scoring model. They are not recommendations or instructions to trade. Past performance does not guarantee future results."
                  />

                  <FeatureSection
                    id="feature-themes"
                    title="Themes"
                    icon={Tag}
                    what="Sector and trend groupings. The model's view of where capital is flowing across industries."
                    how="Open Themes from the sidebar. Each theme shows a score and a list of member assets. Click a theme to see its history."
                    proTip="Themes move slower than individual signals. A rising theme score often precedes individual asset signal clusters in the same sector."
                  />

                  <FeatureSection
                    id="feature-ai-assistant"
                    title="AI Assistant"
                    icon={Sparkles}
                    what="A chat interface that can answer questions about assets, signals, themes, and general market context."
                    how="Open AI Assistant from the sidebar. Ask in plain English. The assistant has access to your watchlist, your active signals, and real-time web context."
                    proTip="Ask follow-up questions. The assistant remembers the thread."
                    disclaimer="The AI Assistant provides general market commentary and data context, not personalised financial advice."
                  />

                  <FeatureSection
                    id="feature-alerts"
                    title="Alerts"
                    icon={Bell}
                    what="Automated notifications when something on your watchlist or across the universe meets your criteria."
                    how="Set alerts from the Alerts page or from an asset detail page. Alerts fire via email."
                  />

                  <FeatureSection
                    id="feature-watchlist"
                    title="Watchlist"
                    icon={Star}
                    what="A list of tickers you care about, surfaced across the app (dashboard highlights, alerts, AI Assistant context)."
                    how="Add tickers from any asset detail page. Manage from the Watchlist page."
                  />

                  <FeatureSection
                    id="feature-bots"
                    title="Trading Bots"
                    icon={Bot}
                    what="Automated execution of Active Signals through your connected broker. Premium only, coming soon."
                    how="Currently in development. Premium subscribers get first access. Connect a broker under Settings, Brokers to be ready."
                    disclaimer="Trading bots execute data-generated signals on your connected broker. You retain full control and responsibility for all trades placed in your account."
                  />
                </div>
              </section>

              <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent mb-20" />

              {/* ── SECTION 4: Plans & pricing ── */}
              <section id="plans" className="scroll-mt-24 mb-20">
                <h2 className="text-3xl sm:text-4xl font-black mb-4">
                  Find the right plan
                </h2>
                <p className="text-slate-400 mb-10 max-w-2xl leading-relaxed">
                  Every plan includes access to the scoring engine. Plans differ in
                  how many signals, assets, and AI queries you can use per day.
                </p>

                <GlassCard className="overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-white/10">
                          <th className="text-left font-semibold text-slate-300 px-4 sm:px-6 py-4 w-48">
                            Feature
                          </th>
                          <th className="text-left font-semibold text-slate-300 px-3 py-4">
                            Free
                          </th>
                          <th className="text-left font-semibold text-slate-300 px-3 py-4">
                            <div>Starter</div>
                            <div className="text-xs font-normal text-slate-500">$9.99/mo</div>
                          </th>
                          <th className="text-left font-semibold text-slate-300 px-3 py-4">
                            <div>Pro</div>
                            <div className="text-xs font-normal text-slate-500">$34.99/mo</div>
                          </th>
                          <th className="text-left font-semibold text-cyan-400 px-3 py-4">
                            <div>Premium</div>
                            <div className="text-xs font-normal text-slate-500">$89.99/mo</div>
                          </th>
                          <th className="text-left font-semibold text-slate-300 px-3 py-4">
                            <div>Enterprise</div>
                            <div className="text-xs font-normal text-slate-500">Custom</div>
                          </th>
                        </tr>
                      </thead>
                      <tbody className="text-slate-300">
                        {[
                          ["Active Signals", "-", "1", "3", "Unlimited", "Unlimited"],
                          ["Asset Radar coverage", "-", "Stocks only", "Stocks, ETFs & Forex", "All asset classes + scores", "All asset classes + scores"],
                          ["Themes", "-", "1", "3", "Unlimited", "Unlimited"],
                          ["AI Assistant (messages/day)", "-", "5", "20", "Unlimited", "Unlimited"],
                          ["Alerts", "-", "1", "5", "Unlimited", "Unlimited"],
                          ["Watchlist slots", "-", "3", "10", "Unlimited", "Unlimited"],
                          ["Analytics dashboard", "-", "-", "-", "Included", "Included"],
                          ["Trading Bots access", "-", "-", "-", "First access", "First access"],
                          ["Priority support", "-", "-", "-", "-", "Included"],
                        ].map((row, i) => (
                          <tr
                            key={i}
                            className="border-b border-white/5 last:border-0"
                          >
                            <td className="px-4 sm:px-6 py-3 font-medium text-slate-200">
                              {row[0]}
                            </td>
                            {row.slice(1).map((cell, j) => (
                              <td
                                key={j}
                                className={`px-3 py-3 ${
                                  j === 2 ? "text-cyan-400 font-medium" : "text-slate-400"
                                }`}
                              >
                                {cell}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </GlassCard>

                <div className="mt-8 flex justify-center">
                  <Button
                    className="bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white rounded-full px-8 py-6 text-base font-semibold shadow-lg shadow-cyan-500/25"
                    asChild
                  >
                    <Link to="/pricing">
                      See full pricing and sign up
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </Link>
                  </Button>
                </div>
              </section>

              <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent mb-20" />

              {/* ── SECTION 5: FAQ ── */}
              <section id="faq" className="scroll-mt-24 mb-20">
                <h2 className="text-3xl sm:text-4xl font-black mb-10">
                  Common questions
                </h2>
                <GlassCard className="p-2 sm:p-4">
                  <Accordion type="single" collapsible className="w-full">
                    {[
                      {
                        q: "Is InsiderPulse financial advice?",
                        a: "No. InsiderPulse is a data and analytics tool. All scores, signals, and entry/target/stop-loss figures are algorithmically generated data outputs, not recommendations or instructions to trade. Past performance does not guarantee future results. Consult a licensed financial adviser before making any investment decision.",
                      },
                      {
                        q: "How does the scoring engine work?",
                        a: "Our scoring engine combines data from insider filings, dark pool activity, congressional trades, options flow, momentum, technical indicators, news sentiment, and more. Each signal is weighted by its historical performance and combined into a composite score per asset. The specific weights and model architecture are proprietary.",
                      },
                      {
                        q: "What does a good score look like?",
                        a: "Scores are relative, not absolute. An asset scoring 70 today may score 55 next week as market conditions change. Watch for relative movement within the universe and sector percentile ranking, not fixed thresholds.",
                      },
                      {
                        q: "Are the entry prices and targets in Active Signals real trade instructions?",
                        a: "No. They are reference data points generated by the scoring model, for example a target of +15% and stop-loss of -10% from the entry reference price. They are not instructions to trade or recommendations to buy or sell. How you use this data is your decision.",
                      },
                      {
                        q: "How fresh is the data?",
                        a: "Prices update throughout the trading day via live data feeds. The Live indicator on Active Signals shows data under 10 minutes old. Other signals refresh on various cadences depending on source (insider filings when the SEC publishes, options flow intraday, macro indicators daily).",
                      },
                      {
                        q: "Can I cancel anytime?",
                        a: "Yes. Cancel your subscription from Settings, Subscription at any time. Your access continues until the end of your current billing period, after which you revert to the Free tier. No cancellation fees. The 7-day Starter trial can be cancelled before the trial ends at no charge.",
                      },
                      {
                        q: "What happens if I delete my account?",
                        a: "Account deletion is permanent. We wipe your profile, watchlist, preferences, and personal data. Billing records are retained as required by Australian law. Any active subscription is cancelled. You can download a JSON export of your data before deleting. Details in Settings, Delete Account.",
                      },
                      {
                        q: "Is my data private?",
                        a: "Yes. We don't sell your data. We share it only with service providers who help us operate (Stripe for payments, Supabase for hosting, etc.), all under standard data processing agreements. Full details in our Privacy Policy.",
                      },
                      {
                        q: "Does InsiderPulse execute trades for me?",
                        a: "Not yet. Trading Bots (which execute Active Signals through your connected broker) are in development and will be available first to Premium subscribers. Today, InsiderPulse is a data and analytics platform only. You execute all trades yourself through whatever broker you use.",
                      },
                      {
                        q: "How do I contact support?",
                        a: "Email support@insiderpulse.org. Response times: Pro subscribers within 48 business hours, Premium and Enterprise within 24 business hours, Free and Starter best effort.",
                      },
                    ].map((item, i) => (
                      <AccordionItem
                        key={i}
                        value={`item-${i}`}
                        className="border-white/10 last:border-0 px-4"
                      >
                        <AccordionTrigger className="text-left text-white hover:text-cyan-400 hover:no-underline">
                          {item.q}
                        </AccordionTrigger>
                        <AccordionContent className="text-slate-400 leading-relaxed">
                          {item.a}
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                </GlassCard>
              </section>

              <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent mb-20" />

              {/* ── SECTION 6: Contact & legal ── */}
              <section id="contact" className="scroll-mt-24 mb-16">
                <h2 className="text-3xl sm:text-4xl font-black mb-10">
                  Still have questions?
                </h2>
                <GlassCard className="p-6 sm:p-8">
                  <div className="flex items-center gap-3 mb-5">
                    <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-600/20 border border-cyan-500/30 flex items-center justify-center">
                      <Mail className="h-5 w-5 text-cyan-400" />
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-widest text-slate-500">
                        Support email
                      </p>
                      <div className="flex items-center gap-2">
                        <a
                          href="mailto:support@insiderpulse.org"
                          className="text-lg font-semibold text-white hover:text-cyan-400 transition-colors"
                        >
                          support@insiderpulse.org
                        </a>
                        <button
                          onClick={copyEmail}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-cyan-400 hover:bg-white/5 transition-colors"
                          aria-label="Copy support email"
                        >
                          {copied ? (
                            <Check className="h-4 w-4" />
                          ) : (
                            <Copy className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>

                  <Separator className="bg-white/10 my-5" />

                  <div className="space-y-2 text-sm text-slate-400">
                    <p className="font-medium text-slate-300">Response times</p>
                    <ul className="space-y-1 text-slate-400">
                      <li>Premium and Enterprise: within 24 business hours</li>
                      <li>Pro: within 48 business hours</li>
                      <li>Free and Starter: best effort</li>
                    </ul>
                  </div>

                  <Separator className="bg-white/10 my-5" />

                  <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
                    <Link to="/pricing" className="text-slate-300 hover:text-cyan-400 transition-colors">
                      Pricing
                    </Link>
                    <Link to="/privacy" className="text-slate-300 hover:text-cyan-400 transition-colors">
                      Privacy Policy
                    </Link>
                    <Link to="/terms" className="text-slate-300 hover:text-cyan-400 transition-colors">
                      Terms of Service
                    </Link>
                  </div>
                </GlassCard>

                <p className="text-xs text-slate-500 leading-relaxed mt-8">
                  InsiderPulse is a data and analytics platform. Nothing on this
                  page, in the product, or in any communication constitutes financial
                  advice or a recommendation to buy, sell, or hold any security. All
                  data outputs are algorithmic and for informational purposes only.
                  Past performance does not guarantee future results. Always consult
                  a licensed financial adviser before making investment decisions.
                </p>
              </section>
            </main>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Help;
