/**
 * Keyboard layout conversion utilities
 * Converts text typed with wrong keyboard layout (e.g., English QWERTY → Russian ЙЦУКЕН)
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
 * Detects if text is likely typed with wrong keyboard layout
 * Returns true if text contains only English letters (likely meant to be Russian)
 */
export function isLikelyEnglishTypedAsRussian(text: string): boolean {
  // Remove spaces and special characters
  const cleanText = text.replace(/[^a-zA-Z]/g, '');
  
  // If text is empty after cleaning, it's not English-typed-as-Russian
  if (!cleanText) return false;
  
  // If text contains mostly English letters, it's likely wrong layout
  const englishLetterCount = (text.match(/[a-zA-Z]/g) || []).length;
  const totalLetterCount = (text.match(/[a-zA-Zа-яА-ЯёЁ]/g) || []).length;
  
  // If more than 50% are English letters, likely wrong layout
  return totalLetterCount > 0 && englishLetterCount / totalLetterCount > 0.5;
}

/**
 * Smart search: tries both original text and converted text
 * Returns both versions for searching
 */
export function getSearchVariants(query: string): string[] {
  const variants = [query];
  
  if (isLikelyEnglishTypedAsRussian(query)) {
    const converted = convertEnToRu(query);
    if (converted !== query) {
      variants.push(converted);
    }
  }
  
  return variants;
}
