import { useAuth as useAuthContext } from '@/contexts/AuthContext';
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export const useAuth = () => {
  const context = useAuthContext();
  const [userPlan, setUserPlan] = useState<string>('free');
  
  // Get token from Supabase session
  const token = context.session?.access_token;
  
  useEffect(() => {
    if (context.user) {
      fetchSubscriptionStatus();
    }
  }, [context.user]);

  const fetchSubscriptionStatus = async () => {
    try {
      // Check user_roles table for subscription info
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', context.user?.id)
        .single();
      
      if (!error && data) {
        setUserPlan(data.role || 'free');
      }
    } catch (error) {
      console.error('Error fetching subscription:', error);
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
    refreshSubscription: fetchSubscriptionStatus,
  };
};
