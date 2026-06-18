"use client";
// 管理コンソール共通のトースト（各ページから notify を呼ぶ）。
import { createContext, useCallback, useContext, useState } from "react";

const Ctx = createContext<(m: string) => void>(() => {});
export const useAdminToast = () => useContext(Ctx);

export function AdminToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<string | null>(null);
  const notify = useCallback((m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 3500);
  }, []);
  return (
    <Ctx.Provider value={notify}>
      {children}
      {toast && (
        <div className="fixed left-1/2 bottom-7 z-50 -translate-x-1/2 bg-text text-bg text-sm font-semibold px-4 py-2.5 rounded-[12px] shadow-lg"
          style={{ animation: "dmToast .25s ease" }}>
          {toast}
        </div>
      )}
    </Ctx.Provider>
  );
}
