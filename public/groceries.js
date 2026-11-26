// Delt mellom server (require) og nettleser (<script>): varekatalog + normalisering av stavemåter.
// Format: "Navn|alias|alias" – aliasene er andre måter å skrive samme vare på.
(function (root) {
  const RAW = {
    'Frukt og grønt': [
      'Bananer|banan', 'Epler|eple', 'Pærer|pære', 'Appelsiner|appelsin', 'Klementiner|klementin|mandariner|mandarin',
      'Sitron|sitroner', 'Lime', 'Druer|drue|vindruer', 'Jordbær', 'Blåbær', 'Bringebær', 'Melon|honningmelon', 'Vannmelon',
      'Kiwi', 'Mango', 'Ananas', 'Avokado|avocado|avokadoer', 'Tomater|tomat', 'Cherrytomater|cherrytomat|småtomater',
      'Agurk|slangeagurk', 'Paprika', 'Salat|hjertesalat', 'Isbergsalat|issalat', 'Ruccola|rucola|ruccula',
      'Spinat|babyspinat', 'Brokkoli|broccoli', 'Blomkål', 'Hodekål|kål', 'Gulrøtter|gulrot|gulerøtter|gulerot',
      'Poteter|potet|potetes', 'Søtpotet|søtpoteter', 'Løk|gul løk|kepaløk', 'Rødløk', 'Vårløk', 'Hvitløk|kvitløk',
      'Purre|purreløk', 'Sjampinjong|champignon|sjampinjonger|sopp', 'Squash|zucchini', 'Maiskolber|maiskolbe', 'Sukkererter',
      'Ingefær', 'Chili|chilli', 'Persille', 'Koriander', 'Basilikum', 'Dill', 'Gressløk', 'Sellerirot|selleri', 'Stangselleri',
      'Rødbeter|rødbete', 'Kålrot|kålrabi', 'Pastinakk', 'Asparges', 'Aspargesbønner|grønne bønner', 'Aubergine',
    ],
    'Brød og bakervarer': [
      'Brød', 'Grovbrød|grovt brød', 'Loff', 'Rundstykker|rundstykke', 'Knekkebrød|knekkebrod', 'Lomper|lompe',
      'Lefser|lefse', 'Tortillalefser|tortilla|tortillas|wraps', 'Pitabrød|pita', 'Baguette', 'Hamburgerbrød|burgerbrød',
      'Pølsebrød', 'Kanelboller|kanelbolle', 'Boller|bolle', 'Skolebrød', 'Rugbrød', 'Flatbrød',
    ],
    'Meieri': [
      'Melk|mjølk', 'Lettmelk|lett melk|lettmjølk', 'Helmelk|hel melk|heilmjølk', 'Skummet melk|skummetmelk',
      'Ekstra lett melk|ekstralett melk|ekstra lettmelk', 'Laktosefri melk|laktosefri mjølk', 'Havremelk|havredrikk',
      'Kremfløte|krem fløte|fløte', 'Matfløte', 'Rømme|seterrømme', 'Lettrømme',
      'Crème fraîche|creme fraiche|kremfraiche|creme fresh|creme fraise', 'Yoghurt|yogurt|joghurt', 'Gresk yoghurt|gresk yogurt',
      'Skyr', 'Smør|meierismør', 'Margarin|melange|bremykt', 'Kesam', 'Cottage cheese|cottage', 'Kulturmelk|surmelk', 'Kefir',
      'Sjokolademelk|kakaomelk|litago', 'Biola',
    ],
    'Ost': [
      'Norvegia', 'Gulost|hvitost|ost', 'Jarlsberg', 'Brunost|geitost|gudbrandsdalsost', 'Revet ost|ost revet|pizzaost',
      'Mozzarella|mozarella|mozzarela', 'Parmesan|parmigiano', 'Fetaost|feta|salatost', 'Kremost|smøreost|philadelphia',
      'Brie', 'Cheddar', 'Prim|mysost',
    ],
    'Egg': ['Egg|frittgående egg'],
    'Kjøtt': [
      'Kjøttdeig|kjøtdeig|kjøttdeg', 'Karbonadedeig', 'Kyllingfilet|kyllingbryst|kylling filet', 'Kyllinglår', 'Kyllingklubber',
      'Kyllingvinger', 'Hel kylling', 'Svinekoteletter|koteletter|kotelett', 'Svinefilet|svinemørbrad', 'Bacon',
      'Pølser|pølse', 'Grillpølser|grillpølse', 'Wienerpølser|wienerpølse', 'Kjøttkaker|kjøttkake', 'Medisterkaker|medisterkake',
      'Biff', 'Entrecôte|entrecote', 'Ytrefilet', 'Lammekjøtt|lam', 'Kebabkjøtt|kebab', 'Tacokjøtt|taco kjøtt',
      'Kalkunfilet|kalkun', 'Ribbe', 'Pinnekjøtt', 'Skinke|kokt skinke',
    ],
    'Fisk': [
      'Laks|laksefilet', 'Torsk|torskefilet|torskeloins', 'Sei|seifilet', 'Fiskekaker|fiskekake', 'Fiskeboller|fiskebolle',
      'Fiskepinner|fiskepinne', 'Reker|reke', 'Makrell i tomat|makrell tomat', 'Tunfisk|tunfisk på boks', 'Kaviar|kaviartube',
      'Røkelaks|røkt laks', 'Sild', 'Krabbe|krabbeskjell',
    ],
    'Pålegg': [
      'Leverpostei|postei', 'Salami', 'Servelat', 'Hamburgerrygg', 'Kalkunpålegg', 'Kyllingpålegg', 'Syltetøy',
      'Jordbærsyltetøy', 'Bringebærsyltetøy', 'Nugatti', 'Nutella', 'Peanøttsmør|peanut butter', 'Honning',
      'Majones|majonnes|mayo|majonés', 'Rekesalat', 'Italiensk salat', 'Agurksalat',
    ],
    'Frysevarer': [
      'Frossenpizza|grandiosa|pizza', 'Is|iskrem', 'Frosne grønnsaker|grønnsaksblanding', 'Wokgrønnsaker',
      'Frosne erter|erter', 'Frosne bær|frossen bær', 'Pommes frites|pommes|frites|pomfri', 'Kyllingnuggets|nuggets', 'Vårruller',
    ],
    'Tørrvarer': [
      'Pasta', 'Spaghetti|spagetti|spagheti', 'Makaroni', 'Penne', 'Ris', 'Jasminris', 'Basmatiris', 'Nudler|nuddler',
      'Couscous|kuskus', 'Havregryn|havregrynn', 'Müsli|musli', 'Granola', 'Frokostblanding', 'Cornflakes', 'Cheerios',
      'Hvetemel|mel', 'Sukker|strøsukker', 'Melis|flormelis', 'Gjær|tørrgjær', 'Bakepulver', 'Natron', 'Kakao',
      'Kaffe|filterkaffe|kokmalt kaffe', 'Kaffebønner', 'Te|teposer', 'Linser|røde linser', 'Kikerter',
      'Tacokrydder|taco krydder', 'Tacoskjell', 'Rosiner', 'Nøtter', 'Cashewnøtter|cashew', 'Mandler', 'Valnøtter',
      'Potetmos|potetmospulver', 'Brun saus|brunsaus',
    ],
    'Hermetikk og sauser': [
      'Hermetiske tomater|knuste tomater|hakkede tomater|tomater på boks', 'Tomatpuré|tomatpure', 'Kidneybønner|bønner på boks',
      'Mais på boks|hermetisk mais|mais', 'Kokosmelk|kokosmjølk', 'Pastasaus|tomatsaus', 'Pesto', 'Salsa|tacosaus',
      'Ketchup|tomatketchup', 'Sennep', 'Soyasaus|soya', 'Olivenolje', 'Rapsolje|matolje', 'Eddik',
      'Buljong|buljongterninger', 'Oliven', 'Sylteagurk', 'Rødkål',
    ],
    'Krydder': ['Salt', 'Pepper|svart pepper|kvernpepper', 'Kanel', 'Paprikapulver', 'Karri|curry', 'Oregano', 'Timian', 'Spisskummen'],
    'Drikke': [
      'Appelsinjuice|appelsinjus|juice', 'Eplejuice|eplejus|eplemost', 'Brus', 'Cola|coca cola|coca-cola', 'Pepsi Max|pepsimax',
      'Mineralvann|kullsyrevann|farris', 'Saft|husholdningssaft', 'Øl|pils', 'Energidrikk', 'Iste|ice tea',
    ],
    'Snacks og godteri': [
      'Potetgull|chips', 'Peanøtter', 'Popcorn', 'Sjokolade|melkesjokolade', 'Smågodt|godteri|snop',
      'Kjeks', 'Tyggegummi', 'Ostepop', 'Dipmix|dip',
    ],
    'Baby': ['Bleier|bleie', 'Våtservietter|våtserviett', 'Barnemat', 'Barnegrøt', 'Morsmelkerstatning'],
    'Hygiene': [
      'Toalettpapir|dopapir|do-papir|doruller|dorull', 'Tannkrem|tannpasta', 'Tannbørster|tannbørste', 'Sjampo|shampo|shampoo',
      'Balsam', 'Håndsåpe|såpe', 'Dusjsåpe|dusjgele|dusjgel', 'Deodorant|deo', 'Bind', 'Tamponger', 'Truseinnlegg',
      'Barberblader', 'Plaster', 'Bomullspads', 'Vattpinner|q-tips',
    ],
    'Husholdning': [
      'Tørkerull|kjøkkenrull|tørkepapir', 'Oppvaskmiddel|zalo', 'Oppvaskmaskintabletter|maskintabletter',
      'Vaskemiddel|klesvask|tøyvask|vaskepulver', 'Tøymykner|skyllemiddel', 'Søppelposer|søppelsekker', 'Bæreposer|handleposer',
      'Bakepapir', 'Aluminiumsfolie|alufolie|folie', 'Plastfolie|matfolie', 'Fryseposer|frysepose', 'Zip-poser|zippose|ziplock',
      'Batterier', 'Lyspærer|lyspære', 'Stearinlys|lys', 'Telys', 'Servietter', 'Oppvaskbørste', 'Svamper|svamp',
      'Kluter|klut|vaskeklut', 'Allrengjøring|universalrengjøring', 'Grønnsåpe', 'Toalettrens|wc-rens',
    ],
    'Dyr': ['Kattemat|kattefôr', 'Hundemat|hundefôr', 'Kattesand'],
  };

  // ---------- Normalisering ----------
  // Små bokstaver, svenske/danske/utenlandske tegn til norske, fjerner tegnsetting.
  function norm(s) {
    return String(s).toLocaleLowerCase('nb')
      .replace(/[äæ]/g, 'æ').replace(/[öø]/g, 'ø')
      .replace(/[éèêë]/g, 'e').replace(/[áàâ]/g, 'a').replace(/ê/g,'e').replace(/[üú]/g, 'u').replace(/[íïî]/g, 'i').replace(/[óôò]/g, 'o').replace(/ç/g, 'c')
      .replace(/[^a-z0-9æøå ]+/g, ' ').replace(/\s+/g, ' ').trim();
  }
  // Fjerner mengdeangivelser: "2 melk", "melk x2", "2x melk", "pepsi max 1,5 l", "kjøttdeig 400 g", "egg 12 pk"
  const UNIT = '(?:x|stk|pk|pakk?e?r?|poser?|bokser?|l|liter|dl|cl|ml|kg|g|gram|flasker?)';
  const NUM = '\\d+(?:[.,]\\d+)?';
  function stripQty(s) {
    return String(s)
      .replace(new RegExp(`^\\s*(?:${NUM}\\s*${UNIT}?|x\\s*${NUM})\\s+`, 'i'), '')
      .replace(new RegExp(`\\s+(?:x\\s*)?${NUM}\\s*${UNIT}?\\s*$`, 'i'), '')
      .trim() || String(s).trim();
  }

  // ---------- Katalog ----------
  const CATALOG = [];
  const ALIAS = new Map(); // normalisert alias -> katalogoppføring
  for (const [cat, list] of Object.entries(RAW)) {
    for (const line of list) {
      const [name, ...aliases] = line.split('|');
      const entry = { name, cat, key: norm(name), terms: [...new Set([name, ...aliases].map(norm))] };
      CATALOG.push(entry);
      for (const t of entry.terms) if (!ALIAS.has(t)) ALIAS.set(t, entry);
    }
  }

  // Kanonisk nøkkel: brukes til læring av butikkrekkefølge, historikk og duplikatsjekk
  function keyOf(text) {
    const k = norm(stripQty(text));
    return ALIAS.get(k)?.key ?? k;
  }
  const lookup = (text) => ALIAS.get(norm(stripQty(text))) || null;
  const categoryOf = (key) => ALIAS.get(key)?.cat ?? null;

  // ---------- Tolerant søk (for forslag mens man skriver) ----------
  // Optimal string alignment-distanse (tillater ombyttede bokstaver: "bannaer" ~ "bananer")
  function dist(a, b, max) {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
    for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) {
      let rowMin = Infinity;
      for (let j = 1; j <= b.length; j++) {
        const c = a[i - 1] === b[j - 1] ? 0 : 1;
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c);
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
        rowMin = Math.min(rowMin, d[i][j]);
      }
      if (rowMin > max) return max + 1;
    }
    return d[a.length][b.length];
  }
  // Lavere = bedre treff. null = ingen treff.
  function matchScore(q, term) {
    if (term === q) return 0;
    if (term.startsWith(q)) return 1;
    if (term.split(' ').some((w) => w.startsWith(q))) return 2;
    if (q.length >= 3 && term.includes(q)) return 3;
    const max = q.length >= 7 ? 2 : q.length >= 4 ? 1 : 0;
    if (!max) return null;
    const dFull = dist(q, term, max);
    const dPre = dist(q, term.slice(0, q.length), max);
    const d = Math.min(dFull, dPre + 0.5);
    return d <= max ? 4 + d : null;
  }
  // entries: [{ name, cat, key, terms, n }]  →  topp-treff
  function search(query, entries, limit = 6) {
    const q = norm(stripQty(query));
    if (!q) return [];
    const hits = [];
    for (const e of entries) {
      let best = null;
      for (const t of e.terms) {
        const s = matchScore(q, t);
        if (s !== null && (best === null || s < best)) best = s;
        if (best === 0) break;
      }
      if (best !== null) hits.push({ e, s: best - Math.min(1.5, Math.log2(1 + (e.n || 0)) * 0.3) });
    }
    return hits.sort((a, b) => a.s - b.s).slice(0, limit).map((h) => h.e);
  }

  const api = { CATALOG, norm, stripQty, keyOf, lookup, categoryOf, search };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Groceries = api;
})(typeof self !== 'undefined' ? self : this);
