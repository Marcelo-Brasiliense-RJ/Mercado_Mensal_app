#!/usr/bin/env bash
# Rodada do monitor: coleta, le com IA, gera fotos e publica no app (aba Ofertas).
# Uso: ./rodar_semana.sh [mercados...]   (sem argumento: todos)
# Precisa no ambiente: GEMINI_API_KEY (e _2, _3...), OPENROUTER_API_KEY,
# SUPABASE_URL (ou NEXT_PUBLIC_SUPABASE_URL) e SUPABASE_SERVICE_ROLE_KEY.
# Um mercado que falha nao para os outros; o script sai com erro se algum falhou.
set -u
cd "$(dirname "$0")/coletor"
uv sync -q
falhou=0
for passo in coletar extrair fotos publicar; do
  echo "== $passo $*"
  uv run promocoes "$passo" "$@" || falhou=1
done
exit $falhou
