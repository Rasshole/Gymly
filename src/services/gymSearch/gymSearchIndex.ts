import type {DanishGym} from '@/data/danishGyms';
import {getActiveDanishGyms} from '@/data/danishGyms';
import {formatGymDisplayName, normalizeGymBrand} from '@/utils/gymDisplay';
import {isSwedenCountry, isNorwayCountry, isAustriaCountry, isBelgiumCountry, isBulgariaCountry, isCroatiaCountry, isSloveniaCountry, isLithuaniaCountry, isLatviaCountry, isEstoniaCountry, isLuxembourgCountry, isMaltaCountry, isUkraineCountry, isBelarusCountry, isTurkeyCountry, isGeorgiaCountry, isArmeniaCountry, isAzerbaijanCountry, isRussiaCountry, isCyprusCountry, isIcelandCountry, isLiechtensteinCountry, isAndorraCountry, isMonacoCountry, isSanMarinoCountry, isVaticanCityCountry, isMoldovaCountry, isMontenegroCountry, isNorthMacedoniaCountry, isBosniaHerzegovinaCountry, isAlbaniaCountry, isKosovoCountry, isSerbiaCountry, isFranceCountry, isFinlandCountry, isGermanyCountry, isItalyCountry, isNetherlandsCountry, isPolandCountry, isPortugalCountry, isIrelandCountry, isCzechiaCountry, isHungaryCountry, isGreeceCountry, isRomaniaCountry, isSlovakiaCountry, isSpainCountry, isSwitzerlandCountry, isUnitedKingdomCountry} from '@/utils/gymCountry';
import {
  compactGymSearchValue,
  foldNordicSearchEquivalents,
  normalizeGymSearchValue,
} from './gymSearchNormalize';

export type GymSearchIndexEntry = {
  gym: DanishGym;
  nameNorm: string;
  nameCompact: string;
  brandNorm: string;
  brandCompact: string;
  cityNorm: string;
  streetNorm: string;
  addressNorm: string;
  regionNorm: string;
  postalNorm: string;
  /** Folded postal with spaces removed. Built once. */
  postalCompact: string;
  /** Combined searchable blob + aliases. Already Nordic-folded. */
  haystack: string;
  haystackCompact: string;
  words: string[];
};

const CHAIN_ALIASES: Record<string, string[]> = {
  puregym: ['pure gym', 'pure'],
  sats: ['sat'],
  'fitness x': ['fitnessx', 'fx', 'fitness'],
  arca: ['arca fitness'],
  'loop fitness': ['loop'],
  'sporting health club': ['shc', 'sporting'],
  shc: ['sporting health club', 'sporting'],
  stc: ['stc gym', 'stc training'],
  'nordic wellness': ['nordic', 'nw'],
  fitness24seven: ['fitness 24 seven', 'fitness 24/7', 'f24', 'fitness24'],
  'friskis & svettis': ['friskis', 'svettis', 'f&s'],
  actic: ['actic fitness'],
  // Norway
  'evo fitness': ['evo', 'evofitness'],
  'fresh fitness': ['fresh'],
  feel24: ['feel 24', 'feel'],
  'mudo gym': ['mudo'],
  '3t-treningssenter': ['3t', '3t trening', '3t treningssenter'],
  mova: ['mova trening'],
  sporty: ['family sports club', 'aktiv365', 'aktiv trening'],
  fitnesspoint: ['fitness point', 'fp'],
  'impulse treningssenter': ['impulse', 'impulse trening'],
  'sky fitness': ['sky'],
  spenst: ['spenst trening'],
  // Germany
  'clever fit': ['cleverfit', 'clever'],
  mcfit: ['mc fit', 'mc-fit'],
  fitx: ['fit x', 'fit-x'],
  'all inclusive fitness': ['all inclusive', 'allinclusive'],
  easyfitness: ['easy fitness', 'easy-fitness'],
  // Finland — aliases only; stored official names are unchanged
  elixia: ['sats', 'sats elixia', 'sats finland'],
  fressi: ['fressi 24h'],
  liikku: ['kuntokeskus liikku'],
  easyfit: ['easy fit'],
  'ole.fit': ['olefit', 'ole fit'],
  'gogo express': ['gogoexpress', 'gx'],
  'gym anytime': ['gymanytime'],
  ptvgym: ['ptv gym', 'ptv'],
  ladyline: ['lady line'],
  greenfit: ['green fit'],
  vocatum: ['vocatum wellness', 'up and go', 'up&go'],
  energy: ['kuntokeskus energy'],
  esport: ['esport center', 'esport express'],
  kieser: ['kieser training'],
  'fitness first': ['fitnessfirst'],
  injoy: ['in joy', 'in-joy'],
  'basic fit': ['basicfit', 'basic-fit'],
  'john reed': ['johnreed'],
  'prime time fitness': ['prime time', 'primetime'],
  venicebeach: ['venice beach', 'venice-beach'],
  pfitzenmeier: ['pfitzenmeier fitness'],
  elbgym: ['elb gym', 'elb-gym'],
  elements: ['elements fitness'],
  "gold's gym": ['golds gym', 'gold gym', 'golds'],
  // United Kingdom — aliases only; stored official names are unchanged
  'the gym group': ['the gym', 'gym group'],
  'anytime fitness': ['anytime'],
  'david lloyd': ['david lloyd clubs'],
  'nuffield health': ['nuffield'],
  'jd gyms': ['jd gym', 'jd'],
  'snap fitness': ['snap'],
  bannatyne: ['bannatynes'],
  'everlast gyms': ['everlast', 'everlast gym'],
  'energie fitness': ['energie'],
  'village gym': ['village'],
  'virgin active': ['virgin'],
  gymbox: ['gym box'],
  'buzz gym': ['buzz'],
  fitness4less: ['fitness 4 less', 'fitness4 less'],
  easygym: ['easy gym', 'easy-gym'],
  'third space': ['thirdspace'],
  'total fitness': ['totalfitness'],
  // Netherlands
  'basic-fit': ['basicfit', 'basic fit'],
  sportcity: ['sport city'],
  trainmore: ['train more'],
  biggym: ['big gym'],
  healthcity: ['health city'],
  optisport: ['opti sport'],
  clubsportive: ['club sportive'],
  'fit for free': ['fitforfree', 'fff'],
  // France
  'fitness park': ['fitnesspark'],
  "l'orange bleue": ['lorange bleue', 'orange bleue', 'lob'],
  'keepcool': ['keep cool'],
  'on air fitness': ['onair', 'on air', 'onairfitness'],
  'neoness': ['neo ness'],
  "l'appart fitness": ['lappart fitness', 'lappart', 'appart fitness'],
  'elancia': ['elancia fitness'],
  'gigafit': ['giga fit'],
  'magic form': ['magicform'],
  'vita liberté': ['vita liberte', 'vita'],
  // Spain — aliases only; stored official names are unchanged
  vivagym: ['viva gym', 'viva'],
  synergym: ['syner gym'],
  beone: ['be one', 'be-one'],
  'holiday gym': ['holidaygym', 'holiday'],
  dreamfit: ['dream fit'],
  'enjoy!': ['enjoy', 'enjoy fitness'],
  'go fit': ['gofit', 'go-fit'],
  altafit: ['alta fit'],
  eurofitness: ['euro fitness'],
  metropolitan: ['metropolitan club', 'metropolitan clubs'],
  'o2 centro wellness': ['o2', 'o2 centro', 'o2 wellness'],
  forus: ['forus gym'],
  dir: ['dir gym', 'dir fitness'],
  // Italy — aliases only; stored official names are unchanged
  fitactive: ['fit active', 'fit-active'],
  fitup: ['fit up', 'fit-up'],
  'fit express': ['fitexpress', 'fit-express'],
  'icon palestre': ['icon', 'icon palestra'],
  webfit: ['web fit', 'web-fit'],
  '20hours': ['20 hours', '20h', '20 hours fitness'],
  orange: ['orange fitness', 'orange gym'],
};

type CityAliasList = Array<[RegExp, string[]]>;

let cityAliasTablesCache: Record<string, CityAliasList> | null = null;

