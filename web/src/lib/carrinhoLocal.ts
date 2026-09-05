// Carrinho que vive no proprio celular, sem conta e sem servidor.
//
// Por que existe: o dono ficou preso na tela de login DENTRO do mercado, com a
// compra na mao. Enquanto o login nao resolve, nada mais importa. Este modo nao
// fala com o Supabase, nao precisa de sessao e guarda tudo em localStorage, entao
// funciona ate com a internet ruim do corredor do mercado.
// ponytail: a fusao com a conta (mandar esta compra para a familia quando o login
// voltar) ainda nao existe; o botao de enviar entra quando a sessao estiver de pe.

export type ItemLocal = {
  id: string;
  nome: string;
  qtd: number;
  unidade: string;
  preco: number; // por unidade
};

const CHAVE = "mercado_carrinho_local_v1";

export function totalDo(itens: ItemLocal[]): number {
  return itens.reduce((a, i) => a + i.qtd * i.preco, 0);
}

// Leitura e escrita sempre em try/catch: navegador em aba privada joga excecao
// ao tocar em localStorage, e perder o carrinho por isso seria pior do que nao
// guardar nada.
export function lerCarrinho(): ItemLocal[] {
  try {
    const cru = localStorage.getItem(CHAVE);
    if (!cru) return [];
    const dados = JSON.parse(cru);
    if (!Array.isArray(dados)) return [];
    return dados.filter(
      (i) => i && typeof i.nome === "string" && typeof i.qtd === "number",
    );
  } catch {
    return [];
  }
}

export function salvarCarrinho(itens: ItemLocal[]): void {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(itens));
  } catch {
    // Sem espaco ou aba privada: o carrinho segue valendo nesta sessao.
  }
}

export function novoId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}
