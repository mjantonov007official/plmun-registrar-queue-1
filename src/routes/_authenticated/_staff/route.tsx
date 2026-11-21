import { Link, Outlet, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  BarChart3,
  Clock3,
  ExternalLink,
  LayoutDashboard,
  Loader2,
  LogOut,
  MonitorPlay,
  Settings2,
  Ticket,
  Users,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/use-staff";
import { BrandMark } from "@/components/queue/brand";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/_staff")({
  component: StaffLayout,
});

const navItem =
  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-sidebar-foreground/75 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground";
const navActive = "bg-sidebar-accent text-sidebar-primary";

function useSignOut() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };
}

function StaffLayout() {
  const { data: me, isLoading } = useMe();
  const signOut = useSignOut();

  if (isLoading) {
    return (
      <div className="grid min-h-screen place-items-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!me?.isStaff) {
    return (
      <div className="paper-grid grid min-h-screen place-items-center px-4">
        <div className="max-w-md rounded-2xl border border-border bg-paper p-8 text-center shadow-ticket">
          <span className="mx-auto grid size-14 place-items-center rounded-full bg-signal/25 text-signal-foreground">
            <Clock3 className="size-7" />
          </span>
          <h1 className="mt-5 text-2xl font-black">Waiting for approval</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            You're signed in as <strong>{me?.email}</strong>. An administrator needs to approve your
            account before you can use the registrar dashboard.
          </p>
          <div className="mt-6 flex justify-center gap-2">
            <Button variant="outline" asChild>
              <Link to="/">Go to kiosk</Link>
            </Button>
            <Button variant="ghost" onClick={signOut}>
              <LogOut /> Sign out
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      <aside className="no-print sticky top-0 hidden h-screen w-64 shrink-0 flex-col bg-sidebar p-4 text-sidebar-foreground lg:flex">
        <div className="px-2 py-2">
          <BrandMark inverted />
        </div>
        <nav className="mt-8 flex flex-col gap-1">
          <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-sidebar-foreground/45">
            Registrar
          </p>
          <Link to="/dashboard" className={navItem} activeProps={{ className: navActive }}>
            <LayoutDashboard className="size-4" /> Queue console
          </Link>
          <Link to="/reports" className={navItem} activeProps={{ className: navActive }}>
            <BarChart3 className="size-4" /> Reports & analytics
          </Link>
          {me.isAdmin && (
            <>
              <p className="px-3 pb-1 pt-5 text-[11px] font-semibold uppercase tracking-[0.18em] text-sidebar-foreground/45">
                Admin
              </p>
              <Link to="/settings" className={navItem} activeProps={{ className: navActive }}>
                <Settings2 className="size-4" /> Services & windows
              </Link>
              <Link to="/staff" className={navItem} activeProps={{ className: navActive }}>
                <Users className="size-4" /> Staff accounts
              </Link>
            </>
          )}
          <p className="px-3 pb-1 pt-5 text-[11px] font-semibold uppercase tracking-[0.18em] text-sidebar-foreground/45">
            Public screens
          </p>
          <a href="/display" target="_blank" rel="noreferrer" className={navItem}>
            <MonitorPlay className="size-4" /> Display board{" "}
            <ExternalLink className="ml-auto size-3.5 opacity-60" />
          </a>
          <a href="/" target="_blank" rel="noreferrer" className={navItem}>
            <Ticket className="size-4" /> Kiosk{" "}
            <ExternalLink className="ml-auto size-3.5 opacity-60" />
          </a>
        </nav>
        <div className="mt-auto rounded-xl border border-sidebar-border p-3">
          <p className="truncate text-sm font-semibold">{me.fullName || me.email}</p>
          <p className="truncate text-xs text-sidebar-foreground/55">
            {me.isAdmin ? "Administrator" : "Registrar staff"}
          </p>
          <Button variant="boardGhost" size="sm" className="mt-3 w-full" onClick={signOut}>
            <LogOut /> Sign out
          </Button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print flex items-center justify-between gap-2 border-b border-border bg-paper px-4 py-3 lg:hidden">
          <BrandMark />
          <Button variant="ghost" size="icon" onClick={signOut} aria-label="Sign out">
            <LogOut />
          </Button>
        </header>
        <nav className="no-print flex gap-1 overflow-x-auto border-b border-border bg-paper px-2 py-2 lg:hidden">
          {[
            { to: "/dashboard", label: "Console" },
            { to: "/reports", label: "Reports" },
            ...(me.isAdmin
              ? [
                  { to: "/settings", label: "Services" },
                  { to: "/staff", label: "Staff" },
                ]
              : []),
          ].map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className="whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground"
              activeProps={{ className: cn("bg-secondary text-foreground") }}
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
