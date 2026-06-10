import { useAuth as useAuthContext } from '@/contexts/AuthContext';
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getPlanLimits, isPremiumOrAbove, isProOrAbove, isStarterOrAbove } from '@/lib/planLimits';

export const useAuth = () => {
  const context = useAuthContext();
  const [userPlan, setUserPlan] = useState<string>('free');
  const [planLoading, setPlanLoading] = useState(true);

  // Get token from Supabase session
  const token = context.session?.access_token;

  useEffect(() => {
    // Anonymous = Free. No fetch needed; treat plan as 'free' immediately so
    // gating components don't stall on planLoading.
    if (context.user?.id) {
      fetchSubscriptionStatus();
    } else {
      setUserPlan('free');
      setPlanLoading(false);
    }
  }, [context.user?.id]);

  const fetchSubscriptionStatus = async () => {
    try {
      setPlanLoading(true);

      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', context.user?.id)
        .maybeSingle();

      if (error) {
        setUserPlan('free');
      } else if (data) {
        setUserPlan(data.role || 'free');
      } else {
        setUserPlan('free');
      }
    } catch (error) {
      setUserPlan('free');
    } finally {
      setPlanLoading(false);
    }
  };

  const isAnonymous = () => !context.isAuthenticated;
  const hasPaidPlan = () => context.isAuthenticated && userPlan !== 'free';
  const isAdmin = () => userPlan === 'admin';
  const getPlanName = () => userPlan;

  const limits = () => getPlanLimits(userPlan);
  const isPremium = () => isPremiumOrAbove(userPlan);
  const isPro = () => isProOrAbove(userPlan);
  const isStarter = () => isStarterOrAbove(userPlan);
  const isFree = () => userPlan === 'free' || !context.isAuthenticated;

  return {
    ...context,
    token,
    hasPaidPlan,
    isAdmin,
    getPlanName,
    userPlan,
    planLoading,
    refreshSubscription: fetchSubscriptionStatus,
    limits,
    isPremium,
    isPro,
    isStarter,
    isFree,
    isAnonymous,
  };
};
