/**
 * Structured Panchangam values and rule evaluation.
 *
 * The public.pooja_days table stores free-text tithi / paksha / nakshatra
 * (whatever the source provider returned). Scheduling must never depend on that
 * free text directly, so every value is first mapped to a canonical id here.
 * If a value cannot be mapped to exactly ONE canonical id it is "unknown", and a
 * rule that needs it can never produce a valid booking date.
 */

export const TITHIS = [
  "pratipada",
  "dwitiya",
  "tritiya",
  "chaturthi",
  "panchami",
  "shashthi",
  "saptami",
  "ashtami",
  "navami",
  "dashami",
  "ekadashi",
  "dwadashi",
  "trayodashi",
  "chaturdashi",
  "purnima",
  "amavasya",
] as const;
export type Tithi = (typeof TITHIS)[number];

export const NAKSHATRAS = [
  "ashwini",
  "bharani",
  "krittika",
  "rohini",
  "mrigashira",
  "ardra",
  "punarvasu",
  "pushya",
  "ashlesha",
  "magha",
  "purva_phalguni",
  "uttara_phalguni",
  "hasta",
  "chitra",
  "swati",
  "vishakha",
  "anuradha",
  "jyeshtha",
  "mula",
  "purva_ashadha",
  "uttara_ashadha",
  "shravana",
  "dhanishta",
  "shatabhisha",
  "purva_bhadrapada",
  "uttara_bhadrapada",
  "revati",
] as const;
export type Nakshatra = (typeof NAKSHATRAS)[number];

export type Paksha = "shukla" | "krishna";

// Spelling variants seen in Sanskrit, Tamil-transliterated and English sources.
const TITHI_ALIASES: Record<Tithi, string[]> = {
  pratipada: ["pratipada", "prathama", "pratipat", "padyami", "pirathamai"],
  dwitiya: [
    "dwitiya",
    "dvitiya",
    "dwiteeya",
    "vidiya",
    "thithiyai",
    "dwithiya",
  ],
  tritiya: ["tritiya", "trithiya", "thritiya", "tritheeyai", "thiruthiyai"],
  chaturthi: ["chaturthi", "chathurthi", "sathurthi", "chaturti", "chathurthy"],
  panchami: ["panchami", "panchmi", "panjami"],
  shashthi: ["shashthi", "shasthi", "sashti", "shashti", "shasti", "shashtee"],
  saptami: ["saptami", "sapthami", "sapthmi"],
  ashtami: ["ashtami", "asthami", "ashtmi", "astami"],
  navami: ["navami", "navmi"],
  dashami: ["dashami", "dasami", "dasmi"],
  ekadashi: ["ekadashi", "ekadasi", "egadasi"],
  dwadashi: ["dwadashi", "dvadashi", "dwadasi", "dvadasi", "thuvadasi"],
  trayodashi: ["trayodashi", "trayodasi", "thirayodasi", "thrayodashi"],
  chaturdashi: ["chaturdashi", "chaturdasi", "chathurdasi", "chathurdashi"],
  purnima: [
    "purnima",
    "pournami",
    "poornima",
    "pournima",
    "pournamasi",
    "pooranai",
    "fullmoon",
    "purnami",
  ],
  amavasya: [
    "amavasya",
    "amavasai",
    "amavasi",
    "amavasyai",
    "newmoon",
    "amavas",
  ],
};

