import { useAuthContext, type AuthContextValue } from "../contexts/AuthContext.js";

/** App-wide auth state. See AuthProvider. */
export function useAuth(): AuthContextValue {
  return useAuthContext();
}
