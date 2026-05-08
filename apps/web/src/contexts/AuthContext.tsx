import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { User } from "@moc/contracts";
import { HttpError } from "@moc/web-core";
import { fetchMe } from "../features/auth/api.js";

export type AuthState =
  | { status: "loading" }
  | { status: "unauthenticated"; error: Error | null }
  | { status: "authenticated"; user: User };

export interface AuthContextValue {
  state: AuthState;
  refresh: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }): JSX.Element {
  const [state, setState] = useState<AuthState>({ status: "loading" });

  const refresh = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const user = await fetchMe();
      setState({ status: "authenticated", user });
    } catch (err) {
      if (err instanceof HttpError && err.status === 401) {
        setState({ status: "unauthenticated", error: null });
        return;
      }
      const wrapped = err instanceof Error ? err : new Error(String(err));
      setState({ status: "unauthenticated", error: wrapped });
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return <AuthContext.Provider value={{ state, refresh }}>{children}</AuthContext.Provider>;
}

export function useAuthContext(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
