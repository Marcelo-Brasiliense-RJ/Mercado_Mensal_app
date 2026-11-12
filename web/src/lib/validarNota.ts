// Validacao da nota "ridiculamente facil" (pedido do dono): depois de ler a nota, cada
// item cai num de tres grupos e a pessoa so mexe num deles.
// - certo: casou com a lista, o carrinho ou a despensa -> ja vai, sem pergunta.
// - novo: nao casou com nada -> entra direto na despensa como produto novo.
// - duvida: linha borrada, nome curto demais ou casou com 2+ itens da lista -> pergunta,
//   um de cada vez.
import { mesmoProduto } from "./prateleira";

export type Duvida =
  | { i: number; tipo: "ilegivel" }
  | { i: number; tipo: "lista"; opcoes: { id: string; name: string }[] };

export type Grupos = { certos: number[]; novos: number[]; duvidas: Duvida[]; riscar: Record<number, string> };

export function agrupar(
  nota: { nome: string; duvida?: boolean }[],
  lista: { id: string; name: string; status: string }[],
  conhecidos: string[], // nomes da despensa e do carrinho
): Grupos {
  const pend = lista.filter((l) => l.status === "pending");
  const g: Grupos = { certos: [], novos: [], duvidas: [], riscar: {} };
  nota.forEach((n, i) => {
    const nome = n.nome.trim();
    if (n.duvida || nome.replace(/[^a-zà-ú]/gi, "").length < 3) {
      g.duvidas.push({ i, tipo: "ilegivel" });
      return;
    }
    const naLista = pend.filter((l) => mesmoProduto(l.name, nome));
    if (naLista.length > 1) {
      g.duvidas.push({ i, tipo: "lista", opcoes: naLista.map((l) => ({ id: l.id, name: l.name })) });
      return;
    }
    if (naLista.length === 1) {
      g.riscar[i] = naLista[0].id;
      g.certos.push(i);
      return;
    }
    if (conhecidos.some((c) => mesmoProduto(c, nome))) g.certos.push(i);
    else g.novos.push(i);
  });
  return g;
}