const NAKSHATRA_ALIASES: Record<Nakshatra, string[]> = {
  ashwini: ["ashwini", "aswini", "asvini", "ashvini"],
  bharani: ["bharani", "barani"],
  krittika: [
    "krittika",
    "krithika",
    "kritika",
    "karthigai",
    "krithigai",
    "kartika",
    "karthika",
  ],
  rohini: ["rohini", "rogini"],
  mrigashira: [
    "mrigashira",
    "mrigashirsha",
    "mrigasira",
    "mrigasheersha",
    "mirugasirisham",
    "makayiram",
    "mrigashirsa",
  ],
  ardra: ["ardra", "arudra", "thiruvadhirai", "thiruvathirai", "aardra"],
  punarvasu: ["punarvasu", "punarpoosam", "punarpusam", "punarvas"],
  pushya: ["pushya", "pusya", "poosam", "pooshyam", "pushyami", "pushyam"],
  ashlesha: ["ashlesha", "aslesha", "ayilyam", "ashlesa", "aayilyam"],
  magha: ["magha", "makam", "magam", "maghaa"],
  purva_phalguni: [
    "purvaphalguni",
    "purvaphalgunee",
    "pooram",
    "poorvaphalguni",
    "purvaphalgun",
    "purvaphalguna",
  ],
  uttara_phalguni: [
    "uttaraphalguni",
    "uttaraphalgunee",
    "uthiram",
    "uttaraphalgun",
    "uttaraphalguna",
  ],
  hasta: ["hasta", "hastham", "atham", "hastha"],
  chitra: ["chitra", "chithirai", "chitta", "chithra"],
  swati: ["swati", "swathi", "svati", "swaati"],
  vishakha: [
    "vishakha",
    "visakha",
    "visakam",
    "vishagam",
    "vishaakha",
    "vishakam",
  ],
  anuradha: ["anuradha", "anusham", "anuradhaa", "anuraadha"],
  jyeshtha: ["jyeshtha", "jyestha", "jyeshta", "kettai", "kaettai", "jyeshtaa"],
  mula: ["mula", "moola", "moolam", "mulam"],
  purva_ashadha: [
    "purvaashadha",
    "purvashadha",
    "pooradam",
    "purvashada",
    "purvaashada",
  ],
  uttara_ashadha: [
    "uttaraashadha",
    "uttarashadha",
    "uthiradam",
    "uttarashada",
    "uttaraashada",
  ],
  shravana: [
    "shravana",
    "sravana",
    "thiruvonam",
    "shravanam",
    "shravan",
    "tiruvonam",
  ],
  dhanishta: ["dhanishta", "dhanishtha", "avittam", "dhanista", "dhanishtaa"],
  shatabhisha: [
    "shatabhisha",
    "satabhisha",
    "sadayam",
    "shatabhishak",
    "shatabisha",
    "satabhishak",
  ],
  purva_bhadrapada: [
    "purvabhadrapada",
    "purvabhadra",
    "poorattadhi",
    "purvaproshthapada",
    "purvabhadrapad",
  ],
  uttara_bhadrapada: [
    "uttarabhadrapada",
    "uttarabhadra",
    "uthirattadhi",
    "uttaraproshthapada",
    "uttarabhadrapad",
  ],
  revati: ["revati", "revathi", "revathy"],
};

const SHUKLA_WORDS = new Set([
  "shukla",
  "sukla",
  "shukl",
  "valarpirai",
  "waxing",
  "bright",
]);
const KRISHNA_WORDS = new Set([
  "krishna",
  "krsna",
  "krishn",
  "theipirai",
  "waning",
  "dark",
  "krishnapaksha",
]);

const lettersOnly = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
const words = (s: string) =>
  s
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter(Boolean);

function invert<T extends string>(table: Record<T, string[]>): Map<string, T> {
  const m = new Map<string, T>();
  for (const [id, aliases] of Object.entries(table) as [T, string[]][]) {
    for (const a of aliases) m.set(a, id);
  }
  return m;
}
const TITHI_LOOKUP = invert(TITHI_ALIASES);
const NAKSHATRA_LOOKUP = invert(NAKSHATRA_ALIASES);

/** Canonical tithi, or null if the text names none or more than one. */
export function canonTithi(text: string | null | undefined): Tithi | null {
  const w = words(String(text ?? ""));
  const found = new Set<Tithi>();
  for (let i = 0; i < w.length; i++) {
    const one = TITHI_LOOKUP.get(w[i]);
    if (one) found.add(one);
    const two =
      i + 1 < w.length ? TITHI_LOOKUP.get(w[i] + w[i + 1]) : undefined; // "full moon", "new moon"
    if (two) found.add(two);
  }
  return found.size === 1 ? [...found][0] : null;
}

