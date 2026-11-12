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

// Repetidos no estoque, para o app oferecer juntar (dono, 2026-11-12: "alcatra" e
// "alcatra com maminha", "ovo" e "ovos", "farinha panco" e "farinha panko"; "deixe mais
// facil de juntar"). E sugestao: a pessoa confirma ou diz "nao sao o mesmo". Mesmo produto:
// - as mesmas palavras, contando singular/plural e acento ("ovo"/"ovos", "haste
//   flexivel"/"hastes flexiveis");
// - o nome inteiro com uma letra trocada ("farinha panco"/"farinha panko");
// - todas as palavras do menor estao no maior ("oleo de soja coamo"/"... refinado"), e
//   com uma palavra so, se o maior COMECA por ela e a segunda palavra nao faz outro
//   produto ("alcatra"/"alcatra com maminha" sim; "leite"/"leite condensado" nao).
const OUTRO_PRODUTO = new Set(
  `condensado condensada palha fermentado fermentada pipoca panko panco moida moido po ralado ralada mandioca trigo milho
  coco doce verde instantaneo instantanea congelada congelado frita frito defumada defumado aperitivo cookie recheado
  recheada wafer cebola bolo mini light zero diet integral desnatado desnatada sachet liquido liquida barra gel bucal
  dental chocolate leite morango uva laranja limao tomate pimenta galinha carne frango suino bovino peixe camarao`.split(/\s+/),
);
function singular(w: string): string {
  if (w.length > 4 && w.endsWith("eis")) return w.slice(0, -3) + "el"; // flexiveis
  if (w.length > 4 && w.endsWith("oes")) return w.slice(0, -3) + "ao"; // limoes
  if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
  return w;
}
function umaLetra(a: string, b: string): boolean {
  if (a === b || Math.abs(a.length - b.length) > 1 || Math.min(a.length, b.length) < 5) return false;
  let i = 0, j = 0, dif = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++dif > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else {
      i++;
      j++;
    }
  }
  return dif + (a.length - i) + (b.length - j) <= 1;
}

export function mesmoNoEstoque(x: string, y: string): boolean {
  const px = palavras(x).map(singular);
  const py = palavras(y).map(singular);
  if (!px.length || !py.length) return false;
  const jx = px.join(" "), jy = py.join(" ");
  if (jx === jy) return true;
  if (umaLetra(jx, jy)) return true;
  const [a, b] = px.length <= py.length ? [px, py] : [py, px];
  const bs = new Set(b);
  if (!a.every((w) => bs.has(w))) return false;
  if (a.length >= 2) return true;
  // uma palavra so: o maior comeca por ela, e curto (ate 3 palavras), e a segunda nao faz outro produto
  return b[0] === a[0] && b.length <= 3 && !b.slice(1).some((w) => OUTRO_PRODUTO.has(w));
}

export function repetidos<T extends { id: string; name: string }>(itens: T[]): T[][] {
  const pai = itens.map((_, i) => i);
  const raiz = (i: number): number => (pai[i] === i ? i : (pai[i] = raiz(pai[i])));
  for (let i = 0; i < itens.length; i++)
    for (let j = i + 1; j < itens.length; j++) if (mesmoNoEstoque(itens[i].name, itens[j].name)) pai[raiz(i)] = raiz(j);
  const grupos = new Map<number, T[]>();
  itens.forEach((it, i) => grupos.set(raiz(i), [...(grupos.get(raiz(i)) ?? []), it]));
  // grupo grande demais e corrente de parecidos, nao um produto so: fica de fora
  return [...grupos.values()].filter((g) => g.length > 1 && g.length <= 4);
}
