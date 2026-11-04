import type { NextConfig } from "next";

// Identifica cada deploy. O app aberto no celular compara a sua versao com a do
// servidor (api/versao) e se atualiza sozinho quando sai uma nova.
const VERSAO = process.env.VERCEL_GIT_COMMIT_SHA || String(Date.now());

const nextConfig: NextConfig = {
  env: { NEXT_PUBLIC_VERSAO: VERSAO },
};

export default nextConfig;
