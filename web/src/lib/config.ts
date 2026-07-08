// Constantes do produto (nao sao dado de familia, por isso nao vem do banco).

export const BOT_HANDLE = "@Mercado_cellks_bot";
export const BOT_URL = `https://t.me/${BOT_HANDLE.replace("@", "")}`;

// Deep link que abre o bot com o codigo pronto para enviar. O Telegram mostra o
// botao "Iniciar" e manda "/start <codigo>"; o bot trata isso como entrar_familia.
export function botDeepLink(code: string): string {
  return `${BOT_URL}?start=${encodeURIComponent(code)}`;
}
