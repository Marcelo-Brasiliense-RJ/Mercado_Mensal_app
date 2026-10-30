// Item que provavelmente e o mesmo produto com outro nome ("tipity granulada torrada" e
// "farinha de mandioca tipity granulada 500g"). Pelas palavras que identificam (sem
// tamanho e palavras vazias): pelo menos 2 em comum e metade das do nome menor.
import { palavras } from "./fotoPorNome";

export function parecidos<T extends { name: string }>(nome: string, itens: T[], limite = 3): T[] {
  const a = new Set(palavras(nome));
  if (a.size < 2) return [];
  const exato = nome.trim().toLowerCase();
  return itens
    .filter((i) => i.name.trim().toLowerCase() !== exato)
    .map((i) => {
      const b = new Set(palavras(i.name));
      const comuns = [...a].filter((p) => b.has(p)).length;
      return { i, comuns, menor: Math.min(a.size, b.size) };
    })
    .filter((x) => x.comuns >= 2 && x.comuns >= x.menor / 2)
    .sort((x, y) => y.comuns - x.comuns)
    .slice(0, limite)
    .map((x) => x.i);
}

// Repetidos no estoque, para o app oferecer juntar sozinho. Mais rigido que `parecidos`:
// todas as palavras do nome menor estao no maior ("oleo de soja coamo 900ml" e "oleo de
// soja coamo refinado 900ml"), assim "leite integral italac" e "... piracanjuba" nao entram.
export function repetidos<T extends { id: string; name: string }>(itens: T[]): T[][] {
  const ps = itens.map((i) => new Set(palavras(i.name)));
  const pai = itens.map((_, i) => i);
  const raiz = (i: number): number => (pai[i] === i ? i : (pai[i] = raiz(pai[i])));
  for (let i = 0; i < itens.length; i++)
    for (let j = i + 1; j < itens.length; j++) {
      const [a, b] = ps[i].size <= ps[j].size ? [ps[i], ps[j]] : [ps[j], ps[i]];
      if (a.size >= 2 && [...a].every((p) => b.has(p))) pai[raiz(i)] = raiz(j);
    }
  const grupos = new Map<number, T[]>();
  itens.forEach((it, i) => grupos.set(raiz(i), [...(grupos.get(raiz(i)) ?? []), it]));
  return [...grupos.values()].filter((g) => g.length > 1);
}
