// Intermediario da NFC-e: roda num computador com internet de casa (IP brasileiro
// comum, que a SEFAZ-RJ nao bloqueia) e busca a pagina da nota para o app.
// Sem dependencias: so Node 18+.
//
//   NFCE_RELAY_SECRET=um-segredo-longo node relay/nfce-relay.mjs
//
// Recebe POST {"url": "..."} com o cabecalho x-relay-secret e devolve {"html": "..."}.
// So busca endereco de NFC-e do governo (*.fazenda.XX.gov.br): nao e proxy aberto.
import http from "node:http";

const PORTA = Number(process.env.PORT || 8787);
const SEGREDO = process.env.NFCE_RELAY_SECRET || "";
if (SEGREDO.length < 16) {
  console.error("Defina NFCE_RELAY_SECRET com pelo menos 16 caracteres.");
  process.exit(1);
}
const permitido = (u) => /^https?:\/\/([a-z0-9-]+\.)*fazenda\.[a-z]{2}\.gov\.br\//i.test(u);

http
  .createServer(async (req, res) => {
    const responder = (status, obj) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(obj));
    };
    if (req.method !== "POST") return responder(405, { erro: "metodo" });
    if (req.headers["x-relay-secret"] !== SEGREDO) return responder(401, { erro: "segredo" });
    let corpo = "";
    for await (const parte of req) {
      corpo += parte;
      if (corpo.length > 10_000) return responder(413, { erro: "grande" });
    }
    let url = "";
    try {
      url = String(JSON.parse(corpo).url || "");
    } catch {
      return responder(400, { erro: "json" });
    }
    if (!permitido(url)) return responder(400, { erro: "url_nao_permitida" });
    try {
      const r = await fetch(url, {
        headers: { "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)" },
        signal: AbortSignal.timeout(12000),
      });
      const html = await r.text();
      console.log(new Date().toISOString(), r.status, url.slice(0, 80));
      responder(200, { html });
    } catch (e) {
      responder(502, { erro: "sefaz_indisponivel", detalhe: String(e) });
    }
  })
  .listen(PORTA, () => console.log(`Intermediario da NFC-e ouvindo na porta ${PORTA}`));
