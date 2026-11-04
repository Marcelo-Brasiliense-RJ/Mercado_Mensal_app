// Nome de produto bem escrito na tela: "oleo de soja coamo" -> "Óleo de Soja Coamo".
// A IA e quem digita costumam escrever sem acento e tudo minusculo; aqui volta o
// acento das palavras comuns de mercado e cada palavra ganha maiuscula (menos as
// pequenas: de, da, com...). acentuar() so poe acento, sem mexer na caixa (para gravar).

const ACENTO: Record<string, string> = {
  oleo: "óleo", acucar: "açúcar", cafe: "café", feijao: "feijão", macarrao: "macarrão", pao: "pão",
  agua: "água", grao: "grão", graos: "grãos", sabao: "sabão", limao: "limão", acai: "açaí", pure: "purê",
  file: "filé", pe: "pé", po: "pó", mamao: "mamão", maca: "maçã", melao: "melão", algodao: "algodão",
  fuba: "fubá", 
  sazon: "sazón", oregano: "orégano", acucarado: "açucarado", lampada: "lâmpada",
  higienico: "higiênico", 
  cha: "chá", 
  agucar: "açúcar", 
  requeijao: "requeijão", 
  linguica: "linguiça", camarao: "camarão",
  sanitaria: "sanitária", 
  liquido: "líquido", 
  lacteo: "lácteo", italia: "itália", instantaneo: "instantâneo",
  instantanea: "instantânea", pessego: "pêssego", maracuja: "maracujá", abobora: "abóbora", brocolis: "brócolis",
  pimentao: "pimentão", 
  
  
  alcoolica: "alcoólica",
  amendoa: "amêndoa",
  avela: "avelã", 
};
const PEQUENAS = new Set(["de", "da", "do", "das", "dos", "e", "com", "sem", "em", "para", "ao", "a", "o"]);

export function acentuar(s: string): string {
  return s.replace(/\p{L}+/gu, (w) => {
    const a = ACENTO[w.toLowerCase()];
    if (!a || w.normalize("NFD") !== w.normalize("NFD").replace(/[̀-ͯ]/g, "")) return w; // ja tem acento
    return w === w.toLowerCase() ? a : a.charAt(0).toUpperCase() + a.slice(1);
  });
}

export function nomeBonito(s: string): string {
  const t = acentuar(s.trim().replace(/\s+/g, " "));
  let i = 0;
  return t.replace(/\p{L}[\p{L}'’]*/gu, (w) => {
    const primeira = i++ === 0;
    const m = w.toLowerCase();
    if (!primeira && PEQUENAS.has(m)) return m;
    if (w !== m && w !== w.charAt(0) + w.slice(1).toLowerCase()) return w; // sigla/marca escrita do jeito dela (UHT, KitKat)
    return m.charAt(0).toUpperCase() + m.slice(1);
  });
}