/** Canonical paksha, or null if absent or contradictory. */
export function canonPaksha(text: string | null | undefined): Paksha | null {
  const w = words(String(text ?? ""));
  const shukla = w.some((x) => SHUKLA_WORDS.has(x));
  const krishna = w.some((x) => KRISHNA_WORDS.has(x));
  if (shukla === krishna) return null; // neither, or both
  return shukla ? "shukla" : "krishna";
}

/**
 * Canonical nakshatra. A text naming two different nakshatras (the star changes
 * during the day, e.g. "Ardra / Punarvasu") is ambiguous and yields null.
 */
export function canonNakshatra(
  text: string | null | undefined,
): Nakshatra | null {
  const cleaned = String(text ?? "")
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ");
  const parts = cleaned
    .split(/[,/&;|]|\band\b|\bthen\b|\bto\b|\buntil\b|->/)
    .map(lettersOnly)
    .filter(Boolean);
  if (parts.length === 0) return null;
  const found = new Set<Nakshatra>();
  for (const p of parts) {
    const id = NAKSHATRA_LOOKUP.get(p);
    if (!id) return null; // an unrecognised part makes the whole value unreliable
    found.add(id);
  }
  return found.size === 1 ? [...found][0] : null;
}

export interface PanchangamText {
  tithi: string | null | undefined;
  paksha: string | null | undefined;
  nakshatra: string | null | undefined;
}

export interface NormalisedPanchangam {
  tithi: Tithi | null;
  paksha: Paksha | null;
  nakshatra: Nakshatra | null;
}

/**
 * Maps one day's free-text Panchangam to canonical values. Contradictions
 * (paksha column vs. paksha in the tithi text, or a Purnima marked Krishna)
 * make the affected values unknown rather than guessing.
 */
export function normalisePanchangam(p: PanchangamText): NormalisedPanchangam {
  let tithi = canonTithi(p.tithi);
  const fromColumn = canonPaksha(p.paksha);
  const fromTithiText = canonPaksha(p.tithi);
  let paksha: Paksha | null = fromColumn ?? fromTithiText;
  if (fromColumn && fromTithiText && fromColumn !== fromTithiText)
    paksha = null;

  // Purnima is always Shukla and Amavasya always Krishna.
  const implied: Paksha | null =
    tithi === "purnima" ? "shukla" : tithi === "amavasya" ? "krishna" : null;
  if (implied) {
    if (paksha && paksha !== implied) {
      // The row contradicts itself: trust neither value.
      tithi = null;
      paksha = null;
    } else {
      paksha = implied;
    }
  }
  return { tithi, paksha, nakshatra: canonNakshatra(p.nakshatra) };
}

// ---- rules -------------------------------------------------------------------
export interface PanchangamRule {
  tithis: readonly string[] | null;
  paksha: Paksha | null;
  nakshatras: readonly string[] | null;
}

export type RuleResult = "match" | "no_match" | "unknown";

/**
 * All conditions present in a rule must hold (AND). A condition that cannot be
 * decided because the day's value is unknown makes the rule "unknown" unless
 * another condition already definitely fails.
 */
export function evaluateRule(
  rule: PanchangamRule,
  day: NormalisedPanchangam,
): RuleResult {
  let unknown = false;
  const check = (needed: readonly string[] | null, actual: string | null) => {
    if (!needed || needed.length === 0) return true;
    if (actual === null) {
      unknown = true;
      return true;
    }
    return needed.includes(actual);
  };
  const ok =
    check(rule.tithis, day.tithi) &&
    check(rule.paksha ? [rule.paksha] : null, day.paksha) &&
    check(rule.nakshatras, day.nakshatra);
  if (!ok) return "no_match";
  return unknown ? "unknown" : "match";
}

/** Combines several rules for one pooja (OR): any match wins, else unknown if any is unknown. */
export function evaluateRules(
  rules: readonly PanchangamRule[],
  day: NormalisedPanchangam,
): RuleResult {
  let unknown = false;
  for (const r of rules) {
    const res = evaluateRule(r, day);
    if (res === "match") return "match";
    if (res === "unknown") unknown = true;
  }
  return unknown ? "unknown" : "no_match";
}
