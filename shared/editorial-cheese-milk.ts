export const cheeseMilkLabels = {
  cow: 'коровье', goat: 'козье', sheep: 'овечье', donkey: 'ослиное', mare: 'кобылье', buffalo: 'буйволиное',
} as const;
export type CheeseMilk = keyof typeof cheeseMilkLabels;
export type CheeseMilkResult =
  | { status: 'known'; types: CheeseMilk[] }
  | { status: 'unknown' | 'review'; types: [] };

const animals: Record<CheeseMilk, string> = {
  cow: 'коров(?:ь[а-я]+|а|ы|е|ов|ами)?|cows?|vacc[ae]|mucc[ae]|vaccino|bovino',
  goat: 'коз(?:ь[а-я]+|а|ы|е|ами)?|goats?|capr[ae]|caprino',
  sheep: 'овеч[а-я]+|ов(?:ца|цы|ец|цами)|sheep|ewes?|pecor[ae]|ovino',
  donkey: 'ослин[а-я]+|осл(?:а|ов|иц[а-я]*)|ослиц[а-я]*|оси[н][а-я]+|donkeys?|asin[aoe]|asinino',
  mare: 'кобыл[а-я]+|лошадин[а-я]+|лошад(?:и|ей)|mares?|cavall[ae]|equino',
  buffalo: 'буйвол[а-я]+|buffalo(?:es|s)?|bufal[ae]|bufalino',
};
const animal = `(?:${Object.values(animals).join('|')})`;
const separator = '(?:\\s*(?:,\\s*(?:и\\s+|and\\s+|e\\s+)?|[/+]\\s*)|\\s+(?:и|and|e)\\s+)';
const qualifiers = '(?:(?:сыр[а-я]+|цельн[а-я]+|свеж[а-я]+|пастеризован[а-я]+|непастеризован[а-я]+|обезжир[а-я]+|нормализован[а-я]+|raw|whole|fresh|pasteuri[sz]ed|crudo|intero|fresco|pastorizzato)\\s+){0,3}';
const milk = '(?:молок(?:о|а|у|ом|е)|milk|latte)';
const milkWord = new RegExp(milk);
const pre = `${qualifiers}${animal}(?:['’]s)?(?:\\s*['’])?`;
const post = `(?:(?:из|of|di|d['’])\\s*)?(?:местн[а-я]+\\s+)?${animal}`;
const phrase = new RegExp(`(?<![\\p{L}])(?:(?<before>${pre}(?:${separator}${pre}){0,5})\\s+${qualifiers}${milk}|${milk}(?:\\s*[:—-]\\s*|\\s+${qualifiers}(?:di\\s+|d['’]|of\\s+|от\\s+)?)\\s*(?<after>${post}(?:${separator}${post}){0,5}))(?![\\p{L}])`, 'gu');
const animalPatterns = (Object.entries(animals) as [CheeseMilk, string][]).map(([type, forms]) =>
  [type, new RegExp(`(?<![\\p{L}])(?:${forms})(?![\\p{L}])`, 'gu')] as const);
const variable = /(?:^|[\s(])(?:или|либо|иногда|изредка|реже|вместо|возможн[а-я]*|допустим[а-я]*|допуска[а-я]*|альтернатив[а-я]*|вариант[а-я]*|разновидност[а-я]*|or|either|sometimes|instead|optional(?:ly)?|variants?|alternativ\w*|oppure|talvolta|invece|varianti?)(?=$|[\s,;:)])/;
const negative = /(?:^|\s)(?:без|не\s+из|не\s+содерж[а-я]*|не\s+использ[а-я]*|without|not\s+(?:made\s+)?(?:from|with)|senza|non\s+(?:con|da))(?:\s+|$)/;
const comparison = /(?:^|\s+)(?:в отличие от|по сравнению с|похож[а-я]* на|напомина[а-я]*|как у|unlike|compared (?:to|with)|similar to|a differenza di|simile a)\s+/;
const mix = /смес[а-я]+|смешива[а-я]+|с добавлени[а-я]+|mix(?:ed|ture)?|blend|miscela|misto|mista|mescolat[oa]/;
const whey = /сыворотк[а-я]+|whey|siero/;

function typesIn(text: string): CheeseMilk[] {
  const positions = animalPatterns.map(([type, pattern]) =>
    [type, text.search(pattern)] as const).filter(([, index]) => index >= 0).sort((a, b) => a[1] - b[1]);
  return positions.map(([type]) => type);
}

/** Only classify explicit milk ingredients in this article's descriptive text. */
export function detectCheeseMilk(data: { description?: string; characteristics?: string }): CheeseMilkResult {
  const evidence: CheeseMilk[][] = [];
  for (const field of [data.description, data.characteristics]) {
    const text = (field ?? '').toLocaleLowerCase('ru').replace(/ё/g, 'е')
      .replace(/\(\s*(?:до\s+)?\d+(?:[.,]\d+)?(?:\s*[-–—]\s*\d+(?:[.,]\d+)?)?\s*%\s*\)/g, '')
      .replace(/\(\s*(?:исторически|раньше|ранее|historically|in passato)\s+[^()]*\)/g, '');
    for (const sentence of text.split(/[.!?;\n]+/)) {
      const subject = sentence.split(comparison, 1)[0];
      const mentions = Array.from(subject.matchAll(phrase));
      if (!mentions.length) {
        if (milkWord.test(subject) && variable.test(subject) && typesIn(subject).length > 1)
          return { status: 'review', types: [] };
        continue;
      }
      const fields = mentions.flatMap(match => {
        const start = match.index ?? 0;
        const context = subject.slice(Math.max(0, start - 70), start);
        if (negative.test(context) || whey.test(context) || /^\s+(?:whey|сыворотк[а-я]+)/.test(subject.slice(start + match[0].length))) return [];
        return [typesIn(match.groups?.before || match.groups?.after || '')];
      }).filter(types => types.length > 0);
      if (!fields.length) continue;
      const all = Array.from(new Set(fields.flat()));
      // Different species offered as alternatives are not a blend.
      const alternative = variable.test(subject) && (mentions.length !== fields.length ? all.length > 1 : typesIn(subject).length > 1);
      if (alternative || /вместо|instead|invece/.test(subject))
        return { status: 'review', types: [] };
      if (all.length > 1 && fields.length > 1) {
        if (!mix.test(subject) && !fields.some(types => types.length === all.length))
          return { status: 'review', types: [] };
        evidence.push(all);
      } else evidence.push(all);
    }
  }
  if (!evidence.length) return { status: 'unknown', types: [] };
  const main = evidence.reduce((best, types) => types.length > best.length ? types : best);
  if (evidence.some(types => types.some(type => !main.includes(type)))) return { status: 'review', types: [] };
  return { status: 'known', types: main };
}

export function cheeseMilkText(milkResult: CheeseMilkResult | undefined) {
  if (milkResult?.status !== 'known') return 'не уточнён';
  const labels = milkResult.types.map(type => cheeseMilkLabels[type]).join(', ');
  return milkResult.types.length > 1 ? `смесь (${labels})` : labels;
}
