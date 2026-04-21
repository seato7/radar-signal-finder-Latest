import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Menu, ArrowRight, FileText, HelpCircle, CreditCard, AlertTriangle, Shield } from "lucide-react";
import {
  TOS_VERSION,
  TOS_LAST_UPDATED,
  TOS_EFFECTIVE_DATE,
  TOS_IMPORTANT_DISCLAIMER,
  TOS_SECTIONS,
  type LegalContent,
  type LegalSection,
} from "@/legal/termsOfService";

const GlassCard = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <div className={`backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl ${className}`}>
    {children}
  </div>
);

const renderContent = (blocks: LegalContent[], depth = 0) =>
  blocks.map((block, idx) => {
    if (block.type === "paragraph") {
      return (
        <p key={idx} className="text-slate-300 leading-relaxed mb-4">
          {block.text}
        </p>
      );
    }
    if (block.type === "list") {
      return (
        <ul key={idx} className="list-disc pl-6 space-y-1 text-slate-300 mb-4">
          {block.items.map((item, i) => (
            <li key={i} className="leading-relaxed">
              {item}
            </li>
          ))}
        </ul>
      );
    }
    if (block.type === "address") {
      return (
        <address key={idx} className="not-italic text-slate-300 my-4 leading-relaxed">
          {block.lines.map((line, i) => (
            <div key={i}>{line}</div>
          ))}
        </address>
      );
    }
    if (block.type === "subsection") {
      return (
        <div key={idx} className={`mb-6 ${depth === 0 ? "pl-4 border-l border-white/10" : ""}`}>
          <h3 className="text-lg font-bold text-white mb-3">
            <span className="text-cyan-400 mr-2">{block.number}</span>
            {block.heading}
          </h3>
          <div>{renderContent(block.content, depth + 1)}</div>
        </div>
      );
    }
    return null;
  });

const Terms = () => {
  const [activeId, setActiveId] = useState<string>(TOS_SECTIONS[0].id);
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);
  const observerRef = useRef<IntersectionObserver | null>(null);
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
    TOS_SECTIONS.forEach((s) => {
      const el = document.getElementById(s.id);
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

  const TocLinks = ({ onNavigate }: { onNavigate?: () => void }) => (
    <nav className="space-y-1">
      {TOS_SECTIONS.map((s: LegalSection) => {
        const isActive = activeId === s.id;
        return (
          <button
            key={s.id}
            onClick={() => {
              scrollTo(s.id);
              onNavigate?.();
            }}
            className={`block w-full text-left text-sm transition-colors ${
              isActive
                ? "text-cyan-400 font-medium"
                : "text-slate-400 hover:text-slate-200"
            } py-1.5 px-3 rounded-lg hover:bg-white/5`}
          >
            <span className="text-xs text-slate-500 mr-2">{s.number}.</span>
            <span className="capitalize">{s.heading.toLowerCase()}</span>
          </button>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen bg-[#020817] text-white overflow-x-hidden">
      {/* Floating background orbs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute top-1/4 -left-32 w-96 h-96 rounded-full bg-cyan-500/20 blur-3xl" />
        <div className="absolute top-1/2 -right-32 w-80 h-80 rounded-full bg-blue-500/20 blur-3xl" />
        <div className="absolute bottom-1/4 left-1/3 w-64 h-64 rounded-full bg-cyan-400/10 blur-3xl" />
      </div>

      {/* Navbar, auth-aware */}
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

      {/* Mobile ToC trigger */}
      <Sheet open={mobileSheetOpen} onOpenChange={setMobileSheetOpen}>
        <SheetTrigger asChild>
          <Button
            className="lg:hidden fixed bottom-6 right-6 z-40 rounded-full h-14 w-14 bg-gradient-to-r from-cyan-500 to-blue-600 shadow-lg shadow-cyan-500/25 p-0"
            aria-label="Jump to section"
          >
            <Menu className="h-5 w-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="right" className="bg-[#0a1223] border-white/10 text-white overflow-y-auto">
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
              <div className="sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto">
                <p className="text-xs uppercase tracking-widest text-slate-500 mb-4 px-3">
                  On this page
                </p>
                <TocLinks />
              </div>
            </aside>

            {/* Content */}
            <main className="max-w-4xl">
              <GlassCard className="p-6 sm:p-10 mb-8">
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-600/20 border border-cyan-500/30 flex items-center justify-center">
                    <Shield className="h-5 w-5 text-cyan-400" />
                  </div>
                  <p className="text-xs uppercase tracking-widest text-cyan-400">
                    Legal
                  </p>
                </div>
                <h1 className="text-4xl sm:text-5xl font-black leading-tight mb-3">
                  Terms of Service
                </h1>
                <p className="text-lg text-slate-400 mb-4">
                  InsiderPulse, Version {TOS_VERSION}
                </p>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                  <span>Last Updated: {TOS_LAST_UPDATED}</span>
                  <span aria-hidden className="text-slate-700">·</span>
                  <span>Effective Date: {TOS_EFFECTIVE_DATE}</span>
                </div>
              </GlassCard>

              {/* Important Disclaimer */}
              <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-6 sm:p-8 mb-12">
                <div className="flex items-start gap-4">
                  <AlertTriangle className="h-6 w-6 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs uppercase tracking-widest text-amber-400 font-semibold mb-3">
                      Important Disclaimer
                    </p>
                    <p className="text-slate-200 leading-relaxed">
                      {TOS_IMPORTANT_DISCLAIMER}
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-12">
                {TOS_SECTIONS.map((section) => (
                  <section
                    key={section.id}
                    id={section.id}
                    className="scroll-mt-24"
                  >
                    <h2 className="text-2xl sm:text-3xl font-black text-white mb-6">
                      <span className="text-cyan-400 mr-3">{section.number}.</span>
                      {section.heading}
                    </h2>
                    <GlassCard className="p-6 sm:p-8">
                      {renderContent(section.content)}
                    </GlassCard>
                  </section>
                ))}
              </div>

              <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent my-12" />

              <p className="text-center text-xs uppercase tracking-widest text-slate-500 mb-8">
                End of Terms of Service v{TOS_VERSION}
              </p>

              <GlassCard className="p-6 sm:p-8">
                <p className="text-sm text-slate-400 mb-4">Related pages</p>
                <div className="flex flex-wrap gap-3">
                  <Button variant="outline" className="bg-white/5 border-white/10 text-slate-200 hover:bg-white/10 hover:text-white" asChild>
                    <Link to="/privacy">
                      <FileText className="h-4 w-4 mr-2" />
                      Privacy Policy
                    </Link>
                  </Button>
                  <Button variant="outline" className="bg-white/5 border-white/10 text-slate-200 hover:bg-white/10 hover:text-white" asChild>
                    <Link to="/help">
                      <HelpCircle className="h-4 w-4 mr-2" />
                      Help
                    </Link>
                  </Button>
                  <Button variant="outline" className="bg-white/5 border-white/10 text-slate-200 hover:bg-white/10 hover:text-white" asChild>
                    <Link to="/pricing">
                      <CreditCard className="h-4 w-4 mr-2" />
                      Pricing
                    </Link>
                  </Button>
                </div>
              </GlassCard>
            </main>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Terms;
