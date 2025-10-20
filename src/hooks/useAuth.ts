import { useAuth as useAuthContext } from '@/contexts/AuthContext';
import { useState, useEffect } from 'react';

export const useAuth = () => {
  const context = useAuthContext();
  const [userPlan, setUserPlan] = useState<string>('free');
  const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';
  
  useEffect(() => {
    if (context.user) {
      // Fetch user's subscription status
      fetchSubscriptionStatus();
    }
  }, [context.user]);

  const fetchSubscriptionStatus = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/payments/status?user_id=${context.user?.email || 'default'}`, {
        headers: {
          'Authorization': `Bearer ${context.token}`,
        },
      });
      
      if (response.ok) {
        const data = await response.json();
        setUserPlan(data.plan || 'free');
      }
    } catch (error) {
      console.error('Error fetching subscription:', error);
    }
  };

  // Helper to check if user has paid plan
  const hasPaidPlan = () => {
    return userPlan !== 'free';
  };

  // Helper to check if user is admin
  const isAdmin = () => {
    return context.user?.role === 'admin';
  };

  // Helper to get plan name
  const getPlanName = () => {
    return userPlan;
  };

  return {
    ...context,
    hasPaidPlan,
    isAdmin,
    getPlanName,
    userPlan,
    refreshSubscription: fetchSubscriptionStatus,
  };
};
