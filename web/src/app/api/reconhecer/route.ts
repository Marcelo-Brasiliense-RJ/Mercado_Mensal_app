import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { chavesGemini, gemini } from "@/lib/server/gemini";

// "Não consegui ler o código": a foto do produto vai para o Gemini, que devolve o nome
// como no rotulo (e o codigo de barras, se aparecer na foto). Fica no servidor para a
// chave nunca chegar ao navegador e para exigir sessao (a cota gratuita e pequena).
//
// Rapido primeiro: modelos "lite" na frente, e varias chaves (GEMINI_API_KEY, _2, _3...)
// se uma estourar a cota do dia, igual ao monitor de promocoes (lib/server/gemini.ts).
export const runtime = "nodejs";

const PERGUNTA =
  "Foto de um produto de supermercado, muitas vezes na mão, torta ou de lado. Leia o nome " +
  "escrito na FRENTE da embalagem e diga qual é. nome: como está no rótulo, em português, " +
  "com tipo, marca, variante e tamanho (ex.: 'Detergente Líquido Ypê Neutro 500ml'). " +
  "codigo: os números do código de barras se estiverem legíveis na foto, senão vazio. " +
  "Se der para ler só parte, dê o melhor palpite. Nome vazio só se não for produto de mercado. " +
  "preco: se aparecer na foto a ETIQUETA de preço da gôndola (ou adesivo de preço) deste produto, o preço " +
  "de UMA unidade em reais como número (ex.: 21.9); o preço de oferta/clube se houver os dois; " +
  "ignore o preço por kg/L da etiqueta. Sem etiqueta legível, 0.";
const ESQUEMA = {
  type: "OBJECT",
  properties: {
    nome: { type: "STRING" },
    marca: { type: "STRING" },
    tamanho: { type: "STRING" },
    codigo: { type: "STRING" },
    preco: { type: "NUMBER" },
  },
  required: ["nome", "marca", "tamanho", "codigo"],
};

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, erro: "nao_autenticado" }, { status: 401 });

  let image: unknown;
  // "Pedir pra rever": a pessoa disse que nao e o nome que veio. Vai com o modelo mais
  // forte na frente e avisando o que ja foi descartado.
  let nao = "";
  let forte = false; // a rapida nao soube: modelo mais forte na frente
  try {
    const b = await req.json();
    image = b?.image;
    if (typeof b?.nao === "string") nao = b.nao.slice(0, 120).trim();
    forte = b?.forte === true;
  } catch {
    /* corpo invalido cai no check abaixo */
  }
  const m = typeof image === "string" ? image.match(/^data:(image\/[a-z]+);base64,(.+)$/) : null;
  if (!m) return NextResponse.json({ ok: false, erro: "sem_imagem" }, { status: 400 });
  if (m[2].length > 4_000_000) return NextResponse.json({ ok: false, erro: "imagem_grande" }, { status: 413 });

  if (!chavesGemini().length) return NextResponse.json({ ok: false, erro: "ia_indisponivel" }, { status: 503 });

  const res = await gemini(
    {
      contents: [
        {
          parts: [
            { inline_data: { mime_type: m[1], data: m[2] } },
            { text: nao ? `${PERGUNTA} Atenção: NÃO é "${nao}"; olhe o rótulo de novo com cuidado.` : PERGUNTA },
          ],
        },
      ],
      generationConfig: { responseMimeType: "application/json", responseSchema: ESQUEMA, temperature: 0 },
    },
    Boolean(nao) || forte,
  );
  if (res.ok) {
    try {
      const d = JSON.parse(res.texto) as { nome?: string; marca?: string; tamanho?: string; codigo?: string; preco?: number };
      const preco = Number(d.preco);
      const codigo = (d.codigo ?? "").replace(/\D/g, "");
      return NextResponse.json({
        ok: true,
        encontrado: !!d.nome?.trim(),
        nome: (d.nome ?? "").trim(),
        marca: (d.marca ?? "").trim(),
        tamanho: (d.tamanho ?? "").trim(),
        codigo: codigo.length >= 8 ? codigo : "",
        // etiqueta da gondola: preco de uma unidade (0 = nao tinha etiqueta legivel)
        preco: Number.isFinite(preco) && preco > 0 && preco < 10000 ? Math.round(preco * 100) / 100 : 0,
      });
    } catch {
      /* resposta quebrada: cai no ia_falhou */
    }
  }
  if (!res.ok && res.erro === "limite")
    return NextResponse.json({ ok: false, erro: "limite", espera: res.espera }, { status: 429 });
  return NextResponse.json({ ok: false, erro: "ia_falhou" }, { status: 502 });
}
