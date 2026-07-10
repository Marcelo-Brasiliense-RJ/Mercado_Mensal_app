// Constantes do produto (nao sao dado de familia, por isso nao vem do banco).

export const BOT_HANDLE = "@Mercado_cellks_bot";
export const BOT_URL = `https://t.me/${BOT_HANDLE.replace("@", "")}`;

// Deep link que abre o bot com o codigo pronto para enviar. O Telegram mostra o
// botao "Iniciar" e manda "/start <codigo>"; o bot trata isso como entrar_familia.
export function botDeepLink(code: string): string {
  return `${BOT_URL}?start=${encodeURIComponent(code)}`;
}

// Import por QR da NFC-e: desativado por ora (fica para uma versao futura).
// O codigo do fluxo QR continua no repo; para reativar por familia, some o nome
// (normalizado, sem caixa/acento) nesta lista. Ex.: ["brasiliense"].
const QR_FAMILIAS: string[] = [];

function normFamilia(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

export function familyCanUseQr(familia: string | null | undefined): boolean {
  if (!familia) return false;
  const n = normFamilia(familia);
  return QR_FAMILIAS.some((f) => n.includes(f));
}
