// Revisao dos NOMES que vem da nota, sem IA, antes de salvar (dono, 2026-11-12, prints:
// "Ling", "Sab Liq", "Temper", "Iog", "Norango", "Cre Den Oral B", "Cha"). A leitura as
// vezes devolve a abreviacao do cupom em vez do nome do produto. Aqui:
// 1. abreviacoes de cupom viram palavra inteira ("sab liq" -> sabonete liquido);
// 2. palavra cortada vira a palavra que ela comeca ("temper" -> tempero), se so houver uma;
// 3. erro de uma letra numa palavra conhecida ("norango" -> morango);
// 4. acento ("cha" -> cha com acento, "oleo" -> oleo com acento);
// 5. tamanho, peso, codigo e marca saem; e se a casa ja tem o produto com esse nome
//    (sem acento), fica o nome da casa (um historico so por produto).

const sem = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

// Palavras de mercado, escritas certo. Base para acento, palavra cortada e erro de letra.
const VOCAB = `abacate abacaxi abobora absorvente acai achocolatado acucar adocante agua alcatra alface alho almondega amaciante
amendoim amido arroz atum aveia azeite azeitona bacon banana barra batata bebida beterraba biscoito bisnaguinha bolacha bolo
brocolis cafe caldo camarao camomila canela carne catchup cebola cenoura cereal cerveja cha chocolate churros coco cogumelo
condensado congelado costela costelinha coxa coxinha creme cream detergente desinfetante desnatado doce empanado ervilha
escova esponja espaguete espiral extrato farinha farofa feijao fermentado file flexiveis frango fruta fubá gelatina geleia goiabada
grego guarana hamburguer hastes higienico integral iogurte ketchup lamen laranja lasanha leite lentilha limao limpador linguica
liquido lombo maca macarrao maionese mamao manteiga margarina mel melancia melao milho molho morango mostarda mucarela
mussarela nescau oleo ovos palito pano panetone panko pao papel parmesao passata pastel peito pepino pessego petisco picanha
pimenta pimentao pipoca pizza presunto pudim queijo refrigerante repelente requeijao sabao sabonete sacola saco sal salame
salgadinho salmao salsicha sanitaria sardinha shoyu suco tempero tirinha tomate torrada toalha trigo umedecida uva vinagre vinho
xarope dental dentes sanitario lava loucas roupa roupas sabonete po suino suina bovino frutas ver manchas tira pedra agua
calda instantaneo haste flexivel caldo calda multiuso protetor solar conserva frios embutido talharim lamen gel`
  .split(/\s+/)
  .filter(Boolean);

// a mesma palavra com acento (chave sem acento)
const ACENTO: Record<string, string> = {
  acai: "açaí", acucar: "açúcar", adocante: "adoçante", agua: "água", abobora: "abóbora", brocolis: "brócolis", cafe: "café",
  camarao: "camarão", cha: "chá", feijao: "feijão", file: "filé", flexiveis: "flexíveis", guarana: "guaraná", higienico: "higiênico",
  limao: "limão", linguica: "linguiça", liquido: "líquido", maca: "maçã", macarrao: "macarrão", mamao: "mamão", melao: "melão",
  mucarela: "muçarela", oleo: "óleo", pao: "pão", parmesao: "parmesão", pessego: "pêssego", pimentao: "pimentão", requeijao: "requeijão",
  sabao: "sabão", salmao: "salmão", sanitaria: "sanitária", sanitario: "sanitário", suino: "suíno", po: "pó", louca: "louça", loucas: "louças",
  hamburguer: "hambúrguer", almondega: "almôndega", fuba: "fubá", instantaneo: "instantâneo", suina: "suína", flexivel: "flexível",
};

