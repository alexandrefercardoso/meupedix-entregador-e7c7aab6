import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { applyPWAUpdate, SW_UPDATE_EVENT } from "@/lib/pwa-register";

export function PwaUpdateBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = () => setVisible(true);
    window.addEventListener(SW_UPDATE_EVENT, handler);
    return () => window.removeEventListener(SW_UPDATE_EVENT, handler);
  }, []);

  if (!visible) return null;

  return (
    <div
      className="fixed inset-x-3 top-3 z-[70] flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 shadow-lg"
      style={{ paddingTop: "max(0.5rem, env(safe-area-inset-top))" }}
    >
      <RefreshCw className="h-4 w-4 text-primary" />
      <span className="flex-1 text-xs font-medium text-foreground">
        🔄 Atualização disponível
      </span>
      <Button size="sm" onClick={applyPWAUpdate}>
        Atualizar agora
      </Button>
    </div>
  );
}