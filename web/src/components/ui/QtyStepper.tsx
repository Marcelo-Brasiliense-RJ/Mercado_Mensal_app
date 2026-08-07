"use client";

import { stepFor } from "@/lib/defaults";

// Quantidade ajustavel por toque, com o campo continuando ali para quem quer um
// valor exato (regra 3 da decisao de produto: teclado e opcao, nao caminho padrao).
// Guarda o valor como string, no mesmo formato que os campos ja usavam, entao quem
// chama nao muda a leitura (Number(v.replace(",", "."))).
export function QtyStepper({
  value,
  onChange,
  unit,
  placeholder,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  unit: string;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const passo = stepFor(unit);

  function anda(dir: 1 | -1) {
    const atual = Number(value.replace(",", ".")) || 0;
    // toFixed(2) evita 0.30000000000000004 ao somar meio a meio.
    const novo = Math.max(0, +(atual + dir * passo).toFixed(2));
    onChange(String(novo).replace(".", ","));
  }

  // 44px de largura, nao 48: ao lado do select de unidade, 48 estourava a largura
  // do modal em telas de 360px. A altura fica em 48 para alinhar com os campos.
  const btn =
    "grid h-12 w-11 shrink-0 place-items-center rounded-[12px] border border-border bg-card-2 text-[20px] font-bold disabled:opacity-40";

  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <button
        type="button"
        onClick={() => anda(-1)}
        disabled={(Number(value.replace(",", ".")) || 0) <= 0}
        aria-label="Diminuir quantidade"
        className={btn}
      >
        −
      </button>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode="decimal"
        placeholder={placeholder}
        autoFocus={autoFocus}
        aria-label="Quantidade"
        className="h-12 w-full min-w-0 flex-1 rounded-[12px] border border-border bg-card-2 px-1 text-center text-[15px]"
      />
      <button
        type="button"
        onClick={() => anda(1)}
        aria-label="Aumentar quantidade"
        className={btn}
      >
        +
      </button>
    </div>
  );
}