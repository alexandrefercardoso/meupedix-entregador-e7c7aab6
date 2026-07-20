import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { Loader2, LogIn, Bike } from "lucide-react";

export const Route = createFileRoute("/auth")({
  ssr: false,
  component: AuthPage,
});

function AuthPage() {
  const { profile, loading, signIn, isDriver } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Route accepted users away from /auth; deny non-drivers.
  useEffect(() => {
    if (loading) return;
    if (profile && isDriver) {
      navigate({ to: "/pedidos", replace: true });
    }
  }, [loading, profile, isDriver, navigate]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const { error } = await signIn(username.trim(), password);
    setSubmitting(false);
    if (error) toast.error(error);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="flex flex-col items-center text-center">
          <div className="flex h-24 w-24 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Bike className="h-12 w-12" strokeWidth={2.25} />
          </div>
          <div className="mt-3 text-lg font-extrabold tracking-tight text-foreground">
            Meu<span className="italic text-primary">pedix</span> Delivery
          </div>
          <h1 className="mt-5 text-xl font-bold text-foreground">
            Painel do <span className="italic text-primary">Entregador</span>
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Gestão Inteligente de Entregas</p>
        </div>

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div className="space-y-1.5">
            <label
              htmlFor="username"
              className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
            >
              Credencial de acesso
            </label>
            <div className="flex overflow-hidden rounded-full border border-border bg-muted/40 focus-within:ring-2 focus-within:ring-ring">
              <Input
                id="username"
                type="text"
                autoComplete="username"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="usuario"
                className="h-11 flex-1 rounded-none border-0 bg-transparent px-4 shadow-none focus-visible:ring-0"
              />
              <span className="flex items-center border-l border-border bg-background px-3 text-sm text-muted-foreground">
                @meupedix.com.br
              </span>
            </div>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="password"
              className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
            >
              Código de segurança
            </label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Sua senha secreta"
              className="h-11 rounded-full border-border bg-muted/40 px-4"
            />
          </div>

          <Button
            type="submit"
            disabled={submitting}
            className="h-12 w-full rounded-full text-base font-semibold"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                Acessar Painel <LogIn className="ml-1 h-4 w-4" />
              </>
            )}
          </Button>
        </form>

        <p className="mt-5 text-center text-[11px] uppercase tracking-wider text-muted-foreground">
          © {new Date().getFullYear()} Sistema de Gestão Delivery
        </p>
      </div>
    </div>
  );
}