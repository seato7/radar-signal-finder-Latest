import { useAuth as useAuthContext } from '@/contexts/AuthContext';
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export const useAuth = () => {
  const context = useAuthContext();
  const [userPlan, setUserPlan] = useState<string>('free');
  const [planLoading, setPlanLoading] = useState(true);
  
  // Get token from Supabase session
  const token = context.session?.access_token;
  
  useEffect(() => {
    if (context.user) {
      fetchSubscriptionStatus();
    } else {
      setPlanLoading(false);
    }
  }, [context.user]);

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

  return {
    ...context,
    token,
    hasPaidPlan,
    isAdmin,
    getPlanName,
    userPlan,
    planLoading,
    refreshSubscription: fetchSubscriptionStatus,
  };
};
