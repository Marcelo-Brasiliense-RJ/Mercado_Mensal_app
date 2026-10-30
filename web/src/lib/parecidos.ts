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
