// Linha de reconhecimento de uma foto: cada etapa so roda se a anterior nao resolveu.
//
//   1. Codigo de barras lido na propria foto (no celular, sem gastar IA) -> base publica.
//   2. IA rapida. Se ela leu um codigo, o nome vem da base (o da IA varia de foto a foto).
//   3. IA forte, so se a rapida nao soube o que era.
//   4. Nada resolveu: devolve o motivo e o codigo que deu para ler, se houver.
//
// Pura (as etapas entram por parametro) para o teste cobrir a ordem sem rede.
import type { Limite, Reconhecido } from "./reconhecer";

export type Base = { nome: string; marca?: string; unidade?: string | null; foto?: string | null };
export type RespostaIA = Reconhecido | null | undefined | "sem_ia" | Limite;
const ehLimite = (r: RespostaIA): r is Limite => !!r && typeof r === "object" && "limite" in r;

export type Etapas = {
  codigoLocal: () => Promise<string>;
  produto: (codigo: string) => Promise<Base | null>;
  ia: (forte: boolean) => Promise<RespostaIA>;
};

export type Resultado =
  | { ok: true; nome: string; marca: string; codigo: string; unidade?: string; foto: string | null; fonte: "codigo" | "ia" }
  | { ok: false; motivo: "sem_ia" | "ia_falhou" | "nao_reconheceu"; codigo: string }
  // chaves no limite: a fila espera `espera` segundos e tenta de novo (a foto nao falhou)
  | { ok: false; motivo: "limite"; espera: number; codigo: string };

export async function reconhecerEmEtapas(e: Etapas): Promise<Resultado> {
  const daBase = (b: Base, codigo: string, fonte: "codigo" | "ia", marcaIA = ""): Resultado => ({
    ok: true,
    nome: b.nome,
    marca: b.marca || marcaIA,
    codigo,
    unidade: b.unidade ?? undefined,
    foto: b.foto ?? null,
    fonte,
  });

  // 1. codigo na foto
  const local = await e.codigoLocal().catch(() => "");
  if (local) {
    const b = await e.produto(local).catch(() => null);
    if (b?.nome) return daBase(b, local, "codigo");
  }

  // 2 e 3. IA rapida, depois a forte se a rapida nao reconheceu
  let ultima: RespostaIA = null;
  for (const forte of [false, true]) {
    const r = await e.ia(forte).catch(() => undefined);
    ultima = r;
    if (ehLimite(r)) return { ok: false, motivo: "limite", espera: r.limite, codigo: local };
    if (r === "sem_ia" || r === undefined) break; // sem chave ou sem resposta: a forte tambem nao vai
    if (!r) continue;
    const codigo = local || r.codigo;
    if (r.codigo && r.codigo !== local) {
      const b = await e.produto(r.codigo).catch(() => null);
      if (b?.nome) return daBase(b, r.codigo, "ia", r.marca);
    }
    if (r.nome) return { ok: true, nome: r.nome, marca: r.marca, codigo, foto: null, fonte: "ia" };
  }

  return {
    ok: false,
    motivo: ultima === "sem_ia" ? "sem_ia" : ultima === undefined ? "ia_falhou" : "nao_reconheceu",
    codigo: local,
  };
}
