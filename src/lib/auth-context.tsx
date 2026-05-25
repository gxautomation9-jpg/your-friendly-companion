import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

type AnonUser = { id: string; email: string };
type AuthCtx = {
  user: AnonUser | null;
  loading: boolean;
  signOut: () => Promise<void>;
};

const Ctx = createContext<AuthCtx>({ user: null, loading: true, signOut: async () => {} });

async function ensureSession(): Promise<AnonUser | null> {
  const { data } = await supabase.auth.getSession();
  if (data.session?.user) {
    const u = data.session.user;
    return { id: u.id, email: u.email ?? "guest@astra.ai" };
  }
  const { data: signIn, error } = await supabase.auth.signInAnonymously();
  if (error || !signIn.user) {
    console.error("[auth] anon sign-in failed:", error);
    return null;
  }
  return { id: signIn.user.id, email: signIn.user.email ?? "guest@astra.ai" };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AnonUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session?.user) setUser({ id: session.user.id, email: session.user.email ?? "guest@astra.ai" });
    });
    ensureSession().then((u) => { setUser(u); setLoading(false); });
    return () => subscription.unsubscribe();
  }, []);

  return (
    <Ctx.Provider value={{
      user,
      loading,
      signOut: async () => {
        await supabase.auth.signOut();
        const u = await ensureSession();
        setUser(u);
      },
    }}>
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
