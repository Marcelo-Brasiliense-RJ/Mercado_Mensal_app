"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { createClient } from "@/lib/supabase/client";

// Familia do usuario logado, lida do Supabase (mercado_my_household).
// null = usuario autenticado mas ainda sem familia (cai no onboarding).
export type Household = {
  household_id: string;
  familia: string;
  invite_code: string;
  role: string;
};

type Ctx = {
  household: Household | null;
  loading: boolean;
  reload: () => Promise<void>;
};

const HouseholdCtx = createContext<Ctx | null>(null);

export function useHousehold(): Ctx {
  const c = useContext(HouseholdCtx);
  if (!c) throw new Error("useHousehold fora do HouseholdProvider");
  return c;
}

export function HouseholdProvider({ children }: { children: React.ReactNode }) {
  const [household, setHousehold] = useState<Household | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    // Sem sessao valida as RPCs rodam como anon (permission denied). Nesse caso
    // o lugar certo e o login, nao o onboarding de familia.
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      window.location.assign("/entrar");
      return;
    }
    const { data } = await supabase.rpc("mercado_my_household");
    // A RPC devolve null quando o usuario ainda nao tem familia.
    setHousehold((data as Household | null) ?? null);
    setLoading(false);
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return (
    <HouseholdCtx.Provider value={{ household, loading, reload }}>
      {children}
    </HouseholdCtx.Provider>
  );
}