// abreviacoes de cupom (chave sem acento). "" = some (embalagem, sigla sem sentido).
const DUPLAS: Record<string, string> = {
  "cre den": "creme dental", "cr den": "creme dental", "cr dental": "creme dental", "esc den": "escova de dentes",
  "pap hig": "papel higiênico", "sab liq": "sabonete líquido", "sab po": "sabão em pó", "sab barra": "sabão em barra",
  "tira manch": "tira manchas", "agua sanit": "água sanitária", "ped sanit": "pedra sanitária", "leite cond": "leite condensado",
  "leite ferm": "leite fermentado", "mac inst": "macarrão instantâneo", "que muc": "queijo muçarela", "que parm": "queijo parmesão",
  "cr leite": "creme de leite", "file peito": "filé de peito", "ling sui": "linguiça suína", "barra cer": "barra de cereal",
  "toalha umed": "toalha umedecida", "toalha papel": "toalha de papel", "hast flex": "hastes flexíveis", "mol tom": "molho de tomate",
  "lava rou": "lava roupas", "lava lou": "lava louças", "ped sanitario": "pedra sanitária",
};
const ABREV: Record<string, string> = {
  ling: "linguiça", lingu: "linguiça", sab: "sabonete", liq: "líquido", temp: "tempero", temper: "tempero", iog: "iogurte",
  desinf: "desinfetante", desinfe: "desinfetante", deterg: "detergente", det: "detergente", amac: "amaciante", achoc: "achocolatado",
  achocol: "achocolatado", refrig: "refrigerante", refrige: "refrigerante", refri: "refrigerante", cerv: "cerveja", bisc: "biscoito",
  choc: "chocolate", cond: "condensado", marg: "margarina", maion: "maionese", req: "requeijão", que: "queijo", queij: "queijo",
  muc: "muçarela", fgo: "frango", sui: "suíno", cong: "congelado", desn: "desnatado", integ: "integral", mor: "morango",
  manch: "manchas", hast: "hastes", flex: "flexíveis", umed: "umedecida", abs: "absorvente", sanit: "sanitária", limpad: "limpador",
  limpado: "limpador", salg: "salgadinho", cog: "cogumelo", panet: "panetone", torr: "torrada", bisn: "bisnaguinha", ferm: "fermentado",
  mol: "molho", tom: "tomate", esc: "escova", pap: "papel", hig: "higiênico", ol: "óleo", az: "azeite", cr: "creme", den: "dental",
  // embalagem, sigla e tamanho por extenso: some
  parc: "", gar: "", bc: "", br: "", bd: "", pet: "", bdj: "", pct: "", sc: "", tp: "", lf: "", trad: "", ext: "", sel: "", gold: "", def: "", pres: "",
  und: "", un: "", cx: "", fr: "", pt: "", com: "", c: "", s: "", g: "", gc: "", bco: "", bcos: "", filmad: "",
};
// marcas comuns: saem do nome (a marca tem campo proprio)
// (so nomes que nao sao palavra de produto: "guarana", "lar", "chips" ficam de fora daqui)
const MARCAS = new Set(
  `nestle ype yoki seara sadia perdigao italac coamo oral colgate omo comfort downy kicaldo camil piraque bauducco
  vigor danone batavo itambe parmalat elma ruffles coca cola antarctica pepsi heineken spaten brahma skol amstel
  lysoform bombril scotch brite huggies pampers johnson nivea dove rexona palmolive francis phebo
  hemmer pramesa melbras kitano maggi knorr renata adria barilla predilecta fugini hellmanns heinz liza soya
  garoto lacta toddy plusvita wickbold pullman visconti guanabara pomaro ritter dreamies kenko orie
  cepera tutto sapore lipton leao casbri iliada guaracamp adocyl oetker tixan cottonbaby easychef
  chamyto rezende beluga landim saboreah danubio cruzilia claybom galbani levissimo rivelli inspira
  brilux intimus toalex limppano neutrogen paixao dunes carmen yokitos mabel skiny bunge`.split(/\s+/),
);

const UNIDADES = new Set(["kg", "ml", "lt", "gr", "un", "und", "unid", "cx", "pct", "bdj", "pt", "fr", "sc", "gc", "mg"]);

function distancia1(a: string, b: string): boolean {
  if (a === b || Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, dif = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++dif > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else {
      i++;
      j++;
    }
  }
  return dif + (a.length - i) + (b.length - j) <= 1;
}

const VOCAB_SEM = Array.from(new Set(VOCAB.map(sem)));
const comAcento = (w: string) => ACENTO[w] ?? w;

function palavra(w: string): string {
  if (w in ABREV) return ABREV[w];
  if (VOCAB_SEM.includes(w)) return comAcento(w);
  // plural de palavra conhecida fica plural ("petiscos")
  if (w.endsWith("s") && VOCAB_SEM.includes(w.slice(0, -1))) return comAcento(w.slice(0, -1)) + "s";
  // cortada: a unica palavra conhecida que comeca assim ("temper" -> tempero)
  if (w.length >= 3) {
    const comeca = VOCAB_SEM.filter((v) => v.startsWith(w));
    if (comeca.length === 1) return comAcento(comeca[0]);
  }
  // uma letra errada ("norango" -> morango); so palavra comprida (curta erra demais: calda/caldo)
  if (w.length >= 6) {
    const perto = VOCAB_SEM.filter((v) => distancia1(w, v));
    if (perto.length === 1) return comAcento(perto[0]);
  }
  return w;
}

export function limparNome(nome: string, daCasa: string[] = []): string {
  const original = nome.trim();
  let t = sem(original)
    .replace(/[^a-z0-9\s/%.,-]/g, " ")
    .split(/\s+/)
    // fora: tamanho, peso, codigo, porcentagem ("500ml", "1,01kg", "c/30", "80/120", "l4p3")
    .filter((w) => w && !/\d/.test(w) && !/^[.,/%-]+$/.test(w))
    .map((w) => w.replace(/[.,/%-]+$/g, "").replace(/^[.,/%-]+/g, ""))
    // letra solta ("oral b", "po r") e unidade de medida
    .filter((w) => w.length > 1 && !UNIDADES.has(w));
  // marcas (de uma ou duas palavras: "oral b", "coca cola")
  const semMarca = t.filter((w, i) => !MARCAS.has(w) && !(i > 0 && MARCAS.has(`${t[i - 1]} ${w}`)) && !MARCAS.has(`${w} ${t[i + 1] ?? ""}`));
  if (semMarca.length) t = semMarca;
  // pares de abreviacao primeiro ("sab liq"), depois palavra por palavra
  const out: string[] = [];
  for (let i = 0; i < t.length; i++) {
    const dupla = DUPLAS[`${t[i]} ${t[i + 1] ?? ""}`];
    if (dupla) {
      out.push(dupla);
      i++;
      continue;
    }
    const p = palavra(t[i]);
    if (p) out.push(p);
  }
  const limpo = out.join(" ").split(/\s+/).filter(Boolean).slice(0, 4).join(" ");
  if (!limpo) return original.toLowerCase();
  // a casa ja tem esse produto (sem acento igual): fica o nome dela
  const igual = daCasa.find((n) => sem(n) === sem(limpo));
  return igual ?? limpo;
}
