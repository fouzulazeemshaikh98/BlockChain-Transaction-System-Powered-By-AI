import { createContext, useContext, useState, ReactNode } from "react";
import {
  AuthUser,
  RegisterResult,
  getCurrentUser,
  login as apiLogin,
  register as apiRegister,
  verifyEmail as apiVerifyEmail,
  logout as apiLogout,
} from "../lib/api";

interface AuthContextValue {
  user: AuthUser | null;
  isAdmin: boolean;
  login: (email: string, password: string, remember?: boolean) => Promise<AuthUser>;
  register: (
    fullName: string,
    email: string,
    password: string,
    confirmPassword: string,
    pin: string,
    confirmPin: string
  ) => Promise<RegisterResult>;
  verifyEmail: (email: string, code: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(getCurrentUser());

  async function login(email: string, password: string, remember = true) {
    const loggedInUser = await apiLogin(email, password, remember);
    setUser(loggedInUser);
    return loggedInUser;
  }

  // Registration no longer logs the user in - it returns the simulated
  // verification "email" so the caller can route to /verify-email.
  async function register(
    fullName: string,
    email: string,
    password: string,
    confirmPassword: string,
    pin: string,
    confirmPin: string
  ) {
    return apiRegister(fullName, email, password, confirmPassword, pin, confirmPin);
  }

  async function verifyEmail(email: string, code: string) {
    setUser(await apiVerifyEmail(email, code));
  }

  function logout() {
    apiLogout();
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, isAdmin: user?.role === "Admin", login, register, verifyEmail, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
