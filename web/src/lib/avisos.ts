// Avisos para a familia (Web Push): o que cada um faz no app chega no celular dos outros.
// Pura (monta o texto) para testar sem rede; quem envia e /api/avisar.
export type TipoAviso = "lista" | "tirou" | "acabou" | "mercado" | "compra";
export type Aviso = { tipo: TipoAviso; nomes: string[]; total?: number; itens?: number };

const juntar = (nomes: string[]) => {
  const u = [...new Set(nomes.map((n) => n.trim()).filter(Boolean))];
  if (u.length <= 3) return u.join(", ");
  return `${u.slice(0, 3).join(", ")} e mais ${u.length - 3}`;
};
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function textoAviso(quem: string, a: Aviso): { title: string; body: string; tag: string; url: string } {
  switch (a.tipo) {
    case "lista":
      return { title: `📝 ${quem} pôs na lista`, body: juntar(a.nomes), tag: "familia-lista", url: "/app/lista" };
    case "tirou":
      return { title: `${quem} tirou da lista`, body: juntar(a.nomes), tag: "familia-lista", url: "/app/lista" };
    case "acabou":
      return { title: `⚠️ Acabou em casa`, body: `${juntar(a.nomes)} · avisado por ${quem}`, tag: "familia-acabou", url: "/app/estoque" };
    case "mercado":
      return { title: `🛒 ${quem} está no mercado`, body: "Ponha na lista o que faltar: aparece na hora no celular dele.", tag: "familia-mercado", url: "/app/lista" };
    case "compra":
      return {
        title: `✅ ${quem} finalizou a compra`,
        body: [a.total != null ? brl(a.total) : "", a.itens ? `${a.itens} itens` : ""].filter(Boolean).join(" · ") || "A despensa já foi atualizada.",
        tag: "familia-compra",
        url: "/app/economia",
      };
  }
}

// Junta avisos do mesmo tipo feitos em sequencia (por 5 itens seguidos na lista vira um
// aviso so, nao cinco).
export function agrupar(fila: Aviso[]): Aviso[] {
  const out: Aviso[] = [];
  for (const a of fila) {
    const ult = out.find((x) => x.tipo === a.tipo && (a.tipo === "lista" || a.tipo === "tirou" || a.tipo === "acabou"));
    if (ult) ult.nomes.push(...a.nomes);
    else out.push({ ...a, nomes: [...a.nomes] });
  }
  return out;
}
