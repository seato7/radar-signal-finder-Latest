import { Home, Bell, TrendingUp, Tag, Radar, Star, HelpCircle, Bot, CreditCard, Shield, LogOut, User, Settings, BarChart3, RefreshCw, Sparkles, Database, Download, Activity, DollarSign, Crosshair } from "lucide-react";
import { isPremiumOrAbove } from "@/lib/planLimits";
import { NavLink } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";

const navigationItems = [
  { title: "Dashboard", url: "/dashboard", icon: Home },
  { title: "AI Assistant", url: "/assistant", icon: Sparkles },
  { title: "Alerts", url: "/alerts", icon: Bell },
  { title: "Asset Radar", url: "/asset-radar", icon: Radar },
  { title: "Watchlist", url: "/watchlist", icon: Star },
  { title: "Active Signals", url: "/trading-signals", icon: Crosshair },
  { title: "Trading Bots", url: "/bots", icon: Bot },
  { title: "Themes", url: "/themes", icon: Tag },
  { title: "Pricing", url: "/pricing", icon: CreditCard },
  { title: "Settings", url: "/settings", icon: Settings },
  { title: "Help", url: "/help", icon: HelpCircle },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const { user, logout, userPlan, isAdmin, isPremium } = useAuth();
  const isCollapsed = state === "collapsed";

  const getPlanBadgeVariant = (plan: string) => {
    switch (plan) {
      case 'enterprise':
      case 'premium':
        return 'default';
      case 'pro':
      case 'starter':
        return 'secondary';
      default:
        return 'outline';
    }
  };

  return (
    <Sidebar collapsible="icon" className="border-r border-border">
      <div className="flex items-center justify-between p-4 border-b border-border">
        {!isCollapsed && (
          <h2 className="text-lg font-bold bg-gradient-chrome bg-clip-text text-transparent">
            InsiderPulse
          </h2>
        )}
        <SidebarTrigger className="ml-auto" />
      </div>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navigationItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end={item.url === "/"}
                      className={({ isActive }) =>
                        isActive
                          ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                          : "hover:bg-sidebar-accent/50"
                      }
                    >
                      <item.icon className="h-4 w-4" />
                      {!isCollapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        
        {isPremium() && (
          <SidebarGroup>
            <SidebarGroupLabel>Premium</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <NavLink to="/analytics">
                      <BarChart3 className="h-4 w-4" />
                      {!isCollapsed && <span>Analytics</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {isAdmin() && (
          <SidebarGroup>
            <SidebarGroupLabel>Admin</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <NavLink to="/admin">
                      <Shield className="h-4 w-4" />
                      {!isCollapsed && <span>Admin Panel</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <NavLink to="/data-sources">
                      <Database className="h-4 w-4" />
                      {!isCollapsed && <span>Data Sources</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <NavLink to="/data-ingestion">
                      <Download className="h-4 w-4" />
                      {!isCollapsed && <span>Data Ingestion</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <NavLink to="/api-usage">
                      <DollarSign className="h-4 w-4" />
                      {!isCollapsed && <span>API Usage</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <NavLink to="/ingestion-health">
                      <Activity className="h-4 w-4" />
                      {!isCollapsed && <span>Health Monitor</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="border-t border-border p-4">
        {!isCollapsed && (
          <div className="space-y-2">
            <div className="flex flex-col gap-2 text-sm">
              <div className="flex items-center gap-2">
                <User className="h-4 w-4" />
                <span className="font-medium truncate">{user?.email}</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={getPlanBadgeVariant(userPlan)} className="w-fit capitalize">
                  {userPlan} Plan
                </Badge>
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => window.location.reload()}
                  title="Refresh plan status"
                  className="h-6 px-2"
                >
                  <RefreshCw className="h-3 w-3" />
                </Button>
              </div>
            </div>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={logout}
              className="w-full"
            >
              <LogOut className="h-4 w-4 mr-2" />
              Logout
            </Button>
          </div>
        )}
        {isCollapsed && (
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={logout}
            title="Logout"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
