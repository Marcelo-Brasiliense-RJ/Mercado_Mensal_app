"use client";

import { segundosFmt } from "@/lib/voz";

// O botao de falar, redesenhado (pedido do dono: "muito feio"). Parado: microfone
// num circulo com halo que respira. Gravando: vira um quadrado de parar, com ondas
// saindo e barras que sobem e descem com a voz de verdade (historico do volume).
// Entendendo: anel girando. Sem medidor (reconhecimento do aparelho), as barras
// mexem sozinhas so para mostrar que esta ouvindo.

const BARRAS = 28;

export function Gravador({
  estado,
  nivel,
  historico,
  segundos,
  onToggle,
  disabled,
}: {
  estado: "parado" | "gravando" | "entendendo";
  nivel: number; // 0..1
  historico: number[] | null; // null = sem medidor
  segundos: number;
  onToggle: () => void;
  disabled?: boolean;
}) {
  const gravando = estado === "gravando";
  const entendendo = estado === "entendendo";
  const ultimos = historico ? historico.slice(-BARRAS) : [];
  const barras = Array.from({ length: BARRAS }, (_, i) => ultimos[i - (BARRAS - ultimos.length)] ?? 0);

  return (
    <div className="gravador flex flex-col items-center">
      <div className="relative grid h-[168px] w-[168px] place-items-center">
        {/* halo / ondas */}
        {estado === "parado" && (
          <span
            aria-hidden
            className="absolute h-[124px] w-[124px] rounded-full bg-brand/25"
            style={{ animation: "respira 2.8s ease-in-out infinite" }}
          />
        )}
        {gravando &&
          [0, 0.6, 1.2].map((d) => (
            <span
              key={d}
              aria-hidden
              className="absolute h-[104px] w-[104px] rounded-full border-2 border-neg/50"
              style={{ animation: `onda 1.8s ease-out ${d}s infinite` }}
            />
          ))}
        {gravando && (
          <span
            aria-hidden
            className="absolute h-[104px] w-[104px] rounded-full bg-neg/20 transition-transform duration-100"
            style={{ transform: `scale(${1 + Math.min(1, nivel) * 0.45})` }}
          />
        )}
        {entendendo && (
          <span
            aria-hidden
            className="absolute h-[116px] w-[116px] rounded-full"
            style={{
              background: "conic-gradient(from 0deg, transparent 0 55%, var(--brand) 100%)",
              WebkitMask: "radial-gradient(circle, transparent 54px, #000 55px)",
              mask: "radial-gradient(circle, transparent 54px, #000 55px)",
              animation: "gira 1s linear infinite",
            }}
          />
        )}

        <button
          type="button"
          onClick={onToggle}
          disabled={disabled}
          aria-label={gravando ? "Parar gravação" : "Gravar"}
          className={`relative grid h-[104px] w-[104px] place-items-center rounded-full text-white shadow-[0_10px_30px_-8px_var(--shadow)] transition-[transform,background] duration-300 active:scale-95 ${entendendo ? "" : "disabled:opacity-60"} ${
            gravando ? "bg-neg" : "bg-brand"
          }`}
          style={{
            backgroundImage: gravando
              ? "linear-gradient(145deg, rgba(255,255,255,.18), rgba(0,0,0,.12))"
              : "linear-gradient(145deg, rgba(255,255,255,.22), rgba(0,0,0,.14))",
          }}
        >
          {gravando ? (
            <span className="h-[30px] w-[30px] rounded-[9px] bg-white" />
          ) : (
            <svg width="40" height="40" viewBox="0 0 24 24" aria-hidden>
              <rect x="8.25" y="2.75" width="7.5" height="12" rx="3.75" fill="currentColor" />
              <path
                d="M5.25 11.25a6.75 6.75 0 0 0 13.5 0M12 18v3"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.9"
                strokeLinecap="round"
              />
            </svg>
          )}
        </button>
      </div>

      {/* barras de som */}
      {/* parado: some (fica o espaco, para nada pular quando comeca a gravar) */}
      <div className={`mt-1 flex h-9 items-center gap-[3px] transition-opacity duration-300 ${estado === "parado" ? "opacity-0" : ""}`} aria-hidden>
        {barras.map((v, i) => (
          <span
            key={i}
            className={`w-[3px] origin-center rounded-full ${gravando ? "bg-neg" : entendendo ? "bg-brand/60" : "bg-border"}`}
            style={
              gravando && !historico
                ? { height: "100%", animation: `barra ${0.7 + (i % 5) * 0.12}s ease-in-out ${(i % 7) * 0.08}s infinite` }
                : entendendo
                  ? { height: "100%", animation: `barra 1.1s ease-in-out ${i * 0.04}s infinite` }
                  : { height: `${gravando ? Math.max(10, Math.min(100, v * 100)) : 10}%`, transition: "height 90ms linear" }
            }
          />
        ))}
      </div>

      <div className="mt-2 flex h-7 items-center gap-2">
        {gravando ? (
          <span className="flex items-center gap-2 rounded-full bg-neg-soft px-3 py-1 text-[14px] font-bold tabular-nums text-neg">
            <span className="h-2 w-2 rounded-full bg-neg" style={{ animation: "pisca 1s ease-in-out infinite" }} />
            {segundosFmt(segundos)}
          </span>
        ) : (
          <span className="text-[15px] font-bold text-text-2">{entendendo ? "Entendendo…" : "Toque para falar"}</span>
        )}
      </div>
    </div>
  );
}
