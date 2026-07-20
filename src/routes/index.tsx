import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/")({
  ssr: false,
  component: IndexRedirect,
});

function IndexRedirect() {
  const { loading, profile, isDriver } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (loading) return;
    if (profile && isDriver) navigate({ to: "/pedidos", replace: true });
    else navigate({ to: "/auth", replace: true });
  }, [loading, profile, isDriver, navigate]);
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  );
}