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
// undefined = falha de rede/cota (tentar de novo depois); null = a IA nao reconheceu.
export async function reconhecerImagem(image: string, nao?: string): Promise<Reconhecido | null | undefined> {
  try {
    const r = await fetch("/api/reconhecer", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ image, nao }),
    });
    const d = (await r.json()) as Partial<Reconhecido> & { ok?: boolean; encontrado?: boolean };
    if (!d.ok) return undefined;
    if (!d.encontrado && !d.codigo) return null;
    return { nome: d.nome ?? "", marca: d.marca ?? "", tamanho: d.tamanho ?? "", codigo: d.codigo ?? "" };
  } catch {
    return undefined;
  }
}
