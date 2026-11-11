// Nota que chega pelo Atalho do iPhone ("Enviar para Despensa"): a pessoa abre a nota no
// Safari (passa no antirrobo da SEFAZ, porque e ela mesma) e o atalho manda a pagina para
// o app. A nota fica guardada pela CHAVE de acesso ate o app buscar (o app ja sabe a chave
// porque leu o QR).
// ponytail: guarda em receipt_drafts (0005), tabela de rascunho de nota do bot, com um
// chat_id NEGATIVO fora da faixa do Telegram (> 8e15) e status 'atalho'. Evita migration.
// O upgrade e uma tabela propria (nota_recebida) se isso crescer.
import { createHash } from "node:crypto";

export function chatIdDaChave(chave: string): number {
  const h = createHash("sha256").update(`nota:${chave}`).digest();
  // 0 .. 1e15, deslocado para -8e15..-9e15 (Telegram usa ate ~-1e13)
  const n = Number(h.readBigUInt64BE(0) % BigInt("1000000000000000"));
  return -(8_000_000_000_000_000 + n);
}

export function chaveValida(chave: string): boolean {
  return /^\d{44}$/.test(chave);
}
