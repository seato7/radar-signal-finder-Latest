import { PageHeader } from '@/components/PageHeader';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { Lock } from 'lucide-react';
import SettingsProfile from '@/components/settings/SettingsProfile';
import SettingsNotifications from '@/components/settings/SettingsNotifications';
import SettingsPassword from '@/components/settings/SettingsPassword';
import SettingsSubscription from '@/components/settings/SettingsSubscription';
import SettingsBrokers from '@/components/settings/SettingsBrokers';
import SettingsDeleteAccount from '@/components/settings/SettingsDeleteAccount';
import { useAuth } from '@/hooks/useAuth';
import { useAnonSignupCTA } from '@/hooks/useAnonSignupCTA';

const tabTriggerClass =
  "relative rounded-none border-0 bg-transparent px-4 py-2.5 text-body-sm text-ds-text-secondary transition-colors duration-fast hover:text-ds-text-primary data-[state=active]:bg-ds-surface-elevated data-[state=active]:text-ds-text-primary data-[state=active]:shadow-none after:absolute after:left-2 after:right-2 after:bottom-0 after:h-[2px] after:bg-transparent data-[state=active]:after:bg-ds-brand-primary";

export default function Settings() {
  const { isAuthenticated, loading } = useAuth();
  const anonSignup = useAnonSignupCTA();

  if (loading) return null;

  if (!isAuthenticated) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <PageHeader title="Settings" description="Account, preferences, and subscription" />
        <div className="flex flex-col items-center justify-center text-center gap-4 rounded-ds-lg border border-ds-border bg-ds-surface p-10">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-ds-surface-elevated border border-ds-border">
            <Lock className="h-5 w-5 text-ds-text-secondary" />
          </div>
          <p className="text-body text-ds-text-secondary max-w-md">
            Sign up to manage your account settings.
          </p>
          <Button
            onClick={() => anonSignup('settings_locked')}
            className="bg-ds-brand-primary text-ds-brand-primary-foreground hover:bg-ds-brand-primary/90"
          >
            Sign Up Free
          </Button>
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="container mx-auto p-6 space-y-6">
        <PageHeader
          title="Settings"
          description="Account, preferences, and subscription"
        />

        <Tabs defaultValue="profile" className="w-full">
          <div className="overflow-x-auto -mx-1 px-1">
            <TabsList className="inline-flex h-auto w-max min-w-full justify-start gap-1 rounded-ds-lg border border-ds-border bg-ds-surface p-1">
              <TabsTrigger value="profile" className={tabTriggerClass}>Profile</TabsTrigger>
              <TabsTrigger value="notifications" className={tabTriggerClass}>Notifications</TabsTrigger>
              <TabsTrigger value="password" className={tabTriggerClass}>Password</TabsTrigger>
              <TabsTrigger value="subscription" className={tabTriggerClass}>Subscription</TabsTrigger>
              <TabsTrigger value="brokers" className={tabTriggerClass}>Brokers</TabsTrigger>
              <TabsTrigger
                value="delete"
                className={`${tabTriggerClass} data-[state=active]:text-ds-signal-negative data-[state=active]:after:bg-ds-signal-negative`}
              >
                Delete Account
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="profile" className="mt-4">
            <SettingsProfile />
          </TabsContent>
          <TabsContent value="notifications" className="mt-4">
            <SettingsNotifications />
          </TabsContent>
          <TabsContent value="password" className="mt-4">
            <SettingsPassword />
          </TabsContent>
          <TabsContent value="subscription" className="mt-4">
            <SettingsSubscription />
          </TabsContent>
          <TabsContent value="brokers" className="mt-4">
            <SettingsBrokers />
          </TabsContent>
          <TabsContent value="delete" className="mt-4">
            <SettingsDeleteAccount />
          </TabsContent>
        </Tabs>
      </div>
    </TooltipProvider>
  );
}
