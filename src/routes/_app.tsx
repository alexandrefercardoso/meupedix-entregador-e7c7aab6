import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { Package, MapPin, User } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app")({
  ssr: false,
  component: AppLayout,
});

function AppLayout() {
  const { loading, profile, isDriver } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (!profile || !isDriver) {
      navigate({ to: "/auth", replace: true });
    }
  }, [loading, profile, isDriver, navigate]);

  if (loading || !profile || !isDriver) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <main className="flex-1 pb-20">
        <Outlet />
      </main>
      <BottomTabs />
    </div>
  );
}

function BottomTabs() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const tabs = [
    { to: "/entregas", label: "Entregas", icon: MapPin },
    { to: "/pedidos", label: "Pedidos", icon: Package },
    { to: "/perfil", label: "Meu Perfil", icon: User },
  ] as const;

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card">
      <div className="mx-auto grid max-w-lg grid-cols-3">
        {tabs.map((t) => {
          const active = pathname === t.to || pathname.startsWith(t.to + "/");
          const Icon = t.icon;
          return (
            <Link
              key={t.to}
              to={t.to}
              className={cn(
                "flex flex-col items-center justify-center gap-1 py-2.5 text-xs font-medium transition-colors",
                active ? "text-primary" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="h-5 w-5" />
              {t.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}