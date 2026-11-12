// O que veio na nota risca da LISTA o item certo, mesmo com nome diferente: a nota diz
// "arroz", a lista tem "arroz tio joao"; a nota diz "biscoito wafer", a lista "wafer".
// (O banco ja risca o de nome identico; aqui pega os parecidos, pela mesma regra da foto
// da prateleira: as palavras do nome mais curto estao todas no mais longo.)
import { mesmoProduto } from "./prateleira";

export function daListaNaNota<T extends { id: string; name: string; status: string }>(
  lista: T[],
  nota: { nome: string }[],
): T[] {
  const nomes = nota.map((n) => n.nome).filter((n) => n.trim());
  return lista.filter((l) => l.status === "pending" && nomes.some((n) => mesmoProduto(l.name, n)));
}
