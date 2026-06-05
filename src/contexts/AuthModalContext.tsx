import React, { createContext, useCallback, useContext, useState } from "react";

export type AuthMode = "signin" | "signup" | "forgot";

interface AuthModalState {
  open: boolean;
  mode: AuthMode;
  ref?: string;
}

interface AuthModalContextValue extends AuthModalState {
  openAuthModal: (mode?: AuthMode, opts?: { ref?: string }) => void;
  closeAuthModal: () => void;
  setMode: (mode: AuthMode) => void;
}

const AuthModalContext = createContext<AuthModalContextValue | undefined>(undefined);

export const AuthModalProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<AuthModalState>({ open: false, mode: "signin" });

  const openAuthModal = useCallback((mode: AuthMode = "signin", opts?: { ref?: string }) => {
    setState({ open: true, mode, ref: opts?.ref });
  }, []);

  const closeAuthModal = useCallback(() => {
    setState((s) => ({ ...s, open: false }));
  }, []);

  const setMode = useCallback((mode: AuthMode) => {
    setState((s) => ({ ...s, mode }));
  }, []);

  return (
    <AuthModalContext.Provider value={{ ...state, openAuthModal, closeAuthModal, setMode }}>
      {children}
    </AuthModalContext.Provider>
  );
};

export const useAuthModal = () => {
  const ctx = useContext(AuthModalContext);
  if (!ctx) throw new Error("useAuthModal must be used within AuthModalProvider");
  return ctx;
};
