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
      console.log('🔍 Fetching role for user:', context.user?.id);
      
      // Check user_roles table for subscription info
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', context.user?.id)
        .maybeSingle();
      
      console.log('📊 User role response:', { data, error });
      
      if (error) {
        console.error('❌ Error fetching role:', error);
        setUserPlan('free');
      } else if (data) {
        console.log('✅ Setting user plan to:', data.role);
        setUserPlan(data.role || 'free');
      } else {
        console.log('⚠️ No role found, defaulting to free');
        setUserPlan('free');
      }
    } catch (error) {
      console.error('💥 Exception fetching subscription:', error);
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
