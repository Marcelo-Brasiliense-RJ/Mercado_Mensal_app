"use client";

// Para onde vai o que a pessoa esta registrando. Fica no topo de Falar, Codigo e
// Digitar, ja marcado pela tela de onde veio: no Estoque, "Estoque"; na Lista,
// "Carrinho" ou "Lista". Trocar e um toque, sem mudar de tela.
export type Destino = "estoque" | "carrinho" | "lista";

const INFO: Record<Destino, { icone: string; nome: string; desc: string }> = {
  estoque: { icone: "🏠", nome: "Estoque", desc: "já está em casa" },
  carrinho: { icone: "🛒", nome: "Carrinho", desc: "peguei no mercado" },
  lista: { icone: "📝", nome: "Lista", desc: "ainda vou comprar" },
};

export const nomeDestino = (d: Destino) => INFO[d].nome;

export function DestinoSwitch({
  valor,
  opcoes,
  onChange,
}: {
  valor: Destino;
  opcoes: Destino[];
  onChange: (d: Destino) => void;
}) {
  return (
    <div className="mb-4">
      <div className="mb-1.5 text-xs font-bold text-text-2">Vai para</div>
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${opcoes.length}, minmax(0, 1fr))` }}>
        {opcoes.map((d) => {
          const on = d === valor;
          return (
            <button
              key={d}
              type="button"
              onClick={() => onChange(d)}
              aria-pressed={on}
              className={`flex min-h-[56px] flex-col items-center justify-center rounded-[14px] border-2 px-1.5 py-1.5 text-center ${
                on ? "border-brand bg-brand text-brand-ink" : "border-border bg-card-2"
              }`}
            >
              <span className="text-[15px] font-extrabold leading-tight">
                {INFO[d].icone} {INFO[d].nome}
              </span>
              <span className={`text-[11px] leading-tight ${on ? "opacity-90" : "text-text-3"}`}>{INFO[d].desc}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
