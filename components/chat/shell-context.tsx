"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type ShellContextValue = {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  previewOpen: boolean;
  setPreviewOpen: (open: boolean) => void;
};

const ShellContext = createContext<ShellContextValue | null>(null);

export function ShellProvider({ children }: { children: ReactNode }) {
  const [sidebarOpen, setSidebarOpenState] = useState(true);
  const [previewOpen, setPreviewOpenState] = useState(false);
  const [userPinnedOpen, setUserPinnedOpen] = useState(false);

  const setSidebarOpen = useCallback((open: boolean) => {
    setSidebarOpenState(open);
    setUserPinnedOpen(open);
  }, []);

  const toggleSidebar = useCallback(() => {
    setSidebarOpenState((prev) => {
      const next = !prev;
      setUserPinnedOpen(next);
      return next;
    });
  }, []);

  const setPreviewOpen = useCallback(
    (open: boolean) => {
      setPreviewOpenState(open);
      if (open && !userPinnedOpen) {
        setSidebarOpenState(false);
      }
      if (!open && !userPinnedOpen) {
        setSidebarOpenState(true);
      }
    },
    [userPinnedOpen],
  );

  const value = useMemo(
    () => ({
      sidebarOpen,
      setSidebarOpen,
      toggleSidebar,
      previewOpen,
      setPreviewOpen,
    }),
    [sidebarOpen, setSidebarOpen, toggleSidebar, previewOpen, setPreviewOpen],
  );

  return (
    <ShellContext.Provider value={value}>{children}</ShellContext.Provider>
  );
}

export function useShell() {
  const ctx = useContext(ShellContext);
  if (!ctx) {
    throw new Error("useShell must be used within ShellProvider");
  }
  return ctx;
}
