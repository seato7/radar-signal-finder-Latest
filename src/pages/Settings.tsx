import { PageHeader } from '@/components/PageHeader';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import SettingsProfile from '@/components/settings/SettingsProfile';
import SettingsNotifications from '@/components/settings/SettingsNotifications';
import SettingsPassword from '@/components/settings/SettingsPassword';
import SettingsSubscription from '@/components/settings/SettingsSubscription';
import SettingsBrokers from '@/components/settings/SettingsBrokers';
import SettingsDeleteAccount from '@/components/settings/SettingsDeleteAccount';

export default function Settings() {
  return (
    <div className="container mx-auto p-6 space-y-6">
      <PageHeader title="Settings" description="Manage your account, subscription, broker connections and preferences" />

      <Tabs defaultValue="profile" className="w-full">
        <TabsList className="flex flex-wrap h-auto justify-start">
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          <TabsTrigger value="password">Password</TabsTrigger>
          <TabsTrigger value="subscription">Subscription</TabsTrigger>
          <TabsTrigger value="brokers">Brokers</TabsTrigger>
          <TabsTrigger value="delete" className="text-destructive data-[state=active]:text-destructive">
            Delete Account
          </TabsTrigger>
        </TabsList>

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
  );
}
