import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { LogOut, Store, User as UserIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_app/perfil")({
  ssr: false,
  component: PerfilPage,
});

function PerfilPage() {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  const [storeName, setStoreName] = useState<string | null>(null);

  useEffect(() => {
    if (!profile?.store_id) return;
    supabase
      .from("stores")
      .select("name")
      .eq("id", profile.store_id)
      .maybeSingle()
      .then(({ data }) => setStoreName((data as { name?: string } | null)?.name ?? null));
  }, [profile?.store_id]);

  const handleSignOut = async () => {
    await signOut();
    navigate({ to: "/auth", replace: true });
  };

  return (
    <div className="mx-auto max-w-lg">
      <header className="border-b border-border bg-background px-4 py-3">
        <h1 className="text-lg font-semibold text-foreground">Meu Perfil</h1>
      </header>
      <div className="space-y-3 p-4">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <UserIcon className="h-6 w-6" />
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Entregador</div>
              <div className="font-semibold text-foreground">
                {profile?.full_name ?? profile?.email ?? "—"}
              </div>
              {profile?.email && (
                <div className="text-xs text-muted-foreground">{profile.email}</div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/20 text-accent-foreground">
              <Store className="h-6 w-6" />
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Loja vinculada</div>
              <div className="font-semibold text-foreground">{storeName ?? "—"}</div>
            </div>
          </CardContent>
        </Card>

        <Button variant="destructive" className="w-full" onClick={handleSignOut}>
          <LogOut className="mr-2 h-4 w-4" /> Sair
        </Button>
      </div>
    </div>
  );
}