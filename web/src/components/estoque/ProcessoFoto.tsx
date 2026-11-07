"use client";

import { tempoCurto } from "@/lib/format";
import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { FotoItem } from "@/components/ui/FotoItem";
import { nomeBonito } from "@/lib/nomeBonito";
import { unidadesDe } from "@/lib/prateleira";
import { tentarDeNovo, tirarJob, type JobFoto } from "@/lib/filaPrateleira";
import { useDescanso } from "@/lib/filaFotos";

// O processo da foto, ao vivo (toque no aviso "Analisando"): uma luz varre a foto
// enquanto a IA procura; depois cada produto achado surge com o seu quadrado, um por
// um, e o quadrado que esta sendo conferido "respira". Quando termina, o FilaPrateleira
// troca esta tela pela de conferir. Pode fechar a qualquer hora: segue em segundo plano.
export function ProcessoFoto({ job, onClose }: { job: JobFoto; onClose: () => void }) {
  const achados = job.achados ?? [];
  const conferindo = job.estado === "lendo" && job.etapa === "conferindo" && achados.length > 0;
  const faltou = job.estado === "lendo" && job.etapa === "faltou";
  const falhou = job.estado === "falhou";
  const descanso = useDescanso(job.espera ?? 0);
  const [foco, setFoco] = useState(0);

  useEffect(() => {
    if (!conferindo) return;
    const id = setInterval(() => setFoco((f) => f + 1), 650);
    return () => clearInterval(id);
  }, [conferindo]);
  const atual = achados.length ? foco % achados.length : -1;

  const titulo = falhou
    ? "Não deu certo"
    : descanso > 0
      ? `IA no limite · volta em ${tempoCurto(descanso)}`
      : faltou
        ? `Achei ${achados.length} · procurando mais`
        : conferindo
        ? `Achei ${achados.length} ${achados.length > 1 ? "produtos" : "produto"}`
        : "Procurando os produtos";

  return (
    <Modal open onClose={onClose} maxWidth={560}>
      <div className="processo">
        <div className="mb-3 pr-12">
          <div className="text-[13px] font-bold text-brand">{job.destino === "carrinho" ? "🛒 Foto do carrinho" : "📸 Foto dos produtos"}</div>
          <div className="flex items-center gap-2 text-[20px] font-extrabold">
            {titulo}
            {!falhou && (
              <span className="flex gap-1" aria-hidden>
                {[0, 1, 2].map((i) => (
                  <span key={i} className="h-1.5 w-1.5 rounded-full bg-brand" style={{ animation: `pisca 1.2s ${i * 0.2}s infinite` }} />
                ))}
              </span>
            )}
          </div>
          <div className="text-[13px] text-text-2">
            {falhou
              ? job.erro
              : faltou
                ? "Olhando de novo, com zoom, os cantos e o que ficou atrás…"
                : conferindo
                ? "Conferindo um por um para não trocar um produto pelo vizinho…"
                : "A IA está olhando cada canto da foto."}
          </div>
        </div>

        <div className="relative mx-auto w-fit max-w-full overflow-hidden rounded-[16px] bg-black">
          {/* eslint-disable-next-line @next/next/no-img-element -- a foto local que esta sendo lida */}
          <img src={job.src} alt="Foto sendo analisada" className={`block h-auto max-h-[46dvh] w-auto max-w-full transition-opacity duration-500 ${conferindo ? "opacity-80" : "opacity-60"}`} />
          {!conferindo && !falhou && (
            <>
              <div
                className="pointer-events-none absolute inset-0 opacity-30"
                style={{ backgroundImage: "linear-gradient(rgba(255,255,255,.25) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.25) 1px, transparent 1px)", backgroundSize: "28px 28px" }}
              />
              <div
                className="pointer-events-none absolute inset-x-0 h-[18%]"
                style={{
                  background: "linear-gradient(to bottom, transparent, rgba(255,140,90,.55) 85%, #fff 100%)",
                  animation: "varrer 1.8s cubic-bezier(.45,0,.55,1) infinite alternate",
                  boxShadow: "0 6px 18px rgba(255,140,90,.6)",
                }}
              />
            </>
          )}
          {conferindo &&
            achados.map((a, i) => {
              const ativo = i === atual;
              return (
                <div
                  key={i}
                  className="pointer-events-none absolute rounded-[8px]"
                  style={{
                    top: `${a.box[0] * 100}%`,
                    left: `${a.box[1] * 100}%`,
                    height: `${(a.box[2] - a.box[0]) * 100}%`,
                    width: `${(a.box[3] - a.box[1]) * 100}%`,
                    border: `2.5px solid ${ativo ? "#fff" : a.legivel ? "#22c55e" : "#facc15"}`,
                    background: ativo ? "rgba(255,255,255,.18)" : "transparent",
                    boxShadow: ativo ? "0 0 0 3px rgba(255,140,90,.9), 0 0 24px rgba(255,140,90,.8)" : undefined,
                    animation: `surgir .45s ${i * 0.09}s both${ativo ? ", foco .65s ease-in-out" : ""}`,
                  }}
                >
                  {unidadesDe(a) > 1 && (
                    <span className="absolute bottom-1 right-1 rounded-md bg-black/75 px-1.5 py-0.5 text-[11px] font-extrabold text-white">×{unidadesDe(a)}</span>
                  )}
                </div>
              );
            })}
        </div>

        {conferindo && (
          <div className="mt-3 flex max-h-[28dvh] flex-col gap-1.5 overflow-y-auto">
            {achados.map((a, i) => (
              <div
                key={i}
                className={`flex items-center gap-3 rounded-[12px] border px-2 py-1.5 transition-colors ${i === atual ? "border-brand bg-brand-soft" : "border-border bg-card"}`}
                style={{ animation: `entrar .35s ${0.15 + i * 0.09}s both` }}
              >
                {a.nome ? (
                  <FotoItem nome={a.nome} className="h-9 w-9 rounded-[8px]" />
                ) : (
                  <span className="grid h-9 w-9 place-items-center rounded-[8px] bg-card-2 text-[16px]" aria-hidden>❔</span>
                )}
                <span className="min-w-0 flex-1 truncate text-[15px] font-bold">{a.nome ? nomeBonito(a.nome) : "Lendo o rótulo…"}</span>
                {unidadesDe(a) > 1 && <span className="rounded-full bg-card-2 px-2 py-0.5 text-[13px] font-extrabold">×{unidadesDe(a)}</span>}
                <span className="w-5 text-center text-[14px]">{i === atual ? "🔎" : a.legivel ? "✓" : "?"}</span>
              </div>
            ))}
          </div>
        )}

        <div className="mt-3 flex gap-2">
          {falhou ? (
            <>
              <button onClick={() => { tirarJob(job.id); onClose(); }} className="h-[50px] flex-1 rounded-[14px] border border-border bg-card text-[15px] font-bold">
                🗑 Descartar
              </button>
              <button onClick={() => tentarDeNovo(job.id)} className="h-[50px] flex-[2] rounded-[14px] bg-brand text-[15px] font-extrabold text-brand-ink">
                Tentar de novo
              </button>
            </>
          ) : (
            <button onClick={onClose} className="h-[50px] w-full rounded-[14px] border border-border bg-card text-[15px] font-bold">
              Fechar: continuo em segundo plano e aviso
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
