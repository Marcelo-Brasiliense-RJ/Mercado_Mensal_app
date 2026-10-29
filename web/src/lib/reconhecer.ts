"use client";

// Foto do produto -> nome (e codigo de barras, se aparecer). A foto e reduzida no
// celular antes de subir (1024 px, JPEG): sobe rapido no 4G e cabe na cota da IA.
export type Reconhecido = { nome: string; marca: string; tamanho: string; codigo: string };

export async function reduzir(arquivo: File, lado = 1024): Promise<string> {
  const img = await createImageBitmap(arquivo);
  const k = Math.min(1, lado / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * k);
  c.height = Math.round(img.height * k);
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.75);
}

// `nao`: nome que a pessoa disse que esta errado ("pedir pra rever").
// undefined = falha de rede/cota (tentar de novo depois); null = a IA nao reconheceu;
// "sem_ia" = o servidor nao tem chave da IA configurada (nao adianta repetir).
// { limite } = todas as chaves no limite agora: esperar esses segundos e tentar de novo.
export type Limite = { limite: number };
export async function reconhecerImagem(
  image: string,
  nao?: string,
  forte = false,
): Promise<Reconhecido | null | undefined | "sem_ia" | Limite> {
  try {
    const r = await fetch("/api/reconhecer", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ image, nao, forte }),
    });
    const d = (await r.json()) as Partial<Reconhecido> & { ok?: boolean; encontrado?: boolean; erro?: string; espera?: number };
    if (d.erro === "ia_indisponivel") return "sem_ia";
    if (d.erro === "limite") return { limite: Math.max(5, d.espera ?? 30) };
    if (!d.ok) return undefined;
    if (!d.encontrado && !d.codigo) return null;
    return { nome: d.nome ?? "", marca: d.marca ?? "", tamanho: d.tamanho ?? "", codigo: d.codigo ?? "" };
  } catch {
    return undefined;
  }
}
