import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

interface AuthContextType {
  isAdmin: boolean;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<boolean>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  isAdmin: false,
  loading: false,
  signIn: async () => false,
  signOut: async () => {},
});

// Checks the public.user_roles table (via the SECURITY DEFINER has_role RPC)
// for an 'admin' role granted to the given user. Failing closed: any error
// resolves to false.
const checkIsAdmin = async (userId: string): Promise<boolean> => {
  const { data, error } = await supabase.rpc("has_role", {
    _user_id: userId,
    _role: "admin",
  });
  if (error) {
    console.error("Failed to resolve admin role:", error.message);
    return false;
  }
  return data === true;
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  // Restore the persisted Supabase session and subscribe to future auth
  // changes (sign-in, sign-out, token refresh).
  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      if (!data.session) setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      // Keep this callback free of Supabase queries to avoid deadlocks —
      // role resolution happens in the effect below.
      setSession(newSession);
      if (!newSession) {
        setIsAdmin(false);
        setLoading(false);
      } else {
        setLoading(true);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // Resolve the admin role whenever the session changes.
  useEffect(() => {
    if (!session) return;
    let cancelled = false;

    checkIsAdmin(session.user.id).then((admin) => {
      if (cancelled) return;
      setIsAdmin(admin);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [session]);

  const signIn = async (email: string, password: string): Promise<boolean> => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.user) {
      return false;
    }

    const admin = await checkIsAdmin(data.user.id);
    if (!admin) {
      // Authenticated but not an admin — do not keep the session around.
      await supabase.auth.signOut();
      setSession(null);
      setIsAdmin(false);
      return false;
    }

    setSession(data.session);
    setIsAdmin(true);
    setLoading(false);
    return true;
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setIsAdmin(false);
  };

  return (
    <AuthContext.Provider value={{ isAdmin, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
