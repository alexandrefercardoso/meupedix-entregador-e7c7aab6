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
    const installed = () => setVisible(false);
    window.addEventListener("appinstalled", installed);
    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", installed);
    };
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
    <div className="sticky top-0 z-40 flex items-center gap-2 border-b border-border bg-card/95 px-3 py-2 backdrop-blur">
      <Download className="h-4 w-4 shrink-0 text-primary" />
      <span className="flex-1 truncate text-xs text-foreground">
        📱 Instale o app na tela inicial para usar offline
      </span>
      <Button size="sm" className="h-7 px-2 text-xs" onClick={install}>
        Instalar
      </Button>
      <button
        aria-label="Fechar"
        onClick={dismiss}
        className="p-1 text-muted-foreground"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}