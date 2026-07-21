import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

export type Profile = {
  id: string;
  full_name: string | null;
  email: string | null;
  active: boolean | null;
};

const STORAGE_KEY = "meupedix_entregador_driver_v2";

type AuthContextValue = {
  loading: boolean;
  profile: Profile | null;
  isDriver: boolean;
  signIn: (username: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

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
    isDriver: !!profile,
    signIn: async (username, password) => {
      const login = username.includes("@") ? username : `${username}@meupedix.com.br`;
      const { data, error } = await supabase
        .from("drivers")
        .select("id, name, login, active, is_active, password")
        .eq("login", login)
        .eq("password", password)
        .maybeSingle();
      if (error) return { error: error.message };
      if (!data) return { error: "Usuário ou senha inválidos." };
      const d = data as {
        id: string;
        name: string | null;
        login: string | null;
        active: boolean | null;
        is_active: boolean | null;
      };
      if (d.active === false || d.is_active === false) {
        return { error: "Acesso negado: entregador inativo." };
      }
      const p: Profile = {
        id: d.id,
        full_name: d.name,
        email: d.login,
        active: d.active ?? d.is_active ?? true,
      };
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