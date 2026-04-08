import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Zap } from "lucide-react";

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
      {/* Hero Header */}
      <div className="relative">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              <span className="gradient-text">Insider Pulse</span>
            </h1>
            <p className="text-muted-foreground mt-1">
              Multi-asset momentum signals from 30+ alternative data sources
            </p>
          </div>
          <Badge 
            variant="outline" 
            className="border-primary/30 text-primary capitalize hidden sm:flex items-center gap-1.5"
          >
            <Zap className="h-3 w-3" />
            {userPlan} Plan
          </Badge>
        </div>
      </div>

      {/* AI Assistant Hero */}
      <AIAssistantHero />

      {/* Signal Spotlight */}
      <SignalSpotlight />
      <p className="text-xs text-muted-foreground text-center -mt-3">
        Algorithmically generated data output only. Not financial advice.
      </p>

      {/* Main Grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        <TopThemesCard />
        <TopAssetsCard />
      </div>

      {/* Market Radar + Alerts Row */}
      <div className="grid gap-6 lg:grid-cols-2">
        <MarketRadar />
        <RecentAlertsCard />
      </div>

      {/* Followed Themes */}
      <FollowedThemesCard />
    </div>
  );
};

export default Home;