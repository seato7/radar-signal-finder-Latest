import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Dashboard components
import MarketRadar from "@/components/dashboard/MarketRadar";
import TopThemesCard from "@/components/dashboard/TopThemesCard";
import TopAssetsCard from "@/components/dashboard/TopAssetsCard";
import SignalSpotlight from "@/components/dashboard/SignalSpotlight";
import AIAssistantHero from "@/components/dashboard/AIAssistantHero";
import RecentAlertsCard from "@/components/dashboard/RecentAlertsCard";
import FollowedThemesCard from "@/components/dashboard/FollowedThemesCard";

const Home = () => {
  const { data: userPlan = 'free' } = useQuery({
    queryKey: ['user-plan'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return 'free';
      const { data } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .maybeSingle();
      return data?.role || 'free';
    },
    staleTime: 5 * 60 * 1000,
  });

  return (
    <div className="space-y-6 pb-8">
      {/* Page Header */}
      <div className="flex items-start justify-between gap-4 pb-2">
        <div className="min-w-0">
          <h1 className="text-h2 md:text-h1 font-semibold text-ds-text-primary tracking-tight">
            Insider Pulse
          </h1>
          <p className="text-body text-ds-text-secondary mt-2 max-w-2xl">
            Multi-asset momentum signals from 30+ alternative data sources
          </p>
        </div>
        <div className="hidden sm:flex shrink-0">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-ds-sm border border-ds-brand-primary/40 text-ds-brand-primary text-caption font-medium capitalize">
            <span className="h-1.5 w-1.5 rounded-full bg-ds-brand-primary" />
            {userPlan} Plan
          </span>
        </div>
      </div>

      {/* AI Assistant */}
      <AIAssistantHero />

      {/* Signal Spotlight */}
      <SignalSpotlight />
      <p className="text-caption text-ds-text-muted text-center -mt-3">
        Algorithmically generated data output only. Not financial advice.
      </p>

      {/* Main Grid */}
      <div className="grid gap-4 lg:grid-cols-2">
        <TopThemesCard />
        <TopAssetsCard />
      </div>

      {/* Market Radar + Alerts Row */}
      <div className="grid gap-4 lg:grid-cols-2">
        <MarketRadar />
        <RecentAlertsCard />
      </div>

      {/* Followed Themes */}
      <FollowedThemesCard />
    </div>
  );
};

export default Home;
