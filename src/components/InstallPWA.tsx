import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISS_KEY = "meupedix_install_dismissed_at";
const HIDE_DAYS = 7;

export function InstallPWA() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const isStandalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      // iOS
      (window.navigator as unknown as { standalone?: boolean }).standalone;
    if (isStandalone) return;

    const dismissed = Number(localStorage.getItem(DISMISS_KEY) || 0);
    if (dismissed && Date.now() - dismissed < HIDE_DAYS * 86400_000) return;

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setVisible(true);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  if (!visible || !deferred) return null;

  const install = async () => {
    try {
      await deferred.prompt();
      await deferred.userChoice;
    } finally {
      setDeferred(null);
      setVisible(false);
    }
  };

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setVisible(false);
  };

  return (
    <div className="fixed inset-x-3 bottom-20 z-50 flex items-center gap-3 rounded-xl border border-border bg-card p-3 shadow-lg">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <Download className="h-5 w-5" />
      </div>
      <div className="flex-1 text-sm">
        <div className="font-semibold">Instalar app</div>
        <div className="text-xs text-muted-foreground">
          Acesso rápido pelo ícone do celular
        </div>
      </div>
      <Button size="sm" onClick={install}>Instalar</Button>
      <button aria-label="Fechar" onClick={dismiss} className="p-1 text-muted-foreground">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}