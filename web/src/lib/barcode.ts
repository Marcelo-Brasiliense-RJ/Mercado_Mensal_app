// Codigo de barras de produto (EAN-13, EAN-8, UPC-A, ITF-14). O leitor da camera
// erra em foco ruim e o teclado do celular deixa passar espaco e hifen, entao tudo
// que entra passa por aqui antes de virar consulta ao banco.

// So os digitos. E assim que o codigo e guardado (mercado_barcode_norm faz o mesmo
// no banco), pra o mesmo produto nao entrar duas vezes por causa de formatacao.
export function onlyDigits(code: string): string {
  return (code ?? "").replace(/\D/g, "");
}

// Digito verificador GS1 (mod 10): da direita para a esquerda, pesos 3 e 1
// alternados. Vale para EAN-13, EAN-8, UPC-A e ITF-14.
export function checkDigitOk(code: string): boolean {
  const d = onlyDigits(code);
  if (d.length < 8) return false;
  const digitos = d.split("").map(Number);
  const verificador = digitos.pop()!;
  let soma = 0;
  digitos.reverse().forEach((n, i) => {
    soma += n * (i % 2 === 0 ? 3 : 1);
  });
  return (10 - (soma % 10)) % 10 === verificador;
}

// Leitura de camera so e aceita se tiver tamanho de codigo de produto E o digito
// verificador fechar. Sem isso, um scan parcial vira um produto novo no catalogo da
// casa e a pessoa so descobre no caixa.
// ponytail: UPC-E (8 digitos comprimidos) tem regra propria de verificacao e nao
// passa aqui; se aparecer na pratica, o caminho e expandir para 12 digitos antes.
export function isValidBarcode(code: string): boolean {
  const d = onlyDigits(code);
  return [8, 12, 13, 14].includes(d.length) && checkDigitOk(d);
}

// Digitado a mao a regra afrouxa: codigo de balanca de mercado e etiqueta interna
// nao seguem o GS1, e quem digitou viu o numero com o proprio olho.
export function isTypedBarcode(code: string): boolean {
  const d = onlyDigits(code);
  return d.length >= 6 && d.length <= 14;
}

// So para exibir: 7891234567890 -> 789 1234 567890. Facilita conferir com a etiqueta.
export function prettyBarcode(code: string): string {
  const d = onlyDigits(code);
  if (d.length !== 13) return d;
  return `${d.slice(0, 3)} ${d.slice(3, 7)} ${d.slice(7)}`;
}
