/**
 * Keyboard layout conversion utilities
 * Converts text typed with wrong keyboard layout (bidirectional):
 * - English QWERTY → Russian ЙЦУКЕН
 * - Russian ЙЦУКЕН → English QWERTY
 */

// QWERTY (English) to ЙЦУКЕН (Russian) mapping
const enToRuMap: Record<string, string> = {
  // Top row
  'q': 'й', 'w': 'ц', 'e': 'у', 'r': 'к', 't': 'е', 'y': 'н', 'u': 'г', 'i': 'ш', 'o': 'щ', 'p': 'з', '[': 'х', ']': 'ъ',
  'Q': 'Й', 'W': 'Ц', 'E': 'У', 'R': 'К', 'T': 'Е', 'Y': 'Н', 'U': 'Г', 'I': 'Ш', 'O': 'Щ', 'P': 'З', '{': 'Х', '}': 'Ъ',
  
  // Middle row
  'a': 'ф', 's': 'ы', 'd': 'в', 'f': 'а', 'g': 'п', 'h': 'р', 'j': 'о', 'k': 'л', 'l': 'д', ';': 'ж', "'": 'э',
  'A': 'Ф', 'S': 'Ы', 'D': 'В', 'F': 'А', 'G': 'П', 'H': 'Р', 'J': 'О', 'K': 'Л', 'L': 'Д', ':': 'Ж', '"': 'Э',
  
  // Bottom row
  'z': 'я', 'x': 'ч', 'c': 'с', 'v': 'м', 'b': 'и', 'n': 'т', 'm': 'ь', ',': 'б', '.': 'ю', '/': '.',
  'Z': 'Я', 'X': 'Ч', 'C': 'С', 'V': 'М', 'B': 'И', 'N': 'Т', 'M': 'Ь', '<': 'Б', '>': 'Ю', '?': ',',
  
  // Number row
  '`': 'ё', '~': 'Ё',
};

// ЙЦУКЕН (Russian) to QWERTY (English) mapping (inverse)
const ruToEnMap: Record<string, string> = {
  // Top row
  'й': 'q', 'ц': 'w', 'у': 'e', 'к': 'r', 'е': 't', 'н': 'y', 'г': 'u', 'ш': 'i', 'щ': 'o', 'з': 'p', 'х': '[', 'ъ': ']',
  'Й': 'Q', 'Ц': 'W', 'У': 'E', 'К': 'R', 'Е': 'T', 'Н': 'Y', 'Г': 'U', 'Ш': 'I', 'Щ': 'O', 'З': 'P', 'Х': '{', 'Ъ': '}',
  
  // Middle row
  'ф': 'a', 'ы': 's', 'в': 'd', 'а': 'f', 'п': 'g', 'р': 'h', 'о': 'j', 'л': 'k', 'д': 'l', 'ж': ';', 'э': "'",
  'Ф': 'A', 'Ы': 'S', 'В': 'D', 'А': 'F', 'П': 'G', 'Р': 'H', 'О': 'J', 'Л': 'K', 'Д': 'L', 'Ж': ':', 'Э': '"',
  
  // Bottom row
  'я': 'z', 'ч': 'x', 'с': 'c', 'м': 'v', 'и': 'b', 'т': 'n', 'ь': 'm', 'б': ',', 'ю': '.', '.': '/',
  'Я': 'Z', 'Ч': 'X', 'С': 'C', 'М': 'V', 'И': 'B', 'Т': 'N', 'Ь': 'M', 'Б': '<', 'Ю': '>', ',': '?',
  
  // Number row
  'ё': '`', 'Ё': '~',
};

/**
 * Converts text from English QWERTY layout to Russian ЙЦУКЕН layout
 * Example: "gfhvf" → "парма"
 */
export function convertEnToRu(text: string): string {
  return text
    .split('')
    .map(char => enToRuMap[char] || char)
    .join('');
}

/**
 * Converts text from Russian ЙЦУКЕН layout to English QWERTY layout
 * Example: "зфкьф" → "parma"
 */
export function convertRuToEn(text: string): string {
  return text
    .split('')
    .map(char => ruToEnMap[char] || char)
    .join('');
}

/**
 * Detects if text is likely typed with English layout but meant to be Russian
 * Returns true if text contains mostly English letters (likely meant to be Russian)
 */
export function isLikelyEnglishTypedAsRussian(text: string): boolean {
  // If text contains mostly English letters, it's likely wrong layout
  const englishLetterCount = (text.match(/[a-zA-Z]/g) || []).length;
  const totalLetterCount = (text.match(/[a-zA-Zа-яА-ЯёЁ]/g) || []).length;
  
  // If more than 50% are English letters, likely wrong layout
  return totalLetterCount > 0 && englishLetterCount / totalLetterCount > 0.5;
}

/**
 * Detects if text is likely typed with Russian layout but meant to be English
 * Returns true if text contains mostly Russian letters (likely meant to be English)
 */
export function isLikelyRussianTypedAsEnglish(text: string): boolean {
  // If text contains mostly Russian letters, it's likely wrong layout
  const russianLetterCount = (text.match(/[а-яА-ЯёЁ]/g) || []).length;
  const totalLetterCount = (text.match(/[a-zA-Zа-яА-ЯёЁ]/g) || []).length;
  
  // If more than 50% are Russian letters, likely wrong layout
  return totalLetterCount > 0 && russianLetterCount / totalLetterCount > 0.5;
}

/**
 * Smart search: tries both original text and converted text (bidirectional)
 * Returns multiple variants for searching:
 * - Original query
 * - English → Russian conversion (if applicable)
 * - Russian → English conversion (if applicable)
 */
export function getSearchVariants(query: string): string[] {
  const variants = [query];
  
  // Try English → Russian conversion
  if (isLikelyEnglishTypedAsRussian(query)) {
    const converted = convertEnToRu(query);
    if (converted !== query && !variants.includes(converted)) {
      variants.push(converted);
    }
  }
  
  // Try Russian → English conversion
  if (isLikelyRussianTypedAsEnglish(query)) {
    const converted = convertRuToEn(query);
    if (converted !== query && !variants.includes(converted)) {
      variants.push(converted);
    }
  }
  
  return variants;
}
