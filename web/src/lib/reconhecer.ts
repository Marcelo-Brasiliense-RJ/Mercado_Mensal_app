"use client";

// Foto do produto -> nome (e codigo de barras, se aparecer). A foto e reduzida no
// celular antes de subir (1024 px, JPEG): sobe rapido no 4G e cabe na cota da IA.
export type Reconhecido = { nome: string; marca: string; tamanho: string; codigo: string };

async function reduzir(arquivo: File): Promise<string> {
  const img = await createImageBitmap(arquivo);
  const k = Math.min(1, 1024 / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * k);
  c.height = Math.round(img.height * k);
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.8);
}

export async function reconhecerFoto(arquivo: File): Promise<Reconhecido | null> {
  try {
    const image = await reduzir(arquivo);
    const r = await fetch("/api/reconhecer", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ image }),
    });
    const d = (await r.json()) as Partial<Reconhecido> & { ok?: boolean; encontrado?: boolean };
    if (!d.ok || (!d.encontrado && !d.codigo)) return null;
    return { nome: d.nome ?? "", marca: d.marca ?? "", tamanho: d.tamanho ?? "", codigo: d.codigo ?? "" };
  } catch {
    return null;
  }
}
