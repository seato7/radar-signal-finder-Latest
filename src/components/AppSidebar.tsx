import {
  Home,
  Bell,
  Tag,
  Radar,
  Star,
  HelpCircle,
  Bot,
  CreditCard,
  Shield,
  LogOut,
  LogIn,
  User,
  Settings,
  BarChart3,
  Sparkles,
  Database,
  Download,
  Activity,
  DollarSign,
  Crosshair,
  type LucideIcon,
} from "lucide-react";
import { NavLink, Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useAuthModal } from "@/contexts/AuthModalContext";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";

type NavItem = { title: string; url: string; icon: LucideIcon };

const navigationItems: NavItem[] = [
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

// Anonymous visitors see only public-preview surfaces.
const publicItems: NavItem[] = [
  { title: "Asset Radar", url: "/asset-radar", icon: Radar },
  { title: "Active Signals", url: "/trading-signals", icon: Crosshair },
  { title: "Themes", url: "/themes", icon: Tag },
  { title: "Pricing", url: "/pricing", icon: CreditCard },
  { title: "Help", url: "/help", icon: HelpCircle },
];

const premiumItems: NavItem[] = [
  { title: "Analytics", url: "/analytics", icon: BarChart3 },
];

const adminItems: NavItem[] = [
  { title: "Admin Panel", url: "/admin", icon: Shield },
  { title: "Data Sources", url: "/data-sources", icon: Database },
  { title: "Data Ingestion", url: "/data-ingestion", icon: Download },
  { title: "API Usage", url: "/api-usage", icon: DollarSign },
  { title: "Health Monitor", url: "/ingestion-health", icon: Activity },
];

function DsNavItem({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  const Icon = item.icon;
  return (
    <SidebarMenuItem>
      <NavLink
        to={item.url}
        end={item.url === "/"}
        className={({ isActive }) =>
          cn(
            "group relative flex items-center gap-3 h-9 px-3 rounded-ds-sm",
            "text-[14px] font-medium transition-colors duration-fast ease-ds-out",
            "border-l-[3px] border-transparent",
            isActive
              ? "text-ds-text-primary bg-ds-brand-primary/[0.07] border-l-ds-brand-primary"
              : "text-ds-text-secondary hover:text-ds-text-primary hover:bg-ds-surface-elevated hover:border-l-ds-brand-primary/40",
          )
        }
      >
        <Icon className="h-[18px] w-[18px] shrink-0" />
        {!collapsed && <span className="truncate">{item.title}</span>}
      </NavLink>
    </SidebarMenuItem>
  );
}

export function AppSidebar() {
  const { state } = useSidebar();
  const { user, logout, userPlan, isAdmin, isPremium, isAuthenticated } = useAuth();
  const { openAuthModal } = useAuthModal();
  const isCollapsed = state === "collapsed";

  const items = isAuthenticated ? navigationItems : publicItems;
  const groupLabel = isAuthenticated ? "Navigation" : "Preview";

  return (
    <Sidebar
      collapsible="icon"
      className="border-r border-ds-border bg-ds-surface"
    >
      <div className="flex items-center gap-2 px-4 h-14 border-b border-ds-border">
        {!isCollapsed ? (
          <>
            <Link to="/" className="font-sans font-semibold text-[15px] tracking-tight">
              <span className="text-ds-brand-primary">Insider</span>
              <span className="text-ds-text-primary">Pulse</span>
            </Link>
            <span
              className="ds-status-pulse ml-auto h-1.5 w-1.5 rounded-full bg-ds-signal-positive"
              aria-label="System online"
              title="System online"
            />
          </>
        ) : (
          <span
            className="ds-status-pulse mx-auto h-1.5 w-1.5 rounded-full bg-ds-signal-positive"
            aria-label="System online"
          />
        )}
      </div>

      <SidebarContent className="bg-ds-surface px-2 py-3">
        <SidebarGroup>
          {!isCollapsed && (
            <SidebarGroupLabel className="text-overline text-ds-text-muted px-3 mb-1">
              {groupLabel}
            </SidebarGroupLabel>
          )}
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.5">
              {items.map((item) => (
                <DsNavItem key={item.title} item={item} collapsed={isCollapsed} />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {isAuthenticated && isPremium() && (
          <SidebarGroup>
            {!isCollapsed && (
              <SidebarGroupLabel className="text-overline text-ds-text-muted px-3 mb-1 mt-2">
                Premium
              </SidebarGroupLabel>
            )}
            <SidebarGroupContent>
              <SidebarMenu className="gap-0.5">
                {premiumItems.map((item) => (
                  <DsNavItem key={item.title} item={item} collapsed={isCollapsed} />
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {isAuthenticated && isAdmin() && (
          <SidebarGroup>
            {!isCollapsed && (
              <SidebarGroupLabel className="text-overline text-ds-text-muted px-3 mb-1 mt-2">
                Admin
              </SidebarGroupLabel>
            )}
            <SidebarGroupContent>
              <SidebarMenu className="gap-0.5">
                {adminItems.map((item) => (
                  <DsNavItem key={item.title} item={item} collapsed={isCollapsed} />
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="border-t border-ds-border bg-ds-surface p-3">
        {isAuthenticated ? (
          !isCollapsed ? (
            <div className="space-y-2.5">
              <div className="flex items-center gap-2 text-[13px] text-ds-text-secondary">
                <User className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{user?.email}</span>
              </div>
              <span
                className={cn(
                  "inline-flex items-center rounded-ds-sm px-2 py-0.5",
                  "text-[11px] font-medium uppercase tracking-wider",
                  "border border-ds-brand-primary/40 text-ds-brand-primary capitalize",
                )}
              >
                {userPlan} Plan
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={logout}
                className="w-full justify-start text-ds-text-secondary hover:text-ds-text-primary hover:bg-ds-surface-elevated h-8"
              >
                <LogOut className="h-4 w-4 mr-2" />
                Logout
              </Button>
            </div>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              onClick={logout}
              title="Logout"
              className="text-ds-text-secondary hover:text-ds-text-primary"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          )
        ) : !isCollapsed ? (
          <div className="space-y-2">
            <p className="text-caption text-ds-text-secondary">
              Free access in 30 seconds. No credit card.
            </p>
            <Button
              asChild
              size="sm"
              className="w-full bg-ds-brand-primary text-ds-brand-primary-foreground hover:bg-ds-brand-secondary"
            >
              <Link to="/auth?mode=signup&ref=sidebar">Start Free Access</Link>
            </Button>
            <Button
              asChild
              variant="ghost"
              size="sm"
              className="w-full justify-center text-ds-text-secondary hover:text-ds-text-primary h-8"
            >
              <Link to="/auth">
                <LogIn className="h-4 w-4 mr-2" /> Sign In
              </Link>
            </Button>
          </div>
        ) : (
          <Button asChild variant="ghost" size="icon" title="Sign in" className="text-ds-text-secondary hover:text-ds-text-primary">
            <Link to="/auth"><LogIn className="h-4 w-4" /></Link>
          </Button>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
