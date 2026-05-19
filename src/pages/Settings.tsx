import { PageHeader } from '@/components/PageHeader';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { TooltipProvider } from '@/components/ui/tooltip';
import SettingsProfile from '@/components/settings/SettingsProfile';
import SettingsNotifications from '@/components/settings/SettingsNotifications';
import SettingsPassword from '@/components/settings/SettingsPassword';
import SettingsSubscription from '@/components/settings/SettingsSubscription';
import SettingsBrokers from '@/components/settings/SettingsBrokers';
import SettingsDeleteAccount from '@/components/settings/SettingsDeleteAccount';

const tabTriggerClass =
  "relative rounded-none border-0 bg-transparent px-4 py-2.5 text-body-sm text-ds-text-secondary transition-colors duration-fast hover:text-ds-text-primary data-[state=active]:bg-ds-surface-elevated data-[state=active]:text-ds-text-primary data-[state=active]:shadow-none after:absolute after:left-2 after:right-2 after:bottom-0 after:h-[2px] after:bg-transparent data-[state=active]:after:bg-ds-brand-primary";

export default function Settings() {
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
