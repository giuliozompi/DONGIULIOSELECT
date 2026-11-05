export type CheeseIdentity = { title: string; nameOriginal?: string; country: string };
export const normalizedIdentityText = (text: string) => text.normalize('NFKD')
  .replace(new RegExp('\\p{M}', 'gu'), '').toLowerCase()
  .replace(new RegExp('[^\\p{L}\\p{N}]+', 'gu'), ' ').trim();
const genericNameWord = /^(dop|dpo|pdo|aop|aoc|igp|pgi|cheese|formaggio|fromage|сыр)$/;
function names(cheese: CheeseIdentity) {
  return [cheese.nameOriginal || '', cheese.title].map(name => normalizedIdentityText(name)
    .split(' ').filter(word => !genericNameWord.test(word)).join(' ')).filter(name => name.length >= 3);
}
const cyrillic: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ж: 'zh', з: 'z', и: 'i',
  к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't',
  у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ы: 'y',
  э: 'e', ю: 'yu', я: 'ya', ь: '', ъ: '',
};
const dedouble = (value: string) => value.replace(/([a-z])\1+/g, '$1');
function russianSound(word: string) {
  return dedouble(Array.from(word).map(letter => cyrillic[letter] ?? letter).join(''));
}
function italianSound(word: string) {
  // Bounded spelling equivalence, not edit-distance/fuzzy matching or a source of facts.
  return dedouble(word.replace(/gn/g, 'n').replace(/gli(?=[aeou])/g, 'l')
    .replace(/gl(?=i)/g, 'l').replace(/sch(?=[ei])/g, 'sk')
    .replace(/sc(?=[ei])/g, 'sh').replace(/ch(?=[ei])/g, 'k')
    .replace(/gh(?=[ei])/g, 'g').replace(/c{1,2}i(?=[aou])/g, 'ch')
    .replace(/g{1,2}i(?=[aou])/g, 'dzh').replace(/c(?=[ei])/g, 'ch')
    .replace(/g(?=[ei])/g, 'dzh').replace(/c/g, 'k').replace(/zz/g, 'ts'));
}
export type IdentityContext = { text: string; transliterated: boolean };
export function cheeseIdentityContexts(text: string, cheese: CheeseIdentity): IdentityContext[] {
  const body = ` ${normalizedIdentityText(text)} `, result: IdentityContext[] = [];
  for (const name of names(cheese)) {
    const needle = ` ${name} `;
    let start = body.indexOf(needle);
    while (start !== -1) {
      result.push({ text: body.slice(Math.max(0, start - 450), start + needle.length + 450), transliterated: false });
      start = body.indexOf(needle, start + needle.length);
    }
  }
  if (result.length || cheese.nameOriginal?.trim() ||
      !/^(it|italia|italy|италия)$/.test(normalizedIdentityText(cheese.country))) return result;
  const candidates = names(cheese).filter(name => /^[а-я ]+$/.test(name) && name.replace(/ /g, '').length >= 5)
    .map(name => name.split(' ').map(russianSound));
  if (!candidates.length) return result;
  const tokens = Array.from(body.matchAll(new RegExp('[\\p{L}\\p{N}]+', 'gu')));
  for (const name of candidates) for (let i = 0; i <= tokens.length - name.length; i++) {
    const sequence = tokens.slice(i, i + name.length);
    if (!sequence.every((token, n) => /^[a-z]+$/.test(token[0]) && italianSound(token[0]) === name[n])) continue;
    const start = sequence[0].index!, end = sequence[sequence.length - 1].index! + sequence[sequence.length - 1][0].length;
    result.push({ text: body.slice(Math.max(0, start - 450), end + 450), transliterated: true });
  }
  return result;
}
