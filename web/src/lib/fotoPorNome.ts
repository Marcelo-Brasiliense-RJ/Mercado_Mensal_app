// Qual produto do catalogo e a foto do item da casa, pelo nome.
//
// Por que existe: a busca da loja devolve "parecidos", e pegar o primeiro mostrava
// foto errada ("acai com guarana acaicamp 1l" virava um pote de outro acai). Aqui cada
// resultado ganha nota pelas palavras do item que ele tem; sem nota boa, nao ha foto
// (o app mostra o icone da categoria, que nao engana ninguem).
const sem = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]/g, " ");

// Palavras que nao identificam o produto.
const VAZIAS = new Set([
  "a", "o", "e", "de", "da", "do", "das", "dos", "com", "sem", "em", "para", "pra", "base", "tipo", "sabor",
  "tradicional", "original", "unidade", "un", "pacote", "pct", "cx", "caixa", "lata", "garrafa", "pet", "kit",
]);
const TAMANHO = /^\d+([.,]\d+)?(g|kg|ml|l|lt|un|m|cm)?$/;

export function palavras(nome: string): string[] {
  return sem(nome)
    .split(/\s+/)
    .filter((p) => p.length > 1 && !VAZIAS.has(p) && !TAMANHO.test(p));
}

// 0..1: fracao das palavras do item que o produto tem. O produto tem que COMECAR pelo
// que o item e ("acai", "detergente"): "alho" nao vira "Tempero Alho", "cloro" nao vira
// "Agua Sanitaria com Cloro".
export function nota(item: string, produto: string): number {
  const ps = palavras(item);
  const pp = palavras(produto);
  if (!ps.length || !pp.length) return 0;
  // Marca escrita junta ou separada vale igual: a casa digita "plus vita" e a loja escreve
  // "Plusvita" (e o contrario). Sem isso "pao bisnaguito plus vita" nao casava com o
  // proprio produto. Por isso o produto tambem conta com as palavras vizinhas coladas.
  const tem = new Set([...pp, ...pp.slice(1).map((w, i) => pp[i] + w)]);
  // plural vale ("biscoito" casa "biscoitos"), marca colada nao ("acaicamp" nao e "acai")
  const perto = (a: string, b: string) => a.startsWith(b) && b.length >= 3 && a.length - b.length <= 2;
  const igual = (p: string, t: string) => t === p || perto(t, p) || perto(p, t);
  const casa = (p: string) => [...tem].some((t) => igual(p, t));
  if (!igual(ps[0], pp[0])) return 0;
  const ok = ps.map(casa);
  ps.forEach((w, i) => {
    if (i + 1 < ps.length && casa(w + ps[i + 1])) ok[i] = ok[i + 1] = true;
  });
  return ok.filter(Boolean).length / ps.length;
}

// Todas as palavras do item no produto (uma de folga a partir de 6 palavras). Nome curto
// ("arroz") ja e generico; nome com marca ("oleo de soja coamo", "acai ... acaicamp")
// com foto de outra marca engana: melhor o icone.
export function notaMinima(item: string): number {
  const n = palavras(item).length;
  return n >= 6 ? (n - 1) / n : 1;
}

export function melhor<T extends { nome: string }>(item: string, candidatos: T[]): T | null {
  let m: T | null = null;
  let n = 0;
  for (const c of candidatos) {
    const x = nota(item, c.nome);
    if (x > n) [m, n] = [c, x];
  }
  return n >= notaMinima(item) - 1e-9 ? m : null;
}

// Buscas em ordem: o nome inteiro, depois so as palavras que identificam (a loja acha
// mais com menos), depois as 3 primeiras.
export function buscas(nome: string): string[] {
  const ps = palavras(nome);
  return [...new Set([nome.trim(), ps.join(" "), ps.slice(0, 3).join(" ")].filter((q) => q.length >= 2))];
}

// Endereco da foto de um item. A versao muda quando a regra de escolha muda: o celular e
// a borda guardam a foto por dias, e sem trocar o endereco a foto errada antiga continuava
// aparecendo (v2: so produto com todas as palavras do item; v3: entrou
// a loja Prezunic, entao o "sem foto" guardado precisa ser buscado de novo; v4: segunda
// chance aceitando uma palavra a menos; v5: a segunda chance saiu, porque a palavra que
// faltava podia ser a que diz o produto ("pao bisnaguito plus vita" virou pao de forma
// Plus Vita), e marca junta/separada passou a casar).
export const VERSAO_FOTO = 5;
export const urlFoto = (nome: string) =>
  `/api/foto?v=${VERSAO_FOTO}&nome=${encodeURIComponent(nome.trim().toLowerCase())}`;
