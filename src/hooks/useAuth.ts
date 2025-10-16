import { useAuth as useAuthContext } from '@/contexts/AuthContext';

export const useAuth = () => {
  const context = useAuthContext();
  
  // Helper to check if user has paid plan
  const hasPaidPlan = () => {
    // TODO: Implement once payment integration is complete
    // For now, return false to show paywall
    return false;
  };

  // Helper to check if user is admin
  const isAdmin = () => {
    return context.user?.role === 'admin';
  };

  // Helper to get plan name
  const getPlanName = () => {
    // TODO: Fetch from user's subscription
    return 'Free';
  };

  return {
    ...context,
    hasPaidPlan,
    isAdmin,
    getPlanName,
  };
};
