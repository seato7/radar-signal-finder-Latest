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
    // IMPORTANT: Supabase may emit auth events (e.g. TOKEN_REFRESHED) that recreate
    // the user object. We only want to refetch plan when the user ID actually changes,
    // otherwise the whole app can appear to "refresh" when you switch browser tabs.
    if (context.user?.id) {
      fetchSubscriptionStatus();
    } else {
      setPlanLoading(false);
    }
  }, [context.user?.id]);

  const fetchSubscriptionStatus = async () => {
    try {
      setPlanLoading(true);

      // Check user_roles table for subscription info
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

  const hasPaidPlan = () => {
    return userPlan !== 'free';
  };

  const isAdmin = () => {
    return userPlan === 'admin';
  };

  const getPlanName = () => {
    return userPlan;
  };

  const limits = () => getPlanLimits(userPlan);
  const isPremium = () => isPremiumOrAbove(userPlan);
  const isPro = () => isProOrAbove(userPlan);
  const isStarter = () => isStarterOrAbove(userPlan);

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
  };
};