function loadCityAliasTables(): Record<string, CityAliasList> {
  if (cityAliasTablesCache) {
    return cityAliasTablesCache;
  }
  const swedishCities: Array<[RegExp, string[]]> = [
    [/stockholm/i, ['stockholm', 'sthlm']],
    [/göteborg|goteborg/i, ['goteborg', 'göteborg', 'gbg']],
    [/malmö|malmo/i, ['malmo', 'malmö', 'mma']],
    [/uppsala/i, ['uppsala']],
    [/västerås|vasteras/i, ['vasteras', 'västerås']],
    [/örebro|orebro/i, ['orebro', 'örebro']],
    [/linköping|linkoping/i, ['linkoping', 'linköping']],
    [/norrköping|norrkoping/i, ['norrkoping', 'norrköping']],
    [/jönköping|jonkoping/i, ['jonkoping', 'jönköping']],
    [/helsingborg/i, ['helsingborg']],
    [/lund/i, ['lund']],
    [/umeå|umea/i, ['umea', 'umeå']],
    [/gävle|gavle/i, ['gavle', 'gävle']],
    [/sundsvall/i, ['sundsvall']],
    [/karlstad/i, ['karlstad']],
    [/borås|boras/i, ['boras', 'borås']],
    [/eskilstuna/i, ['eskilstuna']],
    [/solna/i, ['solna']],
    [/sundbyberg/i, ['sundbyberg']],
  ];
  // Norway — include ASCII forms (ø→o) so "Tromso"/"Lorenskog" match diacritic cities
  const norwegianCities: Array<[RegExp, string[]]> = [
    [/oslo/i, ['oslo']],
    [/bergen/i, ['bergen']],
    [/trondheim/i, ['trondheim']],
    [/stavanger/i, ['stavanger']],
    [/drammen/i, ['drammen']],
    [/lørenskog|lorenskog|loerenskog/i, ['lorenskog', 'lørenskog', 'loerenskog']],
    [/tromsø|tromso|tromsoe/i, ['tromso', 'tromsø', 'tromsoe']],
    [/kristiansand/i, ['kristiansand']],
    [/ålesund|alesund|aalesund/i, ['alesund', 'ålesund', 'aalesund']],
    [/bodø|bodo|bodoe/i, ['bodo', 'bodø', 'bodoe']],
    [/sandnes/i, ['sandnes']],
    [/fredrikstad/i, ['fredrikstad']],
    [/sarpsborg/i, ['sarpsborg']],
    [/skien/i, ['skien']],
    [/horten/i, ['horten']],
    [/moss\b/i, ['moss']],
    [/lærdal|laerdal/i, ['laerdal', 'lærdal']],
  ];
  // Germany — ASCII + ae/oe/ue so "Munchen"/"Koeln" match official umlaut cities
  const germanCities: Array<[RegExp, string[]]> = [
    [/berlin/i, ['berlin']],
    [/hamburg/i, ['hamburg']],
    [/münchen|munchen|muenchen/i, ['munchen', 'muenchen', 'münchen']],
    [/köln|koln|koeln/i, ['koln', 'koeln', 'köln']],
    [/frankfurt/i, ['frankfurt']],
    [/düsseldorf|dusseldorf|duesseldorf/i, ['dusseldorf', 'duesseldorf', 'düsseldorf']],
    [/stuttgart/i, ['stuttgart']],
    [/leipzig/i, ['leipzig']],
    [/dortmund/i, ['dortmund']],
    [/hannover/i, ['hannover']],
    [/nürnberg|nurnberg|nuernberg/i, ['nurnberg', 'nuernberg', 'nürnberg']],
    [/würzburg|wurzburg|wuerzburg/i, ['wurzburg', 'wuerzburg', 'würzburg']],
  ];
  const ukCities: Array<[RegExp, string[]]> = [
    [/london/i, ['london', 'greater london']],
    [/manchester/i, ['manchester']],
    [/birmingham/i, ['birmingham']],
    [/liverpool/i, ['liverpool']],
    [/leeds/i, ['leeds']],
    [/glasgow/i, ['glasgow']],
    [/edinburgh/i, ['edinburgh']],
    [/cardiff/i, ['cardiff']],
    [/belfast/i, ['belfast']],
    [/newcastle/i, ['newcastle', 'newcastle upon tyne']],
  ];
  const dutchCities: Array<[RegExp, string[]]> = [
    [/amsterdam/i, ['amsterdam']],
    [/rotterdam/i, ['rotterdam']],
    [/den haag|the hague|'s-gravenhage/i, ['den haag', 'the hague', "'s-gravenhage"]],
    [/utrecht/i, ['utrecht']],
    [/eindhoven/i, ['eindhoven']],
    [/groningen/i, ['groningen']],
    [/tilburg/i, ['tilburg']],
    [/almere/i, ['almere']],
    [/breda/i, ['breda']],
    [/nijmegen/i, ['nijmegen']],
    [/arnhem/i, ['arnhem']],
    [/haarlem/i, ['haarlem']],
    [/enschede/i, ['enschede']],
    [/apeldoorn/i, ['apeldoorn']],
    [/amersfoort/i, ['amersfoort']],
    [/maastricht/i, ['maastricht']],
    [/leiden/i, ['leiden']],
    [/delft/i, ['delft']],
    [/zwolle/i, ['zwolle']],
  ];
  const frenchCities: Array<[RegExp, string[]]> = [
    [/paris/i, ['paris']],
    [/marseille/i, ['marseille']],
    [/lyon/i, ['lyon']],
    [/toulouse/i, ['toulouse']],
    [/nice\b/i, ['nice']],
    [/nantes/i, ['nantes']],
    [/montpellier/i, ['montpellier']],
    [/strasbourg/i, ['strasbourg']],
    [/bordeaux/i, ['bordeaux']],
    [/lille/i, ['lille']],
    [/rennes/i, ['rennes']],
    [/reims/i, ['reims']],
    [/le havre/i, ['le havre']],
    [/saint[- ]étienne|saint[- ]etienne/i, ['saint-etienne', 'saint-étienne', 'st etienne']],
    [/toulon/i, ['toulon']],
    [/grenoble/i, ['grenoble']],
    [/dijon/i, ['dijon']],
    [/angers/i, ['angers']],
    [/nîmes|nimes/i, ['nimes', 'nîmes']],
    [/clermont[- ]ferrand/i, ['clermont-ferrand', 'clermont ferrand']],
    [/orléans|orleans/i, ['orleans', 'orléans']],
    [/rouen/i, ['rouen']],
    [/metz/i, ['metz']],
    [/caen/i, ['caen']],
    [/perpignan/i, ['perpignan']],
    [/avignon/i, ['avignon']],
    [/brest/i, ['brest']],
    [/limoges/i, ['limoges']],
    [/aix[- ]en[- ]provence/i, ['aix-en-provence', 'aix en provence', 'aix']],
  ];
  // Spain — ASCII + local forms (Coruña/Coruna, Málaga/Malaga, Palma de Mallorca)
  const spanishCities: Array<[RegExp, string[]]> = [
    [/madrid/i, ['madrid']],
    [/barcelona/i, ['barcelona', 'bcn']],
    [/valencia|valència/i, ['valencia', 'valència']],
    [/sevilla|seville/i, ['sevilla', 'seville']],
    [/zaragoza/i, ['zaragoza', 'saragossa']],
    [/málaga|malaga/i, ['malaga', 'málaga']],
    [/murcia/i, ['murcia']],
    [/palma de mallorca|\bpalma\b/i, ['palma', 'palma de mallorca', 'mallorca']],
    [/bilbao/i, ['bilbao']],
    [/alicante|alacant/i, ['alicante', 'alacant']],
    [/córdoba|cordoba/i, ['cordoba', 'córdoba']],
    [/valladolid/i, ['valladolid']],
    [/\bvigo\b/i, ['vigo']],
    [/a coruña|a coruna|la coruña|la coruna|coruña|coruna/i, [
      'a coruna',
      'a coruña',
      'la coruna',
      'la coruña',
      'coruna',
      'coruña',
    ]],
    [/granada/i, ['granada']],
    [/las palmas/i, ['las palmas', 'las palmas de gran canaria', 'gran canaria']],
    [/santa cruz de tenerife|tenerife/i, ['santa cruz de tenerife', 'tenerife', 'santa cruz']],
  ];
  // Italy — EN/IT forms + accent ASCII (Forlì/Forli, Città/Citta)
  const italianCities: Array<[RegExp, string[]]> = [
    [/\broma\b|\brome\b/i, ['roma', 'rome']],
    [/\bmilano\b|\bmilan\b/i, ['milano', 'milan']],
    [/\bnapoli\b|\bnaples\b/i, ['napoli', 'naples']],
    [/\btorino\b|\bturin\b/i, ['torino', 'turin']],
    [/\bpalermo\b/i, ['palermo']],
    [/\bgenova\b|\bgenoa\b/i, ['genova', 'genoa']],
    [/\bbologna\b/i, ['bologna']],
    [/\bfirenze\b|\bflorence\b/i, ['firenze', 'florence']],
    [/\bbari\b/i, ['bari']],
    [/\bcatania\b/i, ['catania']],
    [/\bverona\b/i, ['verona']],
    [/\bpadova\b|\bpadua\b/i, ['padova', 'padua']],
    [/\bvenezia\b|\bvenice\b/i, ['venezia', 'venice']],
    [/\btrieste\b/i, ['trieste']],
    [/\bcagliari\b/i, ['cagliari']],
    [/\bbrescia\b/i, ['brescia']],
    [/\bbergamo\b/i, ['bergamo']],
    [/forlì|forli/i, ['forli', 'forlì']],
    [/città di castello|citta di castello/i, ['citta di castello', 'città di castello']],
  ];
  // Belgium — NL/FR/EN multilingual city aliases (search-only; stored names unchanged)
  const belgianCities: Array<[RegExp, string[]]> = [
    [/brussels|bruxelles|brussel/i, ['brussels', 'bruxelles', 'brussel']],
    [/antwerp|antwerpen|anvers/i, ['antwerp', 'antwerpen', 'anvers']],
    [/\bghent\b|\bgent\b|\bgand\b/i, ['ghent', 'gent', 'gand']],
    [/liège|liege|\bluik\b/i, ['liège', 'liege', 'luik']],
    [/bruges|\bbrugge\b/i, ['bruges', 'brugge']],
    [/charleroi/i, ['charleroi']],
    [/\bnamur\b|\bnamen\b/i, ['namur', 'namen']],
    [/leuven|\blouvain\b/i, ['leuven', 'louvain']],
    [/mechelen|malines/i, ['mechelen', 'malines']],
    [/\bmons\b/i, ['mons', 'bergen']],
    [/oostende|ostend|ostende/i, ['oostende', 'ostend', 'ostende']],
    [/kortrijk|courtrai/i, ['kortrijk', 'courtrai']],
    [/hasselt/i, ['hasselt']],
    [/genk/i, ['genk']],
    [/aalst|\balost\b/i, ['aalst', 'alost']],
    [/sint[- ]niklaas|saint[- ]nicolas/i, ['sint-niklaas', 'saint-nicolas']],
    [/tournai|doornik/i, ['tournai', 'doornik']],
    [/wavre|\bwaver\b/i, ['wavre', 'waver']],
  ];
  // Poland — EN/PL + accentless ASCII (Łódź/Lodz); search-only
  const polishCities: Array<[RegExp, string[]]> = [
    [/warszawa|\bwarsaw\b/i, ['warszawa', 'warsaw']],
    [/kraków|\bkrakow\b|\bcracow\b/i, ['krakow', 'kraków', 'cracow']],
    [/łódź|\blodz\b/i, ['lodz', 'łódź']],
    [/wrocław|\bwroclaw\b/i, ['wroclaw', 'wrocław']],
    [/poznań|\bpoznan\b/i, ['poznan', 'poznań']],
    [/gdańsk|\bgdansk\b|\bdanzig\b/i, ['gdansk', 'gdańsk', 'danzig']],
    [/szczecin|\bstettin\b/i, ['szczecin', 'stettin']],
    [/bydgoszcz/i, ['bydgoszcz']],
    [/\blublin\b/i, ['lublin']],
    [/białystok|\bbialystok\b/i, ['bialystok', 'białystok']],
    [/katowice/i, ['katowice']],
    [/\bgdynia\b/i, ['gdynia']],
    [/częstochowa|\bczestochowa\b/i, ['czestochowa', 'częstochowa']],
    [/rzeszów|\brzeszow\b/i, ['rzeszow', 'rzeszów']],
    [/toruń|\btorun\b/i, ['torun', 'toruń']],
  ];
  // Austria — EN/DE + umlaut ASCII (Wien/Vienna); reuses German fold (ä/ö/ü/ß)
  const austrianCities: Array<[RegExp, string[]]> = [
    [/\bwien\b|\bvienna\b/i, ['wien', 'vienna']],
    [/\bgraz\b/i, ['graz']],
    [/\blinz\b/i, ['linz']],
    [/\bsalzburg\b/i, ['salzburg']],
    [/\binnsbruck\b/i, ['innsbruck']],
    [/klagenfurt am wörthersee|klagenfurt am worthersee|klagenfurt/i, ['klagenfurt', 'klagenfurt am wörthersee']],
    [/\bvillach\b/i, ['villach']],
    [/\bwels\b/i, ['wels']],
    [/sankt pölten|sankt polten|st\.?\s*pölten|st\.?\s*polten/i, ['sankt polten', 'sankt pölten', 'st pölten']],
    [/\bdornbirn\b/i, ['dornbirn']],
    [/wiener neustadt/i, ['wiener neustadt']],
    [/\bsteyr\b/i, ['steyr']],
    [/\bfeldkirch\b/i, ['feldkirch']],
    [/\bbregenz\b/i, ['bregenz']],
    [/\bleonding\b/i, ['leonding']],
  ];
  // Switzerland — DE/FR/IT multilingual city aliases (search-only; stored names unchanged)
  const swissCities: Array<[RegExp, string[]]> = [
    [/zürich|\bzurich\b/i, ['zurich', 'zürich']],
    [/genève|\bgeneve\b|\bgeneva\b|\bgenf\b/i, ['geneve', 'genève', 'geneva', 'genf']],
    [/basel|\bbâle\b|\bbale\b|\bbasilea\b/i, ['basel', 'bâle', 'bale', 'basilea']],
    [/\bbern\b|\bberne\b|\bberna\b/i, ['bern', 'berne', 'berna']],
    [/\blausanne\b/i, ['lausanne']],
    [/luzern|\blucerne\b/i, ['luzern', 'lucerne']],
    [/\blugano\b/i, ['lugano']],
    [/\bwinterthur\b/i, ['winterthur']],
    [/st\.?\s*gallen|saint[- ]gall|sankt gallen/i, ['st gallen', 'saint-gall', 'sankt gallen']],
    [/biel\/bienne|\bbiel\b|\bbienne\b/i, ['biel', 'bienne', 'biel/bienne']],
    [/fribourg|\bfreiburg\b/i, ['fribourg', 'freiburg']],
    [/neuchâtel|\bneuchatel\b|\bneuenburg\b/i, ['neuchatel', 'neuchâtel', 'neuenburg']],
  ];
  // Portugal — PT city aliases (search-only; stored official names unchanged)
  const portugueseCities: Array<[RegExp, string[]]> = [
    [/\blisboa\b|\blisbon\b/i, ['lisboa', 'lisbon']],
    [/\bporto\b|\boporto\b/i, ['porto', 'oporto']],
    [/vila nova de gaia|\bgaia\b/i, ['vila nova de gaia', 'gaia']],
    [/\bbraga\b/i, ['braga']],
    [/\bcoimbra\b/i, ['coimbra']],
    [/\baveiro\b/i, ['aveiro']],
    [/\bleiria\b/i, ['leiria']],
    [/\bfaro\b/i, ['faro']],
    [/évora|\bevora\b/i, ['evora', 'évora']],
    [/setúbal|\bsetubal\b/i, ['setubal', 'setúbal']],
    [/\bviseu\b/i, ['viseu']],
    [/guimarães|\bguimaraes\b/i, ['guimaraes', 'guimarães']],
    [/\bfunchal\b/i, ['funchal']],
    [/ponta delgada/i, ['ponta delgada']],
    [/\bmatosinhos\b/i, ['matosinhos']],
    [/\bcascais\b/i, ['cascais']],
    [/\bsintra\b/i, ['sintra']],
    [/\balmada\b/i, ['almada']],
    [/\bamadora\b/i, ['amadora']],
  ];
  // Ireland — major cities (search-only)
  const irishCities: Array<[RegExp, string[]]> = [
    [/\bdublin\b|baile átha cliath|baile atha cliath/i, ['dublin', 'baile atha cliath']],
    [/\bcork\b|corcaigh/i, ['cork', 'corcaigh']],
    [/\blimerick\b|luimneach/i, ['limerick', 'luimneach']],
    [/\bgalway\b|gaillimh/i, ['galway', 'gaillimh']],
    [/\bwaterford\b|port láirge|port lairge/i, ['waterford', 'port lairge']],
    [/\bdrogheda\b/i, ['drogheda']],
    [/\bkilkenny\b|cill chainnigh/i, ['kilkenny', 'cill chainnigh']],
    [/\bsligo\b|sligeach/i, ['sligo', 'sligeach']],
    [/\bathlone\b/i, ['athlone']],
    [/\bdundalk\b|dún dealgan|dun dealgan/i, ['dundalk', 'dun dealgan']],
  ];
  // Czechia — city aliases (search-only; stored names unchanged)
  const czechCities: Array<[RegExp, string[]]> = [
    [/\bpraha\b|\bprague\b/i, ['praha', 'prague']],
    [/\bbrno\b/i, ['brno']],
    [/\bostrava\b/i, ['ostrava']],
    [/plzeň|\bplzen\b/i, ['plzen', 'plzeň']],
    [/\bliberec\b/i, ['liberec']],
    [/\bolomouc\b/i, ['olomouc']],
    [/české budějovice|ceske budejovice|ceské budějovice/i, [
      'ceske budejovice',
      'české budějovice',
    ]],
    [/hradec králové|hradec kralove/i, ['hradec kralove', 'hradec králové']],
    [/\bpardubice\b/i, ['pardubice']],
    [/zlín|\bzlin\b/i, ['zlin', 'zlín']],
  ];
  // Hungary — city aliases (search-only)
  const hungarianCities: Array<[RegExp, string[]]> = [
    [/\bbudapest\b/i, ['budapest']],
    [/\bdebrecen\b/i, ['debrecen']],
    [/\bszeged\b/i, ['szeged']],
    [/\bmiskolc\b/i, ['miskolc']],
    [/pécs|\bpecs\b/i, ['pecs', 'pécs']],
    [/győr|\bgyor\b/i, ['gyor', 'győr']],
    [/nyíregyháza|nyiregyhaza/i, ['nyiregyhaza', 'nyíregyháza']],
    [/kecskemét|\bkecskemet\b/i, ['kecskemet', 'kecskemét']],
    [/székesfehérvár|szekesfehervar/i, ['szekesfehervar', 'székesfehérvár']],
    [/\bszombathely\b/i, ['szombathely']],
  ];
  // Romania — city aliases (search-only; stored Romanian spelling unchanged)
  const romanianCities: Array<[RegExp, string[]]> = [
    [/bucurești|bucuresti|\bbucharest\b/i, ['bucuresti', 'bucurești', 'bucharest']],
    [/cluj-napoca|\bcluj\b/i, ['cluj', 'cluj-napoca']],
    [/timișoara|timisoara/i, ['timisoara', 'timișoara']],
    [/\biași\b|\biasi\b/i, ['iasi', 'iași']],
    [/brașov|\bbrasov\b/i, ['brasov', 'brașov']],
    [/constanța|\bconstanta\b/i, ['constanta', 'constanța']],
    [/ploiești|\bploiesti\b/i, ['ploiesti', 'ploiești']],
    [/târgu mureș|targu mures/i, ['targu mures', 'târgu mureș']],
  ];
  // Slovakia — city aliases (search-only; stored Slovak spelling unchanged)
  const slovakCities: Array<[RegExp, string[]]> = [
    [/\bbratislava\b/i, ['bratislava']],
    [/košice|\bkosice\b/i, ['kosice', 'košice']],
    [/prešov|\bpresov\b/i, ['presov', 'prešov']],
    [/žilina|\bzilina\b/i, ['zilina', 'žilina']],
    [/banská bystrica|banska bystrica/i, ['banska bystrica', 'banská bystrica']],
    [/trenčín|\btrencin\b/i, ['trencin', 'trenčín']],
    [/\btrnava\b/i, ['trnava']],
    [/\bnitra\b/i, ['nitra']],
    [/\bpoprad\b/i, ['poprad']],
    [/\bmartin\b/i, ['martin']],
  ];
  // Bulgaria — Latin + Cyrillic aliases (search-only; stored spelling unchanged)
  const bulgarianCities: Array<[RegExp, string[]]> = [
    [/софия|\bsofia\b/i, ['sofia', 'софия']],
    [/пловдив|\bplovdiv\b/i, ['plovdiv', 'пловдив']],
    [/варна|\bvarna\b/i, ['varna', 'варна']],
    [/бургас|\bburgas\b/i, ['burgas', 'бургас']],
    [/русе|\bruse\b/i, ['ruse', 'русе']],
    [/стара загора|\bstara zagora\b/i, ['stara zagora', 'стара загора']],
    [/перник|\bpernik\b/i, ['pernik', 'перник']],
    [/свети влас|\bsveti vlas\b/i, ['sveti vlas', 'свети влас']],
    [/кърджали|карджали|\bkardzhali\b|\bkardjali\b/i, [
      'kardzhali',
      'kardjali',
      'кърджали',
      'карджали',
    ]],
    [/плевен|\bpleven\b/i, ['pleven', 'плевен']],
    [/велико търново|\bveliko tarnovo\b/i, [
      'veliko tarnovo',
      'велико търново',
    ]],
    [/благоевград|\bblagoevgrad\b/i, ['blagoevgrad', 'благоевград']],
  ];
  // Croatia — Latin + diacritic/ASCII aliases (search-only; stored spelling unchanged)
  const croatianCities: Array<[RegExp, string[]]> = [
    [/\bzagreb\b/i, ['zagreb']],
    [/\bsplit\b/i, ['split']],
    [/\brijeka\b/i, ['rijeka']],
    [/\bosijek\b/i, ['osijek']],
    [/\bzadar\b/i, ['zadar']],
    [/\bpula\b/i, ['pula']],
    [/varaždin|\bvarazdin\b/i, ['varazdin', 'varaždin']],
    [/šibenik|\bsibenik\b/i, ['sibenik', 'šibenik']],
    [/čakovec|\bcakovec\b/i, ['cakovec', 'čakovec']],
    [/đakovo|\bdakovo\b/i, ['dakovo', 'đakovo']],
    [/dubrovnik/i, ['dubrovnik']],
    [/karlovac/i, ['karlovac']],
    [/slavonski brod/i, ['slavonski brod']],
    [/velika gorica/i, ['velika gorica']],
    [/zaprešić|\bzapresic\b/i, ['zapresic', 'zaprešić']],
    [/samobor/i, ['samobor']],
  ];
  // Slovenia — Latin + diacritic/ASCII aliases (search-only; stored spelling unchanged)
  const slovenianCities: Array<[RegExp, string[]]> = [
    [/ljubljana/i, ['ljubljana']],
    [/maribor/i, ['maribor']],
    [/celje/i, ['celje']],
    [/kranj/i, ['kranj']],
    [/koper|\bcapodistria\b/i, ['koper', 'capodistria']],
    [/novo mesto/i, ['novo mesto']],
    [/velenje/i, ['velenje']],
    [/nova gorica/i, ['nova gorica']],
    [/ptuj/i, ['ptuj']],
    [/murska sobota/i, ['murska sobota']],
    [/slovenj gradec/i, ['slovenj gradec']],
    [/domžale|\bdomzale\b/i, ['domzale', 'domžale']],
    [/kamnik/i, ['kamnik']],
    [/mengeš|\bmenges\b/i, ['menges', 'mengeš']],
    [/jesenice/i, ['jesenice']],
    [/grosuplje/i, ['grosuplje']],
    [/šiška|\bsiska\b/i, ['siska']],
    [/bežigrad|\bbezigrad\b/i, ['bezigrad', 'bežigrad']],
    [/rudnik/i, ['rudnik']],
    [/črnuče|\bcrnuce\b/i, ['crnuce', 'črnuče']],
    [/škofja loka|\bskofja loka\b/i, ['skofja loka', 'škofja loka']],
    [/žalec|\bzalec\b/i, ['zalec', 'žalec']],
  ];
  // Lithuania — Latin + diacritic/ASCII aliases (search-only; stored spelling unchanged)
  const lithuanianCities: Array<[RegExp, string[]]> = [
    [/vilnius/i, ['vilnius']],
    [/kaunas/i, ['kaunas']],
    [/klaipėda|\bklaipeda\b/i, ['klaipeda', 'klaipėda']],
    [/šiauliai|\bsiauliai\b/i, ['siauliai', 'šiauliai']],
    [/panevėžys|\bpanevezys\b/i, ['panevezys', 'panevėžys']],
    [/alytus/i, ['alytus']],
    [/marijampolė|\bmarijampole\b/i, ['marijampole', 'marijampolė']],
    [/mažeikiai|\bmazeikiai\b/i, ['mazeikiai', 'mažeikiai']],
    [/jonava/i, ['jonava']],
    [/utena/i, ['utena']],
    [/kėdainiai|\bkėdainiai\b|\bkedainiai\b/i, ['kedainiai', 'kėdainiai']],
    [/tauragė|\btaurage\b/i, ['taurage', 'tauragė']],
    [/telšiai|\btelsiai\b/i, ['telsiai', 'telšiai']],
    [/palanga/i, ['palanga']],
    [/druskininkai/i, ['druskininkai']],
    [/visaginas/i, ['visaginas']],
    [/garliava/i, ['garliava']],
  ];
  const latvianCities: Array<[RegExp, string[]]> = [
    [/rīga|\briga\b/i, ['riga', 'rīga']],
    [/daugavpils/i, ['daugavpils']],
    [/liepāja|\bliepaja\b/i, ['liepaja', 'liepāja']],
    [/jelgava/i, ['jelgava']],
    [/jūrmala|\bjurmala\b/i, ['jurmala', 'jūrmala']],
    [/ventspils/i, ['ventspils']],
    [/rēzekne|\brezekne\b/i, ['rezekne', 'rēzekne']],
    [/valmiera/i, ['valmiera']],
    [/jēkabpils|\bjekabpils\b/i, ['jekabpils', 'jēkabpils']],
    [/\bogre\b/i, ['ogre']],
  ];
  const estonianCities: Array<[RegExp, string[]]> = [
    [/tallinn/i, ['tallinn']],
    [/tartu/i, ['tartu']],
    [/narva/i, ['narva']],
    [/pärnu|\bparnu\b/i, ['parnu', 'pärnu']],
    [/viljandi/i, ['viljandi']],
    [/rakvere/i, ['rakvere']],
    [/jõhvi|\bjohvi\b/i, ['johvi', 'jõhvi']],
    [/võru|\bvoru\b/i, ['voru', 'võru']],
    [/kuressaare/i, ['kuressaare']],
    [/maardu/i, ['maardu']],
    [/haapsalu/i, ['haapsalu']],
    [/paide/i, ['paide']],
    [/valga/i, ['valga']],
    [/sillamäe|\bsillamae\b/i, ['sillamae', 'sillamäe']],
    [/kohtla[- ]?järve|\bkohtla[- ]?jarve\b/i, ['kohtla-jarve', 'kohtla-järve']],
    [/viimsi/i, ['viimsi']],
    [/keila/i, ['keila']],
    [/saue/i, ['saue']],
    [/jõgeva|\bjogeva\b/i, ['jogeva', 'jõgeva']],
  ];
  const luxembourgCities: Array<[RegExp, string[]]> = [
    [/luxembourg[\s-]?city|\bluxembourg\b|\bluxemburg\b/i, ['luxembourg', 'luxemburg']],
    [/esch[- ]?sur[- ]?alzette|\besch\b/i, ['esch', 'esch-sur-alzette']],
    [/differdange/i, ['differdange']],
    [/dudelange/i, ['dudelange']],
    [/pétange|\bpetange\b/i, ['petange', 'pétange']],
    [/sanem/i, ['sanem']],
    [/hesperange/i, ['hesperange']],
    [/bettembourg/i, ['bettembourg']],
    [/strassen/i, ['strassen']],
    [/bertrange/i, ['bertrange']],
    [/mamer/i, ['mamer']],
    [/mersch/i, ['mersch']],
    [/ettelbruck|ettelbrück/i, ['ettelbruck', 'ettelbrück']],
    [/diekirch/i, ['diekirch']],
    [/wiltz/i, ['wiltz']],
    [/grevenmacher/i, ['grevenmacher']],
    [/remich/i, ['remich']],
    [/belvaux|belval/i, ['belvaux', 'belval']],
    [/foetz/i, ['foetz']],
    [/gasperich/i, ['gasperich']],
    [/kirchberg/i, ['kirchberg']],
    [/junglinster/i, ['junglinster']],
    [/sandweiler/i, ['sandweiler']],
    [/bereldange/i, ['bereldange']],
    [/windhof/i, ['windhof']],
    [/howald/i, ['howald']],
  ];
  const maltaCities: Array<[RegExp, string[]]> = [
    [/\bmalta\b|\bgozo\b|\bgħawdex\b|\bghawdex\b/i, ['malta', 'gozo']],
    [/birkirkara|\bbkara\b/i, ['birkirkara']],
    [/sliema/i, ['sliema']],
    [/st\.?\s*julian'?s?|san\s*ġiljan|san\s*giljan/i, ["st julian's", 'san giljan']],
    [/gżira|gzira/i, ['gzira', 'gżira']],
    [/msida/i, ['msida']],
    [/mosta/i, ['mosta']],
    [/qormi/i, ['qormi']],
    [/pembroke/i, ['pembroke']],
    [/mellieħa|mellieha/i, ['mellieha', 'mellieħa']],
    [/san\s*ġwann|san\s*gwann/i, ['san gwann', 'san ġwann']],
    [/st\.?\s*paul'?s?\s*bay|san\s*pawl|buġibba|bugibba|qawra/i, ["st paul's bay", 'bugibba']],
    [/attard|ta'?\s*qali/i, ['attard', 'ta qali']],
    [/żebbuġ|zebbug/i, ['zebbug', 'żebbuġ']],
    [/valletta/i, ['valletta']],
    [/marsa\b/i, ['marsa']],
    [/birżebbuġa|birzebbuga/i, ['birzebbuga']],
    [/kirkop/i, ['kirkop']],
    [/marsaskala|marsascala/i, ['marsaskala']],
    [/bormla|cospicua|cottonera/i, ['bormla', 'cottonera']],
    [/birgu|vittoriosa/i, ['birgu']],
    [/victoria|rabat.*gozo|gozo.*rabat/i, ['victoria', 'rabat']],
    [/xewkija/i, ['xewkija']],
    [/fgura/i, ['fgura']],
    [/naxxar/i, ['naxxar']],
    [/żurrieq|zurrieq/i, ['zurrieq']],
    [/santa\s*venera/i, ['santa venera']],
    [/swieqi/i, ['swieqi']],
  ];
  const ukrainianCities: Array<[RegExp, string[]]> = [
    [/\bukraine\b|\bукраїна\b|\bукраина\b/i, ['ukraine', 'україна']],
    [/kyiv|\bkiev\b|\bкиїв\b/i, ['kyiv', 'kiev', 'київ']],
    [/kharkiv|\bkharkov\b|\bхарків\b/i, ['kharkiv', 'kharkov', 'харків']],
    [/odesa|\bodessa\b|\bодеса\b/i, ['odesa', 'odessa', 'одеса']],
    [/lviv|\blvov\b|\bльвів\b/i, ['lviv', 'lvov', 'львів']],
    [/dnipro|\bdnepr\b|\bдніпро\b/i, ['dnipro', 'dnepr', 'дніпро']],
    [/vinnytsia|\bvinnitsa\b|\bвінниця\b/i, ['vinnytsia', 'vinnitsa']],
    [/zhytomyr|\bzhitomir\b/i, ['zhytomyr', 'zhitomir']],
    [/poltava/i, ['poltava']],
    [/cherkasy|\bcherkassy\b/i, ['cherkasy', 'cherkassy']],
    [/chernivtsi/i, ['chernivtsi']],
    [/rivne|\brovno\b/i, ['rivne', 'rovno']],
    [/lutsk|\blutck\b/i, ['lutsk', 'lutck']],
    [/kryvyi\s*rih|\bkrivij\b/i, ['kryvyi rih', 'krivij rig']],
    [/kremenchuk|\bkremenchug\b/i, ['kremenchuk', 'kremenchug']],
    [/bucha/i, ['bucha']],
    [/ivano[- ]?frankivsk/i, ['ivano-frankivsk']],
    [/boryspil/i, ['boryspil']],
    [/bila\s*tserkva/i, ['bila tserkva']],
    [/uzhhorod/i, ['uzhhorod']],
  ];
  const belarusianCities: Array<[RegExp, string[]]> = [
    [/\bbelarus\b|\bбеларусь\b|\bbielarus\b/i, ['belarus', 'беларусь']],
    [/minsk|\bминск\b|\bмінск\b/i, ['minsk', 'минск', 'мінск']],
    [/gomel|\bгомель\b/i, ['gomel', 'гомель']],
    [/vitebsk|\bвитебск\b|\bвіцебск\b/i, ['vitebsk', 'витебск', 'віцебск']],
    [/grodno|\bhrodna\b|\bгродно\b|\bгродна\b/i, ['grodno', 'hrodna', 'гродно']],
    [/mogilev|\bmahilyow\b|\bмогилёв\b|\bмагілёў\b/i, ['mogilev', 'mahilyow', 'могилёв']],
    [/brest|\bбрест\b|\bбрэст\b/i, ['brest', 'брест']],
    [/babruysk|\bbobruisk/i, ['babruysk', 'bobruisk']],
    [/baranavichy|\bbaranovichi\b/i, ['baranavichy', 'baranovichi']],
    [/barysaw|\bborisov\b/i, ['barysaw', 'borisov']],
    [/pinsk/i, ['pinsk']],
    [/orsha/i, ['orsha']],
    [/mazyr|\bmozyr\b/i, ['mazyr', 'mozyr']],
    [/salihorsk|\bsoligorsk\b/i, ['salihorsk', 'soligorsk']],
    [/borovlyany|\bborovliany\b/i, ['borovlyany']],
  ];
  const turkishCities: Array<[RegExp, string[]]> = [
    [/\bturkey\b|\btürkiye\b|\bturkiye\b|\btürkei\b/i, ['turkey', 'türkiye', 'turkiye']],
    [/istanbul|i̇stanbul|İstanbul/i, ['istanbul', 'istanbul']],
    [/\bankara\b/i, ['ankara']],
    [/izmir|i̇zmir|İzmir/i, ['izmir', 'izmir']],
    [/\bbursa\b/i, ['bursa']],
    [/\bantalya\b/i, ['antalya']],
    [/\badana\b/i, ['adana']],
    [/\bkonya\b/i, ['konya']],
    [/\bgaziantep\b/i, ['gaziantep']],
    [/\bmersin\b/i, ['mersin']],
    [/\bkocaeli\b|\bizmit\b/i, ['kocaeli', 'izmit']],
    [/diyarbak[iı]r/i, ['diyarbakir', 'diyarbakır']],
    [/\bkayseri\b/i, ['kayseri']],
    [/eski[sş]ehir/i, ['eskisehir', 'eskişehir']],
    [/\bsamsun\b/i, ['samsun']],
    [/\bdenizli\b/i, ['denizli']],
    [/[sş]anl[iı]urfa|\burfa\b/i, ['sanliurfa', 'şanlıurfa', 'urfa']],
  ];
  const georgianCities: Array<[RegExp, string[]]> = [
    [/\bgeorgia\b|\bsakartvelo\b|საქართველო/i, ['georgia', 'sakartvelo', 'საქართველო']],
    [/tbilisi|თბილისი/i, ['tbilisi', 'თბილისი']],
    [/batumi|ბათუმი/i, ['batumi', 'ბათუმი']],
    [/kutaisi|ქუთაისი/i, ['kutaisi', 'ქუთაისი']],
    [/rustavi|რუსთავი/i, ['rustavi', 'რუსთავი']],
    [/\bgori\b/i, ['gori']],
    [/zugdidi/i, ['zugdidi']],
    [/\bpoti\b/i, ['poti']],
    [/telavi/i, ['telavi']],
    [/kobuleti/i, ['kobuleti']],
    [/oktopus/i, ['oktopus fitness', 'oktopus']],
    [/world class/i, ['world class georgia', 'world class']],
    [/champion/i, ['champion']],
    [/fitness house/i, ['fitness house']],
  ];
  const armenianCities: Array<[RegExp, string[]]> = [
    [/\barmenia\b|\bhayastan\b|Հայաստան/i, ['armenia', 'hayastan', 'Հայաստան']],
    [/yerevan|երևան/i, ['yerevan', 'երևան', 'erevan']],
    [/gyumri|գյումրի/i, ['gyumri', 'գyumri', 'leninakan']],
    [/vanadzor|վանաձոր/i, ['vanadzor', 'վանաձոր']],
    [/\babovyan\b/i, ['abovyan']],
    [/\bhrazdan\b/i, ['hrazdan']],
    [/\bkapan\b/i, ['kapan']],
    [/\barmavir\b/i, ['armavir']],
    [/\bgoris\b/i, ['goris']],
    [/orange fitness/i, ['orange fitness', 'orangefitness']],
    [/panorama fitness/i, ['panorama fitness', 'panorama']],
    [/gold'?s gym/i, ['gold\'s gym', 'golds gym']],
    [/energy fitness/i, ['energy fitness']],
  ];
  const azerbaijaniCities: Array<[RegExp, string[]]> = [
    [/\bazerbaijan\b|\bazerbaycan\b|\bazərbaycan\b/i, ['azerbaijan', 'azerbaycan', 'azərbaycan']],
    [/baku|bakı|baki/i, ['baku', 'bakı', 'baki']],
    [/sumqayit|sumgait|sumqayıt/i, ['sumqayit', 'sumgait']],
    [/ganja|gəncə|gence/i, ['ganja', 'gəncə', 'gence']],
    [/mingachevir|mingəçevir/i, ['mingachevir', 'mingəçevir']],
    [/nakhchivan|naxçıvan|naxcivan/i, ['nakhchivan', 'naxçıvan']],
    [/lankaran|lənkəran/i, ['lankaran', 'lənkəran']],
    [/shaki|şəki|sheki/i, ['shaki', 'şəki', 'sheki']],
    [/nasimi|nizami|yasamal|sabail|narimanov|khatai/i, ['nasimi', 'nizami', 'yasamal', 'sabail']],
    [/world class/i, ['world class azerbaijan', 'world class']],
    [/fs club|fsclub/i, ['fs club', 'fsclub']],
    [/1st fitness|first fitness/i, ['1st fitness', 'first fitness']],
    [/fitclub|fit way|fitway/i, ['fitclub', 'fit way', 'fitway']],
    [/sport life/i, ['sport life']],
    [/dream body/i, ['dream body']],
    [/gold'?s gym/i, ['gold\'s gym', 'golds gym']],
  ];
  const russianCities: Array<[RegExp, string[]]> = [
    [/\brussia\b|\brossiya\b|\bроссия\b|\brussian federation\b/i, ['russia', 'rossiya', 'россия']],
    [/moscow|moskva|москва/i, ['moscow', 'moskva', 'москва']],
    [/saint petersburg|st\.?\s*petersburg|sankt-?peterburg|spb|санкт-?петербург|петербург/i, ['saint petersburg', 'sankt-peterburg', 'spb', 'санкт-петербург']],
    [/novosibirsk|новосибирск/i, ['novosibirsk', 'новосибирск']],
    [/yekaterinburg|ekaterinburg|екатеринбург/i, ['yekaterinburg', 'ekaterinburg', 'екатеринбург']],
    [/kazan|казань/i, ['kazan', 'казань']],
    [/nizhny novgorod|nizhniy novgorod|нижний новгород/i, ['nizhny novgorod', 'нижний новгород']],
    [/samara|самара/i, ['samara', 'самара']],
    [/rostov|ростов/i, ['rostov-on-don', 'rostov', 'ростов']],
    [/krasnodar|краснодар/i, ['krasnodar', 'краснодар']],
    [/sochi|сочи/i, ['sochi', 'сочи']],
    [/vladivostok|владивосток/i, ['vladivostok', 'владивосток']],
    [/world class/i, ['world class russia', 'world class']],
    [/x-?fit|xfit/i, ['x-fit', 'xfit']],
    [/alex fitness/i, ['alex fitness']],
    [/ddx\s*fitness|ddxfitness/i, ['ddx fitness', 'ddxfitness']],
    [/spirit fitness/i, ['spirit fitness']],
  ];
  const cyprusCities: Array<[RegExp, string[]]> = [
    [/\bcyprus\b|\bκύπρος\b|\bkypros\b|\bkýpros\b/i, ['cyprus', 'kypros']],
    [/nicosia|lefkosia|λευκωσία/i, ['nicosia', 'lefkosia']],
    [/limassol|lemesos|λεμεσός/i, ['limassol', 'lemesos']],
    [/larnaca|larnaka|λάρνακα/i, ['larnaca', 'larnaka']],
    [/paphos|pafos|πάφος/i, ['paphos', 'pafos']],
    [/paralimni/i, ['paralimni']],
    [/ayia\s*napa|agia\s*napa/i, ['ayia napa', 'agia napa']],
    [/protaras/i, ['protaras']],
    [/aradippou/i, ['aradippou']],
    [/strovolos|στρόβολος/i, ['strovolos']],
    [/lakatamia|lakatameia/i, ['lakatamia']],
    [/engomi|egkomi|έγκωμη/i, ['engomi', 'egkomi']],
    [/aglantzia|aglandjia|αγλαντζιά/i, ['aglantzia']],
    [/peyia|pegeia/i, ['peyia', 'pegeia']],
    [/germasogeia|yermasoyia/i, ['germasogeia']],
  ];
  const icelandCities: Array<[RegExp, string[]]> = [
    [/\biceland\b|\bísland\b|\bisland\b/i, ['iceland', 'island', 'island']],
    [/reykjav[ií]k/i, ['reykjavik', 'reykjavík']],
    [/k[oó]pavogur|kopavogur/i, ['kopavogur', 'kópavogur']],
    [/hafnarf[jö]r[dð]ur|hafnarfjordur/i, ['hafnarfjordur', 'hafnarfjörður']],
    [/gar[dð]ab[aæ]r|gardabaer/i, ['gardabaer', 'garðabær']],
    [/mosfellsb[aæ]r|mosfellsbaer/i, ['mosfellsbaer', 'mosfellsbær']],
    [/seltjarnarnes/i, ['seltjarnarnes']],
    [/reykjanesb[aæ]r|keflav[ií]k|keflavik/i, ['reykjanesbaer', 'keflavik', 'reykjanesbær']],
    [/akureyri/i, ['akureyri']],
    [/selfoss/i, ['selfoss']],
    [/akranes/i, ['akranes']],
    [/borgarnes/i, ['borgarnes']],
    [/[ií]safj[oö]r[dð]ur|isafjordur/i, ['isafjordur', 'ísafjörður']],
    [/egilssta[dð]ir|egilsstadir/i, ['egilsstadir', 'egilsstaðir']],
    [/vestmannaeyjar|vestmannaeyja/i, ['vestmannaeyjar']],
    [/hverager[dð]i|hveragerdi/i, ['hveragerdi', 'hveragerði']],
    [/hella\b/i, ['hella']],
  ];
  const liechtensteinCities: Array<[RegExp, string[]]> = [
    [/\bliechtenstein\b/i, ['liechtenstein']],
    [/vaduz/i, ['vaduz']],
    [/schaan/i, ['schaan']],
    [/triesen/i, ['triesen']],
    [/balzers/i, ['balzers']],
    [/eschen/i, ['eschen']],
    [/mauren/i, ['mauren']],
    [/triesenberg/i, ['triesenberg']],
    [/ruggell/i, ['ruggell']],
    [/gamprin/i, ['gamprin']],
    [/schellenberg/i, ['schellenberg']],
    [/planken/i, ['planken']],
    [/bendern/i, ['bendern']],
    [/nendeln/i, ['nendeln']],
  ];
  const andorraCities: Array<[RegExp, string[]]> = [
    [/\bandorra\b|\bandorre\b/i, ['andorra', 'andorre']],
    [/andorra\s*la\s*vella/i, ['andorra la vella']],
    [/escaldes(?:-engordany)?|engordany/i, ['escaldes', 'escaldes-engordany', 'engordany']],
    [/sant\s*juli[aà]\s*de\s*l[oò]ria|sant\s*julia\s*de\s*loria/i, [
      'sant julià de lòria',
      'sant julia de loria',
    ]],
    [/la\s*massana/i, ['la massana']],
    [/encamp/i, ['encamp']],
    [/canillo/i, ['canillo']],
    [/ordino/i, ['ordino']],
    [/santa\s*coloma/i, ['santa coloma']],
    [/pas\s*de\s*la\s*casa/i, ['pas de la casa']],
    [/arinsal/i, ['arinsal']],
    [/any[oó]s|anyos/i, ['anyós', 'anyos']],
  ];
  const monacoCities: Array<[RegExp, string[]]> = [
    [/\bmonaco\b|\bmonegasque\b|\bmonégasque\b/i, ['monaco']],
    [/monte[-\s]?carlo/i, ['monte-carlo', 'monte carlo']],
    [/fontvieille/i, ['fontvieille']],
    [/la\s*condamine|condamine/i, ['la condamine', 'condamine']],
    [/larvotto/i, ['larvotto']],
    [/monaco[-\s]?ville|le\s*rocher/i, ['monaco-ville', 'le rocher']],
    [/moneghetti/i, ['moneghetti']],
    [/jardin\s*exotique/i, ['jardin exotique']],
    [/la\s*rousse|saint[-\s]?roman/i, ['la rousse', 'saint roman']],
    [/port\s*hercule/i, ['port hercule']],
  ];
  const sanMarinoCities: Array<[RegExp, string[]]> = [
    [/\bsan\s*marino\b|\bsammarinese\b|\brsm\b/i, ['san marino']],
    [/citt[aà]\s*di\s*san\s*marino|citta\s*di\s*san\s*marino/i, ['citta di san marino', 'città di san marino']],
    [/borgo\s*maggiore/i, ['borgo maggiore']],
    [/serravalle/i, ['serravalle']],
    [/\bdogana\b/i, ['dogana']],
    [/domagnano/i, ['domagnano']],
    [/fiorentino/i, ['fiorentino']],
    [/acquaviva/i, ['acquaviva']],
    [/faetano/i, ['faetano']],
    [/chiesanuova/i, ['chiesanuova']],
    [/montegiardino/i, ['montegiardino']],
    [/galazzano/i, ['galazzano']],
  ];
  const vaticanCityCities: Array<[RegExp, string[]]> = [
    [/\bvatican\s*city\b|\bvatican\b|\bvatikan\b|\bvaticano\b/i, ['vatican city', 'vatican', 'vaticano']],
    [/citt[aà]\s*del\s*vaticano|citta\s*del\s*vaticano/i, ['citta del vaticano', 'città del vaticano']],
    [/stato\s*della\s*citt[aà]\s*del\s*vaticano|vatican\s*city\s*state/i, [
      'stato della citta del vaticano',
      'vatican city state',
    ]],
    [/vatikanstaten/i, ['vatikanstaten']],
  ];
  const moldovaCities: Array<[RegExp, string[]]> = [
    [/chi[șşs]in[aă]u|кишин[её]в|chisinau/i, ['chisinau', 'chișinău', 'кишинёв', 'кишинев']],
    [/b[aă]l[țt]i|бельцы|balti/i, ['balti', 'bălți', 'бельцы']],
    [/cahul/i, ['cahul']],
    [/ungheni/i, ['ungheni']],
    [/orhei/i, ['orhei']],
    [/soroca/i, ['soroca']],
    [/comrat|комрат/i, ['comrat', 'комрат']],
    [/c[aă]u[șşs]eni|causeni/i, ['causeni', 'căușeni']],
    [/h[iî]nce[șşs]ti|hincesti/i, ['hincesti', 'hîncești']],
    [/str[aă][șşs]eni|straseni/i, ['straseni', 'strășeni']],
    [/edine[țt]|edinet/i, ['edinet', 'edineț']],
    [/drochia/i, ['drochia']],
    [/tiraspol|тирасполь/i, ['tiraspol', 'тирасполь']],
    [/bender|tighina|бендеры/i, ['bender', 'tighina', 'бендеры']],
    [/r[iî]bni[țt]a|рыбница|ribnita/i, ['ribnita', 'rîbnița', 'рыбница']],
  ];
  const montenegroCities: Array<[RegExp, string[]]> = [
    [/podgorica|подгорица/i, ['podgorica', 'подгорица']],
    [/nik[šs]i[ćc]|никшић|niksic/i, ['niksic', 'nikšić', 'никшић']],
    [/budva|будва/i, ['budva', 'будва']],
    [/\bbar\b|бар\b/i, ['bar', 'бар']],
    [/herceg\s*novi|херцег\s*нови/i, ['herceg novi', 'херцег нови']],
    [/kotor|котор/i, ['kotor', 'котор']],
    [/tivat|тиват/i, ['tivat', 'тиват']],
    [/bijelo\s*polje|бијело\s*поље/i, ['bijelo polje', 'бијело поље']],
    [/berane|беране/i, ['berane', 'беране']],
    [/ulcinj|улцињ/i, ['ulcinj', 'улцињ']],
    [/cetinje|цетиње/i, ['cetinje', 'цетиње']],
    [/pljevlja|пљевља/i, ['pljevlja', 'пљевља']],
    [/ro[žz]aje|рожаје|rozaje/i, ['rozaje', 'rožaje', 'рожаје']],
  ];
  const northMacedoniaCities: Array<[RegExp, string[]]> = [
    [/skopje|скупје|shkup|shkupi|скопје/i, ['skopje', 'скопје', 'shkup', 'shkupi']],
    [/bitola|битола|manastir/i, ['bitola', 'битола']],
    [/kumanovo|куманово/i, ['kumanovo', 'куманово']],
    [/prilep|прилеп/i, ['prilep', 'прилеп']],
    [/tetovo|тетово|tetov[eë]/i, ['tetovo', 'тетово', 'tetove', 'tetovë']],
    [/ohrid|охрид/i, ['ohrid', 'охрид']],
    [/veles|велес/i, ['veles', 'велес']],
    [/[šs]tip|штип|stip/i, ['stip', 'štip', 'штип']],
    [/gostivar|гостивар/i, ['gostivar', 'гостивар']],
    [/strumica|струмица/i, ['strumica', 'струмица']],
    [/kavadarci|кавадарци/i, ['kavadarci', 'кавадарци']],
    [/ko[čc]ani|кочани|kocani/i, ['kocani', 'kočani', 'кочани']],
    [/ki[čc]evo|кичево|kicevo/i, ['kicevo', 'kičevo', 'кичево']],
    [/gevgelija|гевгелија/i, ['gevgelija', 'гевгелија']],
    [/debar|дебар/i, ['debar', 'дебар']],
    [/radovi[šs]|радовиш|radovis/i, ['radovis', 'radoviš', 'радовиш']],
  ];
  const albaniaCities: Array<[RegExp, string[]]> = [
    [/tirana|tiran[eë]|tirane/i, ['tirana', 'tiranë', 'tirane']],
    [/durr[eë]s|durres|durazzo/i, ['durres', 'durrës', 'durazzo']],
    [/vlor[eë]|vlore/i, ['vlore', 'vlorë']],
    [/shkod[eë]r|shkoder|scutari/i, ['shkoder', 'shkodër', 'scutari']],
    [/elbasan/i, ['elbasan']],
    [/fier/i, ['fier']],
    [/kor[çc][eë]|korce|coriza/i, ['korce', 'korçë', 'coriza']],
    [/berat/i, ['berat']],
    [/lushnj[eë]|lushnje/i, ['lushnje', 'lushnjë']],
    [/pogradec/i, ['pogradec']],
    [/kavaj[eë]|kavaje|golem/i, ['kavaje', 'kavajë', 'golem']],
    [/gjirokast[eë]r|gjirokaster/i, ['gjirokaster', 'gjirokastër']],
    [/sarand[eë]|sarande/i, ['sarande', 'sarandë']],
    [/lezh[eë]|lezhe/i, ['lezhe', 'lezhë']],
    [/kuk[eë]s|kukes/i, ['kukes', 'kukës']],
    [/peshkopi|dib[eë]r|diber/i, ['peshkopi', 'diber', 'dibër']],
    [/kam[eë]z|kamez/i, ['kamez', 'kamëz']],
    [/kruj[eë]|kruje/i, ['kruje', 'krujë']],
    [/konispol/i, ['konispol']],
    [/ksamil/i, ['ksamil']],
  ];
  const kosovoCities: Array<[RegExp, string[]]> = [
    [/prishtin[eë]|prishtina|pristina|pri[sš]tina|приштина/i, ['prishtina', 'prishtinë', 'pristina', 'priština']],
    [/fush[eë]\s*kosov[eë]|fushe\s*kosove|kosovo\s*polje/i, ['fushe kosove', 'fushë kosovë', 'kosovo polje']],
    [/prizren|prizreni/i, ['prizren', 'prizreni']],
    [/pej[eë]|peja|pe[cć]|pec/i, ['peja', 'pejë', 'peć', 'pec']],
    [/gjakov[eë]|gjakova|[dđ]akovica|djakovica/i, ['gjakove', 'gjakova', 'gjakovë', 'đakovica']],
    [/ferizaj|uro[sš]evac|urosevac/i, ['ferizaj', 'uroševac', 'urosevac']],
    [/gjilan|gnjilane/i, ['gjilan', 'gnjilane']],
    [/mitrovic[eë]|mitrovica|severna\s*mitrovica|north\s*mitrovica/i, ['mitrovica', 'mitrovicë', 'severna mitrovica']],
    [/vushtrri|vu[cč]itrn|vucitrn/i, ['vushtrri', 'vučitrn', 'vucitrn']],
    [/podujev[eë]|podujeva|besiana/i, ['podujeva', 'podujevë', 'besiana']],
    [/lipjan|lipljan/i, ['lipjan', 'lipljan']],
    [/drenas|gllogoc|glogovac/i, ['drenas', 'gllogoc', 'glogovac']],
    [/skenderaj|srbica/i, ['skenderaj', 'srbica']],
    [/rahovec|orahovac/i, ['rahovec', 'orahovac']],
    [/malishev[eë]|malisevo/i, ['malisheve', 'malishevë', 'malisevo']],
    [/suharek[eë]|suva\s*reka/i, ['suhareke', 'suharekë', 'suva reka']],
    [/ka[cç]anik|kacanik/i, ['kacanik', 'kaçanik']],
    [/hani\s*i\s*elezit|elez\s*han|general\s*jankovi[cć]/i, ['hani i elezit', 'elez han']],
    [/klin[eë]|klina/i, ['klina', 'klinë']],
    [/de[cç]an|decan|de[cč]ani/i, ['decan', 'deçan', 'dečani']],
    [/istog|istok/i, ['istog', 'istok']],
    [/dragash|draga[sš]/i, ['dragash', 'draš']],
    [/zve[cč]an|zvecan|zubin\s*potok/i, ['zvecan', 'zveçan', 'zubin potok']],
    [/leposavi[qć]|leposavic/i, ['leposaviq', 'leposavić', 'leposavic']],
  ];
  const serbiaCities: Array<[RegExp, string[]]> = [
    [/beograd|belgrade|београд/i, ['beograd', 'belgrade', 'београд']],
    [/novi\s*sad|нови\s*сад/i, ['novi sad', 'нови сад']],
    [/ni[sš]|nish|ниш/i, ['nis', 'niš', 'nish', 'ниш']],
    [/kragujevac|крагујеvac/i, ['kragujevac', 'крагујеvac']],
    [/subotica|суботица/i, ['subotica', 'суботица']],
    [/pan[cč]evo|pancevo|панчево/i, ['pancevo', 'pančevo', 'панчево']],
    [/ča[cč]ak|cacak|чаčak/i, ['cacak', 'čačak', 'чаčak']],
    [/kraljevo|краљево/i, ['kraljevo', 'краљево']],
    [/novi\s*pazar|нови\s*пазар/i, ['novi pazar', 'нови пазар']],
    [/kru[sš]evac|krusevac|крушевац/i, ['krusevac', 'kruševac', 'крушевац']],
    [/leskovac|лесковац/i, ['leskovac', 'лесковац']],
    [/u[zž]ice|uzice|ужице/i, ['uzice', 'užice', 'ужице']],
    [/zrenjanin|зрењанин/i, ['zrenjanin', 'зрењанин']],
    [/smederevo|сmederevo/i, ['smederevo', 'сmederevo']],
    [/valjevo|ваљево/i, ['valjevo', 'ваљево']],
    [/[sš]abac|sabac|шabac/i, ['sabac', 'šabac', 'шabac']],
    [/sombor|сombor/i, ['sombor', 'сombor']],
    [/vranje|вranje/i, ['vranje', 'вranje']],
    [/bujanovac|бујanovac/i, ['bujanovac', 'бујanovac']],
    [/pre[sš]evo|presevo|preshev[eë]|прешево/i, ['presevo', 'preševo', 'presheve', 'прешево']],
    [/pirot|пирот/i, ['pirot', 'пирот']],
    [/zaje[cč]ar|zajecar|зајечар/i, ['zajecar', 'zaječar', 'зајечар']],
    [/bor|бор/i, ['bor', 'бор']],
    [/po[zž]arevac|pozarevac|пожаревац/i, ['pozarevac', 'požarevac', 'пожаревац']],
    [/jagodina|јagodina/i, ['jagodina', 'јagodina']],
    [/para[cć]in|paracin/i, ['paracin', 'paraćin']],
    [/[cć]uprija|cuprija|ћuprija/i, ['cuprija', 'ćuprija', 'ћuprija']],
    [/loznica|лoznica/i, ['loznica', 'лoznica']],
    [/sremska\s*mitrovica|сremska\s*mitrovica/i, ['sremska mitrovica', 'сremska mitrovica']],
    [/vrbas|vrbas/i, ['vrbas']],
    [/kikinda|кikinda/i, ['kikinda', 'кikinda']],
    [/ruma|ruma/i, ['ruma']],
    [/in[dđ]ija|indjija|инђija/i, ['indjija', 'inđija', 'инђija']],
    [/ba[cč]ka\s*palanka|backa\s*palanka/i, ['backa palanka', 'bačka palanka']],
    [/vr[sš]ac|vrsac|вršac/i, ['vrsac', 'vršac', 'вršac']],
    [/zemun|зemun/i, ['zemun', 'зemun']],
    [/novi\s*beograd|new\s*belgrade/i, ['novi beograd', 'new belgrade']],
  ];
  const bosniaHerzegovinaCities: Array<[RegExp, string[]]> = [
    [/sarajevo|сарајево/i, ['sarajevo', 'сарајево']],
    [/banja\s*luka|banjaluka|бања\s*лука|бanja\s*луka/i, ['banja luka', 'banjaluka', 'бања лука']],
    [/tuzla|тузла/i, ['tuzla', 'тузла']],
    [/mostar|мостар/i, ['mostar', 'мостар']],
    [/zenica|зеница/i, ['zenica', 'зеница']],
    [/bijeljina|бијељина/i, ['bijeljina', 'бијељина']],
    [/biha[ćc]|bihac|биха[ćc]/i, ['bihac', 'bihać', 'бихаћ']],
    [/br[čc]ko|brcko|бр[čc]ко/i, ['brcko', 'brčko', 'брчко']],
    [/prijedor|пријedor/i, ['prijedor', 'пријedor']],
    [/doboj|дoboj|дobој/i, ['doboj', 'дoboj']],
    [/trebinje|требине/i, ['trebinje', 'требине']],
    [/istocno\s*sarajevo|istočno\s*sarajevo|источно\s*сарајево|east\s*sarajevo/i, [
      'istocno sarajevo',
      'istočno sarajevo',
      'источно сараjevo',
      'east sarajevo',
    ]],
    [/gora[žz]de|gorazde|goražde|гораžде/i, ['gorazde', 'goražde', 'гораžде']],
    [/travnik|тravnik/i, ['travnik', 'тravnik']],
    [/živinice|zivinice|živinice/i, ['zivinice', 'živinice']],
    [/gra[čc]anica|gracanica/i, ['gracanica', 'gračanica']],
    [/neum|неum/i, ['neum', 'неum']],
  ];
  // Greece — Greek + Latin aliases (search-only; stored Greek/Latin unchanged)
  const greekCities: Array<[RegExp, string[]]> = [
    [/αθήνα|\bathens\b|\bathina\b|\bathinai\b/i, ['athens', 'athina', 'αθήνα']],
    [/θεσσαλονίκη|\bthessaloniki\b|\bsalonika\b/i, [
      'thessaloniki',
      'θεσσαλονίκη',
      'salonika',
    ]],
    [/πάτρα|\bpatra\b|\bpatras\b/i, ['patra', 'patras', 'πάτρα']],
    [/ηράκλειο|\bheraklion\b|\biraklio\b|\birakleio\b/i, [
      'heraklion',
      'iraklio',
      'irakleio',
      'ηράκλειο',
    ]],
    [/λάρισα|\blarissa\b|\blarisa\b/i, ['larissa', 'larisa', 'λάρισα']],
    [/βόλος|\bvolos\b/i, ['volos', 'βόλος']],
    [/ιωάννινα|\bioannina\b|\byannina\b/i, ['ioannina', 'yannina', 'ιωάννινα']],
    [/χανιά|\bchania\b|\bhania\b/i, ['chania', 'hania', 'χανιά']],
    [/ρόδος|\brhodes\b|\brodos\b/i, ['rhodes', 'rodos', 'ρόδος']],
    [/καλαμάτα|\bkalamata\b/i, ['kalamata', 'καλαμάτα']],
  ];
  cityAliasTablesCache = {
    swedishCities,
    norwegianCities,
    germanCities,
    ukCities,
    dutchCities,
    frenchCities,
    spanishCities,
    italianCities,
    belgianCities,
    polishCities,
    austrianCities,
    swissCities,
    portugueseCities,
    irishCities,
    czechCities,
    hungarianCities,
    romanianCities,
    slovakCities,
    bulgarianCities,
    croatianCities,
    slovenianCities,
    lithuanianCities,
    latvianCities,
    estonianCities,
    luxembourgCities,
    maltaCities,
    ukrainianCities,
    belarusianCities,
    turkishCities,
    georgianCities,
    armenianCities,
    azerbaijaniCities,
    russianCities,
    cyprusCities,
    icelandCities,
    liechtensteinCities,
    andorraCities,
    monacoCities,
    sanMarinoCities,
    vaticanCityCities,
    moldovaCities,
    montenegroCities,
    northMacedoniaCities,
    albaniaCities,
    kosovoCities,
    serbiaCities,
    bosniaHerzegovinaCities,
    greekCities,
  };
  return cityAliasTablesCache;
}

function extractStreet(address?: string): string {
  if (!address?.trim()) {
    return '';
  }
  const first = address.split(',')[0]?.trim() ?? '';
  return first.replace(/^\d+\s*/, '').trim();
}

function extractArea(city?: string, address?: string, country?: string): string[] {
  const areas: string[] = [];
  const c = (city ?? '').toLowerCase();
  const addr = (address ?? '').toLowerCase();
  const placeBlob = `${c} ${addr}`;
  if (c.includes('københavn') || c.includes('kobenhavn')) {
    areas.push('københavn', 'kobenhavn', 'copenhagen', 'kbh');
  }
  if (
    /nørrebro|norrebro|noerrebro/.test(placeBlob)
  ) {
    areas.push('nørrebro', 'norrebro', 'noerrebro');
  }
  if (c.includes('øster') || c.includes('oster') || /østerbro|osterbro|oesterbro/.test(placeBlob)) {
    areas.push('østerbro', 'osterbro', 'oesterbro');
  }
  if (c.includes('amager') || addr.includes('amager')) {
    areas.push('amager');
  }
  if (c.includes('valby') || addr.includes('valby')) {
    areas.push('valby');
  }
  if (/vanløse|vanlose|vanloese/.test(placeBlob)) {
    areas.push('vanløse', 'vanlose', 'vanloese');
  }
  if (c.includes('frederiksberg') || addr.includes('frederiksberg')) {
    areas.push('frederiksberg', 'frb');
  }
  const {
    swedishCities,
    norwegianCities,
    germanCities,
    ukCities,
    dutchCities,
    frenchCities,
    spanishCities,
    italianCities,
    belgianCities,
    polishCities,
    austrianCities,
    swissCities,
    portugueseCities,
    irishCities,
    czechCities,
    hungarianCities,
    romanianCities,
    slovakCities,
    bulgarianCities,
    croatianCities,
    slovenianCities,
    lithuanianCities,
    latvianCities,
    estonianCities,
    luxembourgCities,
    maltaCities,
    ukrainianCities,
    belarusianCities,
    turkishCities,
    georgianCities,
    armenianCities,
    azerbaijaniCities,
    russianCities,
    cyprusCities,
    icelandCities,
    liechtensteinCities,
    andorraCities,
    monacoCities,
    sanMarinoCities,
    vaticanCityCities,
    moldovaCities,
    montenegroCities,
    northMacedoniaCities,
    albaniaCities,
    kosovoCities,
    serbiaCities,
    bosniaHerzegovinaCities,
    greekCities,
  } = loadCityAliasTables();
  const blob = `${city ?? ''} ${address ?? ''}`;
  if (isFranceCountry(country)) {
    for (const [re, aliases] of frenchCities) {
      if (re.test(blob)) {
        areas.push(...aliases);
      }
    }
  }
  if (isSpainCountry(country)) {
    for (const [re, aliases] of spanishCities) {
      if (re.test(blob)) {
        areas.push(...aliases);
      }
    }
  }
  if (isItalyCountry(country)) {
    for (const [re, aliases] of italianCities) {
      if (re.test(blob)) {
        areas.push(...aliases);
      }
    }
  }
  if (isBelgiumCountry(country)) {
    for (const [re, aliases] of belgianCities) {
      if (re.test(blob)) {
        areas.push(...aliases);
      }
    }
  }
  if (isPolandCountry(country)) {
    for (const [re, aliases] of polishCities) {
      if (re.test(blob)) {
        areas.push(...aliases);
      }
    }
  }
  if (isAustriaCountry(country)) {
    for (const [re, aliases] of austrianCities) {
      if (re.test(blob)) {
        areas.push(...aliases);
      }
    }
  }
  if (isSwitzerlandCountry(country)) {
    for (const [re, aliases] of swissCities) {
      if (re.test(blob)) {
        areas.push(...aliases);
      }
    }
  }
  if (isPortugalCountry(country)) {
    for (const [re, aliases] of portugueseCities) {
      if (re.test(blob)) {
        areas.push(...aliases);
      }
    }
  }
  if (isIrelandCountry(country)) {
    for (const [re, aliases] of irishCities) {
      if (re.test(blob)) {
        areas.push(...aliases);
      }
    }
  }
  if (isCzechiaCountry(country)) {
    for (const [re, aliases] of czechCities) {
      if (re.test(blob)) {
        areas.push(...aliases);
      }
    }
  }
  if (isHungaryCountry(country)) {
    for (const [re, aliases] of hungarianCities) {
      if (re.test(blob)) {
        areas.push(...aliases);
      }
    }
  }
  if (isRomaniaCountry(country)) {
    for (const [re, aliases] of romanianCities) {
      if (re.test(blob)) {
        areas.push(...aliases);
      }
    }
  }
  if (isSlovakiaCountry(country)) {
    for (const [re, aliases] of slovakCities) {
      if (re.test(blob)) {
        areas.push(...aliases);
      }
    }
  }
  if (isBulgariaCountry(country)) {
    for (const [re, aliases] of bulgarianCities) {
      if (re.test(blob)) {
        areas.push(...aliases);
      }
    }
  }
  if (isCroatiaCountry(country)) {
    for (const [re, aliases] of croatianCities) {
      if (re.test(blob)) {
        areas.push(...aliases);
      }
    }
  }
  if (isSloveniaCountry(country)) {
    for (const [re, aliases] of slovenianCities) {
      if (re.test(blob)) {
        areas.push(...aliases);
      }
    }
  }
  if (isLithuaniaCountry(country)) {
    for (const [re, aliases] of lithuanianCities) {
      if (re.test(blob)) {
        areas.push(...aliases);
      }
    }
  }
  if (isLatviaCountry(country)) {
    for (const [re, aliases] of latvianCities) {
      if (re.test(blob)) {
        areas.push(...aliases);
      }
    }
  }
  if (isEstoniaCountry(country)) {
    for (const [re, aliases] of estonianCities) {
      if (re.test(blob)) {
        areas.push(...aliases);
      }
    }
  }
  if (isLuxembourgCountry(country)) {
    for (const [re, aliases] of luxembourgCities) {
      if (re.test(blob)) {
        areas.push(...aliases);
      }
    }
  }
  if (isMaltaCountry(country)) {
    for (const [re, aliases] of maltaCities) {
      if (re.test(blob)) {
        areas.push(...aliases);
      }
    }
  }
  if (isUkraineCountry(country)) {
    for (const [re, aliases] of ukrainianCities) {
      if (re.test(blob)) {
        areas.push(...aliases);
      }
    }
  }
  if (isBelarusCountry(country)) {
    for (const [re, aliases] of belarusianCities) {
      if (re.test(blob)) {
        areas.push(...aliases);
      }
    }
  }
  if (isTurkeyCountry(country)) {
    for (const [re, aliases] of turkishCities) {
      if (re.test(blob)) {
        areas.push(...aliases);
      }
    }
  }
  if (isGeorgiaCountry(country)) {
    for (const [re, aliases] of georgianCities) {
      if (re.test(blob)) {
        areas.push(...aliases);
      }
    }
  }
  if (isArmeniaCountry(country)) {
    for (const [re, aliases] of armenianCities) {
      if (re.test(blob)) {
        areas.push(...aliases);
      }
    }
  }
  if (isAzerbaijanCountry(country)) {
    for (const [re, aliases] of azerbaijaniCities) {
      if (re.test(blob)) {
        areas.push(...aliases);
      }
    }
  }
  if (isRussiaCountry(country)) {
    for (const [re, aliases] of russianCities) {
      if (re.test(blob)) {
        areas.push(...aliases);
      }
    }
  }
  if (isCyprusCountry(country)) {
    for (const [re, aliases] of cyprusCities) {
      if (re.test(blob)) {
        areas.push(...aliases);
      }
    }
  }
  if (isIcelandCountry(country)) {
    for (const [re, aliases] of icelandCities) {
      if (re.test(blob)) {
        areas.push(...aliases);
      }
    }
  }
  if (isLiechtensteinCountry(country)) {
    for (const [re, aliases] of liechtensteinCities) {
      if (re.test(blob)) {
        areas.push(...aliases);
      }
    }
  }
  if (isAndorraCountry(country)) {
    for (const [re, aliases] of andorraCities) {
      if (re.test(blob)) {
        areas.push(...aliases);
      }
    }
  }
  if (isMonacoCountry(country)) {
    for (const [re, aliases] of monacoCities) {
      if (re.test(blob)) {
        areas.push(...aliases);
      }
    }
  }
  if (isSanMarinoCountry(country)) {
    for (const [re, aliases] of sanMarinoCities) {
      if (re.test(blob)) {
        areas.push(...aliases);
      }
    }
  }
  if (isVaticanCityCountry(country)) {
    for (const [re, aliases] of vaticanCityCities) {
      if (re.test(blob)) {
        areas.push(...aliases);
      }
    }
  }
  if (isMoldovaCountry(country)) {
    for (const [re, aliases] of moldovaCities) {
      if (re.test(blob)) {
        areas.push(...aliases);
      }
    }
  }
  if (isMontenegroCountry(country)) {
    for (const [re, aliases] of montenegroCities) {
      if (re.test(blob)) {
        areas.push(...aliases);
      }
    }
  }
  if (isNorthMacedoniaCountry(country)) {
    for (const [re, aliases] of northMacedoniaCities) {
      if (re.test(blob)) {
        areas.push(...aliases);
      }
    }
  }
  if (isBosniaHerzegovinaCountry(country)) {
    for (const [re, aliases] of bosniaHerzegovinaCities) {
      if (re.test(blob)) {
        areas.push(...aliases);
      }
    }
  }
  if (isAlbaniaCountry(country)) {
    for (const [re, aliases] of albaniaCities) {
      if (re.test(blob)) {
        areas.push(...aliases);
      }
    }
  }
  if (isKosovoCountry(country)) {
    for (const [re, aliases] of kosovoCities) {
      if (re.test(blob)) {
        areas.push(...aliases);
      }
    }
  }
  if (isSerbiaCountry(country)) {
    for (const [re, aliases] of serbiaCities) {
      if (re.test(blob)) {
        areas.push(...aliases);
      }
    }
  }
  if (isGreeceCountry(country)) {
    for (const [re, aliases] of greekCities) {
      if (re.test(blob)) {
        areas.push(...aliases);
      }
    }
  }
  if (isSwedenCountry(country)) {
    for (const [re, aliases] of swedishCities) {
      if (re.test(blob)) {
        areas.push(...aliases);
      }
    }
  }
  if (isNorwayCountry(country)) {
    for (const [re, aliases] of norwegianCities) {
      if (re.test(blob)) {
        areas.push(...aliases);
      }
    }
  }
  if (isGermanyCountry(country)) {
    for (const [re, aliases] of germanCities) {
      if (re.test(blob)) {
        areas.push(...aliases);
      }
    }
  }
  if (isUnitedKingdomCountry(country)) {
    for (const [re, aliases] of ukCities) {
      if (re.test(blob)) {
        areas.push(...aliases);
      }
    }
  }
  if (isNetherlandsCountry(country)) {
    for (const [re, aliases] of dutchCities) {
      if (re.test(blob)) {
        areas.push(...aliases);
      }
    }
  }
  for (const token of ['nørrelund', 'norrelund', 'fasanvej', 'gothersgade', 'portugalsgade', 'nørrebrogade', 'norrebrogade', 'noerrebrogade']) {
    if (addr.includes(token.replace('ø', 'o')) || addr.includes(token) || addr.includes(token.replace('ø', 'oe'))) {
      areas.push(token);
    }
  }
  return areas;
}

function buildKeywords(gym: DanishGym): string[] {
  const parts: string[] = [];
  const display = formatGymDisplayName(gym);
  const rawBrand = (gym.brand ?? '').trim();
  const brandNorm = normalizeGymBrand(gym.brand);
  parts.push(gym.name, display, rawBrand, brandNorm);
  if (gym.city) {
    parts.push(gym.city);
  }
  if (gym.address) {
    parts.push(gym.address);
  }
  if (gym.postalCode) {
    parts.push(gym.postalCode);
  }
  parts.push(gym.region);
  if (gym.country) {
    parts.push(gym.country);
  }
  if (isGermanyCountry(gym.country)) {
    parts.push('Germany', 'Deutschland', 'Tyskland');
  }
  if (isUnitedKingdomCountry(gym.country)) {
    parts.push(
      'United Kingdom',
      'UK',
      'Great Britain',
      'Storbritannien',
      'Storbritannia',
    );
  }
  if (isFinlandCountry(gym.country)) {
    parts.push('Finland', 'Suomi', 'Finnland');
  }
  if (isNetherlandsCountry(gym.country)) {
    parts.push('Netherlands', 'Nederland', 'Holland');
  }
  if (isFranceCountry(gym.country)) {
    parts.push('France', 'Frankrig', 'Frankrike');
  }
  if (isSpainCountry(gym.country)) {
    parts.push('Spain', 'Spanien', 'Spania', 'España');
  }
  if (isItalyCountry(gym.country)) {
    parts.push('Italy', 'Italia', 'Italien');
  }
  if (isBelgiumCountry(gym.country)) {
    parts.push('Belgium', 'Belgique', 'België', 'Belgie', 'Belgien', 'Belgia');
  }
  if (isPolandCountry(gym.country)) {
    parts.push('Poland', 'Polska', 'Polen');
  }
  if (isAustriaCountry(gym.country)) {
    parts.push('Austria', 'Österreich', 'Oesterreich', 'Osterreich');
  }
  if (isSwitzerlandCountry(gym.country)) {
    parts.push('Switzerland', 'Schweiz', 'Suisse', 'Svizzera');
  }
  if (isPortugalCountry(gym.country)) {
    parts.push('Portugal');
  }
  if (isIrelandCountry(gym.country)) {
    parts.push('Ireland', 'Éire', 'Eire');
  }
  if (isCzechiaCountry(gym.country)) {
    parts.push('Czechia', 'Czech Republic', 'Česko', 'Cesko');
  }
  if (isHungaryCountry(gym.country)) {
    parts.push('Hungary', 'Magyarország', 'Magyarorszag');
  }
  if (isGreeceCountry(gym.country)) {
    parts.push('Greece', 'Hellas', 'Ελλάδα');
  }
  if (isRomaniaCountry(gym.country)) {
    parts.push('Romania', 'România', 'Romania');
  }
  if (isSlovakiaCountry(gym.country)) {
    parts.push('Slovakia', 'Slovensko', 'Slovak Republic');
  }
  if (isBulgariaCountry(gym.country)) {
    parts.push('Bulgaria', 'България', 'Bulgariya');
  }
  if (isCroatiaCountry(gym.country)) {
    parts.push('Croatia', 'Hrvatska');
  }
  if (isSloveniaCountry(gym.country)) {
    parts.push('Slovenia', 'Slovenija');
  }
  if (isLithuaniaCountry(gym.country)) {
    parts.push('Lithuania', 'Lietuva');
  }
  if (isLatviaCountry(gym.country)) {
    parts.push('Latvia', 'Latvija');
  }
  if (isEstoniaCountry(gym.country)) {
    parts.push('Estonia', 'Eesti');
  }
  if (isLuxembourgCountry(gym.country)) {
    parts.push('Luxembourg', 'Luxemburg', 'Lëtzebuerg');
  }
  if (isMaltaCountry(gym.country)) {
    parts.push('Malta', 'Gozo', 'Maltese Islands');
  }
  if (isUkraineCountry(gym.country)) {
    parts.push('Ukraine', 'Україна', 'Ukraina');
  }
  if (isBelarusCountry(gym.country)) {
    parts.push('Belarus', 'Беларусь', 'Bielarus');
  }
  if (isTurkeyCountry(gym.country)) {
    parts.push('Turkey', 'Türkiye', 'Turkiye');
  }
  if (isGeorgiaCountry(gym.country)) {
    parts.push('Georgia', 'Sakartvelo', 'საქართველო');
  }
  if (isArmeniaCountry(gym.country)) {
    parts.push('Armenia', 'Hayastan', 'Հայաստան');
  }
  if (isAzerbaijanCountry(gym.country)) {
    parts.push('Azerbaijan', 'Azərbaycan', 'Azerbaycan');
  }
  if (isRussiaCountry(gym.country)) {
    parts.push('Russia', 'Rossiya', 'Россия');
  }
  if (isCyprusCountry(gym.country)) {
    parts.push('Cyprus', 'Kypros', 'Republic of Cyprus');
  }
  if (isIcelandCountry(gym.country)) {
    parts.push('Iceland', 'Island', 'Ísland');
  }
  if (isLiechtensteinCountry(gym.country)) {
    parts.push('Liechtenstein', 'LI');
  }
  if (isAndorraCountry(gym.country)) {
    parts.push('Andorra', 'AD', 'Andorre', 'Principat d\'Andorra');
  }
  if (isMonacoCountry(gym.country)) {
    parts.push('Monaco', 'MC', 'Monte-Carlo', 'Monte Carlo', 'Principauté de Monaco');
  }
  if (isSanMarinoCountry(gym.country)) {
    parts.push(
      'San Marino',
      'SM',
      'RSM',
      'Repubblica di San Marino',
      'Città di San Marino',
      'Citta di San Marino',
    );
  }
  if (isVaticanCityCountry(gym.country)) {
    parts.push(
      'Vatican City',
      'Vatican',
      'Vatican City State',
      'State of Vatican City',
      'Città del Vaticano',
      'Citta del Vaticano',
      'Stato della Città del Vaticano',
      'Stato della Citta del Vaticano',
      'Vatikanstaten',
      'VA',
      'VAT',
    );
  }
  if (isMoldovaCountry(gym.country)) {
    parts.push(
      'Moldova',
      'MD',
      'Republic of Moldova',
      'Republica Moldova',
      'Moldavien',
      'Moldavia',
      'Moldawien',
      'Молдова',
      'Республика Молдова',
    );
  }
  if (isMontenegroCountry(gym.country)) {
    parts.push(
      'Montenegro',
      'ME',
      'Crna Gora',
      'Crnagora',
      'Republic of Montenegro',
      'Republika Crna Gora',
      'Черногория',
      'Црна Гора',
    );
  }
  if (isNorthMacedoniaCountry(gym.country)) {
    parts.push(
      'North Macedonia',
      'MK',
      'MKD',
      'Republic of North Macedonia',
      'Северна Македонија',
      'Македонија',
      'Severna Makedonija',
      'Makedonija',
      'Nordmakedonien',
      'Macedonia',
      'FYROM',
    );
  }
  if (isBosniaHerzegovinaCountry(gym.country)) {
    parts.push(
      'Bosnia and Herzegovina',
      'Bosnia & Herzegovina',
      'Bosnia-Herzegovina',
      'Bosnia',
      'BA',
      'BiH',
      'BIH',
      'Bosna i Hercegovina',
      'Bosna',
      'Босна и Херцеговина',
      'БиХ',
      'Federation of Bosnia and Herzegovina',
      'Republika Srpska',
      'Brčko District',
    );
  }
  if (isAlbaniaCountry(gym.country)) {
    parts.push(
      'Albania',
      'AL',
      'ALB',
      'Republic of Albania',
      'Shqipëri',
      'Shqiperia',
      'Shqipëria',
      'Republika e Shqipërisë',
      'Shqipni',
      'Albanien',
      'palestër',
      'palester',
      'qendër fitnessi',
      'qender fitnessi',
    );
  }
  if (isKosovoCountry(gym.country)) {
    parts.push(
      'Kosovo',
      'XK',
      'Kosova',
      'Kosovë',
      'Kosove',
      'Republika e Kosovës',
      'Republika e Kosoves',
      'Republic of Kosovo',
      'Косово',
      'palestër',
      'palester',
      'qendër fitnessi',
      'qender fitnessi',
      'teretana',
      'fitness centar',
      'фитнес',
      'теретана',
    );
  }
  if (isSerbiaCountry(gym.country)) {
    parts.push(
      'Serbia',
      'RS',
      'Srbija',
      'Republika Srbija',
      'Republic of Serbia',
      'Србија',
      'Република Србија',
      'teretana',
      'теретана',
      'fitness centar',
      'fitnes centar',
      'фитнес',
      'фитнес центар',
      'članarina',
      'clanarina',
      'чланарина',
    );
  }

  const street = extractStreet(gym.address);
  if (street) {
    parts.push(street);
  }

  const brandKey = normalizeGymSearchValue(rawBrand || brandNorm);
  const aliases = CHAIN_ALIASES[brandKey] ?? CHAIN_ALIASES[brandKey.replace(/\s+/g, '')] ?? [];
  parts.push(...aliases);
  parts.push(...extractArea(gym.city, gym.address, gym.country));

  const nameParts = gym.name.split(/[—–\-|]/).map(s => s.trim()).filter(Boolean);
  parts.push(...nameParts);

  return parts;
}

function foldSearch(value: string): string {
  return foldNordicSearchEquivalents(value);
}

export function buildGymSearchEntry(gym: DanishGym): GymSearchIndexEntry {
  const keywords = buildKeywords(gym);
  const haystackRaw = keywords.join(' ');
  const haystack = foldSearch(normalizeGymSearchValue(haystackRaw));
  const postalNorm = foldSearch(normalizeGymSearchValue(gym.postalCode ?? ''));

  return {
    gym,
    nameNorm: foldSearch(normalizeGymSearchValue(gym.name)),
    nameCompact: foldSearch(compactGymSearchValue(gym.name)),
    brandNorm: foldSearch(normalizeGymSearchValue(gym.brand ?? '')),
    brandCompact: foldSearch(compactGymSearchValue(gym.brand ?? '')),
    cityNorm: foldSearch(normalizeGymSearchValue(gym.city ?? '')),
    streetNorm: foldSearch(normalizeGymSearchValue(extractStreet(gym.address))),
    addressNorm: foldSearch(normalizeGymSearchValue(gym.address ?? '')),
    regionNorm: foldSearch(normalizeGymSearchValue(gym.region ?? '')),
    postalNorm,
    postalCompact: postalNorm.replace(/\s+/g, ''),
    haystack,
    haystackCompact: foldSearch(compactGymSearchValue(haystackRaw)),
    words: haystack.split(' ').filter(w => w.length >= 2),
  };
}

let cachedIndex: GymSearchIndexEntry[] | null = null;
let cachedSourceRef: readonly DanishGym[] | null = null;
let cachedWordIndex: Map<string, number[]> | null = null;
let cachedPrefix4: Map<string, number[]> | null = null;
let cachedPrefix6: Map<string, number[]> | null = null;
let warmToken = 0;

/** Test / HMR helper — rebuild index after search keyword changes. */
export function clearGymSearchIndexCache(): void {
  cachedIndex = null;
  cachedSourceRef = null;
  cachedWordIndex = null;
  cachedPrefix4 = null;
  cachedPrefix6 = null;
  warmToken += 1;
}

function buildWordIndex(index: GymSearchIndexEntry[]): Map<string, number[]> {
  const wordIndex = new Map<string, number[]>();
  for (let i = 0; i < index.length; i++) {
    for (const word of index[i].words) {
      if (word.length < 3) {
        continue;
      }
      const bucket = wordIndex.get(word);
      if (bucket) {
        bucket.push(i);
      } else {
        wordIndex.set(word, [i]);
      }
    }
  }
  return wordIndex;
}

function buildPrefix(
  index: GymSearchIndexEntry[],
  width: number,
): Map<string, number[]> {
  const prefix = new Map<string, number[]>();
  for (let i = 0; i < index.length; i++) {
    const seen = new Set<string>();
    for (const word of index[i].words) {
      if (word.length < width) {
        continue;
      }
      const key = word.slice(0, width);
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      const bucket = prefix.get(key);
      if (bucket) {
        bucket.push(i);
      } else {
        prefix.set(key, [i]);
      }
    }
  }
  return prefix;
}

function commitGymSearchIndex(
  source: readonly DanishGym[],
  index: GymSearchIndexEntry[],
): void {
  cachedIndex = index;
  cachedSourceRef = source;
  cachedWordIndex = buildWordIndex(index);
  cachedPrefix4 = buildPrefix(index, 4);
  cachedPrefix6 = buildPrefix(index, 6);
}

export function getGymSearchIndex(gyms?: DanishGym[]): GymSearchIndexEntry[] {
  const source = gyms ?? getActiveDanishGyms();
  if (cachedIndex && cachedSourceRef === source) {
    return cachedIndex;
  }
  const index = source.map(buildGymSearchEntry);
  commitGymSearchIndex(source, index);
  return index;
}

/**
 * Build the search index in slices so opening a gym picker does not freeze
 * the JS thread for the whole catalog. A search that arrives first still
 * builds synchronously and this warmup will not overwrite that result.
 */
export function scheduleGymSearchWarmup(gyms?: DanishGym[]): void {
  if (gyms && gyms.length === 0) {
    return;
  }
  const source = gyms ?? getActiveDanishGyms();
  if (cachedIndex && cachedSourceRef === source) {
    return;
  }
  const token = ++warmToken;
  const built: GymSearchIndexEntry[] = new Array(source.length);
  let cursor = 0;
  const step = () => {
    if (token !== warmToken) {
      return;
    }
    if (cachedIndex && cachedSourceRef === source) {
      return;
    }
    // Small slices so splash timers and taps can run between chunks.
    // 700-center slices held the thread for a large fraction of the ~1s index build.
    const end = Math.min(cursor + 48, source.length);
    for (; cursor < end; cursor++) {
      built[cursor] = buildGymSearchEntry(source[cursor]);
    }
    if (cursor < source.length) {
      setTimeout(step, 0);
      return;
    }
    setTimeout(() => {
      if (token !== warmToken) {
        return;
      }
      if (cachedIndex && cachedSourceRef === source) {
        return;
      }
      commitGymSearchIndex(source, built);
    }, 0);
  };
  setTimeout(step, 0);
}

/** Folded word → entry indexes. Typo lookup probes this instead of every center. */
export function getGymSearchWordIndex(gyms?: DanishGym[]): Map<string, number[]> {
  getGymSearchIndex(gyms);
  return cachedWordIndex ?? new Map();
}

/**
 * First 6 folded characters of each word → entry indexes.
 * Long queries use the smallest bucket as a candidate shortlist.
 */
export function getGymSearchPrefix6(gyms?: DanishGym[]): Map<string, number[]> {
  getGymSearchIndex(gyms);
  return cachedPrefix6 ?? new Map();
}

/** First 4 folded characters of each word → entry indexes. */
export function getGymSearchPrefix4(gyms?: DanishGym[]): Map<string, number[]> {
  getGymSearchIndex(gyms);
  return cachedPrefix4 ?? new Map();
}
