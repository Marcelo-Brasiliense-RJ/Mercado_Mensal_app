"use client";

// Ja existe no estoque: so quem esta com o produto na mao sabe se a foto/codigo e
// compra nova (somar) ou contagem do que tem (substituir). O app mostra o confronto
// e a pessoa escolhe. Mesma peca na foto de produto, no codigo e na prateleira.
export type Modo = "somar" | "substituir";

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace(".", ","));

export function SomarOuSubstituir({
  atual,
  unidade,
  qtd,
  modo,
  onModo,
  compacto = false,
}: {
  atual: number;
  unidade: string;
  qtd: number;
  modo: Modo;
  onModo: (m: Modo) => void;
  compacto?: boolean;
}) {
  const opcoes: [Modo, string, string][] = [
    ["somar", "＋ Somar", `${fmt(atual)} + ${fmt(qtd)} = ${fmt(atual + qtd)} ${unidade}`],
    ["substituir", "＝ Substituir", `fica ${fmt(qtd)} ${unidade}`],
  ];
  return (
    <div className={compacto ? "" : "mb-4"}>
      {!compacto && (
        <div className="mb-1.5 text-[13px] font-bold text-text-2">
          Você já tem <b className="text-text">{fmt(atual)} {unidade}</b> no estoque. Isso é:
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        {opcoes.map(([m, titulo, conta]) => (
          <button
            key={m}
            type="button"
            onClick={() => onModo(m)}
            aria-pressed={modo === m}
            className={`rounded-[13px] border-2 px-2.5 py-2 text-left ${
              modo === m ? "border-brand bg-brand-soft" : "border-border bg-card"
            }`}
          >
            <span className="block text-[14px] font-extrabold">{titulo}</span>
            <span className="block text-[11px] leading-tight text-text-2">{conta}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
