import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/PageHeader";
import { MetricCard } from "@/components/MetricCard";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Activity, Users, Bot, AlertCircle, TrendingUp, Shield, Database, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { SupabaseDebugPanel } from "@/components/SupabaseDebugPanel";

const Admin = () => {
  const navigate = useNavigate();
  const [metrics, setMetrics] = useState<any>(null);
  const [userStats, setUserStats] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [audit, setAudit] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("overview");

  useEffect(() => {
    const fetchData = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error('Please login to access admin panel');
        navigate('/auth');
        return;
      }

      try {
        const [metricsRes, userStatsRes, usersRes, auditRes] = await Promise.all([
          supabase.functions.invoke('admin-metrics', { body: { action: 'metrics' } }),
          supabase.functions.invoke('admin-metrics', { body: { action: 'user-stats' } }),
          supabase.functions.invoke('admin-metrics', { body: { action: 'users' } }),
          supabase.functions.invoke('admin-metrics', { body: { action: 'audit' } })
        ]);
        
        if (metricsRes.error || userStatsRes.error || usersRes.error || auditRes.error) {
          toast.error('Unauthorized access - Admin privileges required');
          navigate('/auth');
          return;
        }

        setMetrics(metricsRes.data);
        setUserStats(userStatsRes.data);
        setUsers(usersRes.data.users || []);
        setAudit(auditRes.data.bot_actions || []);
      } catch (error) {
        console.error("Failed to fetch admin data:", error);
        toast.error('Failed to load admin data');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [navigate]);

  const handleUpgradeUser = async (email: string, action: string) => {
    try {
      const { error } = await supabase.functions.invoke('admin-metrics', {
        body: { action, email }
      });
      
      if (!error) {
        toast.success(`Successfully ${action === 'make-admin' ? 'promoted to admin' : 'upgraded to premium'}: ${email}`);
        window.location.reload();
      } else {
        toast.error('Failed to update user');
      }
    } catch (error) {
      toast.error('Error updating user');
    }
  };

  if (loading) return <div className="flex items-center justify-center min-h-screen">Loading...</div>;

  if (!metrics || !userStats) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Admin Dashboard"
          description="System metrics and audit logs"
        />
        <Card>
          <CardContent className="p-6">
            <p className="text-muted-foreground">Unable to load admin data. Please ensure you have admin privileges.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Admin Dashboard"
        description="Complete system overview and user management"
      />

      {/* Supabase Debug Panel - Admin Only */}
      <SupabaseDebugPanel />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="users">Users ({userStats.totals.all_users})</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              title="Total Users"
              value={userStats.totals.all_users}
              icon={Users}
            />
            <MetricCard
              title="Active Subscriptions"
              value={metrics.totals.subscriptions}
              icon={TrendingUp}
            />
            <MetricCard
              title="Total Bots"
              value={metrics.totals.bots}
              icon={Bot}
            />
            <MetricCard
              title="New Signups (7d)"
              value={userStats.growth.signups_7d}
              icon={UserPlus}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>User Distribution</CardTitle>
                <CardDescription>Users by subscription tier</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">Free</span>
                    <Badge variant="secondary">{userStats.totals.free}</Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">Starter</span>
                    <Badge variant="secondary">{userStats.totals.starter}</Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">Pro</span>
                    <Badge variant="secondary">{userStats.totals.pro}</Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">Admin</span>
                    <Badge variant="default">{userStats.totals.admin}</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>System Health</CardTitle>
                <CardDescription>Platform performance metrics</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">Active Users</span>
                    <Badge variant="default">{userStats.totals.active}</Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">Running Bots</span>
                    <Badge variant="default">{metrics.active.running_bots}</Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">Alerts (24h)</span>
                    <Badge variant="secondary">{metrics.recent_24h.alerts}</Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">New Bots (24h)</span>
                    <Badge variant="secondary">{metrics.recent_24h.bots_created}</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Recent Signups</CardTitle>
              <CardDescription>Last 10 new users</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {userStats.recent_signups.map((user: any) => (
                  <div key={user.id} className="flex justify-between items-center p-2 rounded bg-muted/50">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium">{user.email}</span>
                      <Badge variant="outline" className="text-xs">
                        {user.role}
                      </Badge>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {new Date(user.created_at).toLocaleDateString()}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="users" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>All Users</CardTitle>
              <CardDescription>Manage user accounts and permissions</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {users.map((user: any) => (
                  <div key={user.id} className="flex justify-between items-center p-3 rounded border bg-card">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-1">
                        <span className="font-medium">{user.email}</span>
                        <Badge variant={user.role === 'admin' ? 'default' : 'secondary'}>
                          {user.role}
                        </Badge>
                        {!user.is_active && <Badge variant="destructive">Inactive</Badge>}
                      </div>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span>ID: {user.id.slice(0, 8)}...</span>
                        <span>Joined: {new Date(user.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {user.role !== 'admin' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleUpgradeUser(user.email, 'make-admin')}
                        >
                          <Shield className="h-3 w-3 mr-1" />
                          Make Admin
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleUpgradeUser(user.email, 'upgrade-premium')}
                      >
                        <TrendingUp className="h-3 w-3 mr-1" />
                        Upgrade
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="activity" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Recent Activity</CardTitle>
              <CardDescription>Bot actions and system events</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {audit.slice(0, 20).map((log, idx) => (
                  <div key={idx} className="flex justify-between items-center p-2 rounded bg-muted/50 text-sm">
                    <span className="text-foreground">{log.msg}</span>
                    <span className="text-muted-foreground">
                      {new Date(log.ts).toLocaleTimeString()}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Admin;
