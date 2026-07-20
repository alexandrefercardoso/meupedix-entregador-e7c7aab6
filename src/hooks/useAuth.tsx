import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

export type Profile = {
  id: string;
  full_name: string | null;
  username: string | null;
  store_id: string | null;
  allowed_modules: unknown;
};

const STORAGE_KEY = "meupedix_entregador_profile";

type AuthContextValue = {
  loading: boolean;
  profile: Profile | null;
  isDriver: boolean;
  signIn: (username: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function hasEntregadorModule(allowed: unknown): boolean {
  if (!allowed) return false;
  if (Array.isArray(allowed)) return allowed.includes("entregador");
  if (typeof allowed === "object") {
    const rec = allowed as Record<string, unknown>;
    return rec.entregador === true || rec.entregador === "true";
  }
  return false;
}

function readStored(): Profile | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Profile) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    setProfile(readStored());
    setLoading(false);
  }, []);

  const value: AuthContextValue = {
    loading,
    profile,
    isDriver: hasEntregadorModule(profile?.allowed_modules),
    signIn: async (username, password) => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, username, store_id, allowed_modules")
        .eq("username", username)
        .eq("password", password)
        .maybeSingle();
      if (error) return { error: error.message };
      if (!data) return { error: "Usuário ou senha inválidos." };
      const p = data as Profile;
      if (!hasEntregadorModule(p.allowed_modules)) {
        return { error: "Acesso negado: módulo Entregador não habilitado." };
      }
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
      setProfile(p);
      return { error: null };
    },
    signOut: async () => {
      window.localStorage.removeItem(STORAGE_KEY);
      setProfile(null);
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}