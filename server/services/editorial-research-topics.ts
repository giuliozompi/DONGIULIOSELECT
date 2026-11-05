import type { ResearchCoverage, ResearchTopic } from '../../shared/editorial-ai';
import type { SourceEvidence } from './editorial-ai-sources';

export function editorialSourcePassages(text: string) {
  const passages: { id: number; text: string }[] = [];
  for (let start = 0; start < text.length;) {
    let end = Math.min(start + 900, text.length);
    if (end < text.length) {
      const space = text.lastIndexOf(' ', end);
      if (space > start + 600) end = space;
    }
    const quote = text.slice(start, end).trim();
    if (quote.length >= 10) passages.push({ id: passages.length, text: quote });
    start = end;
  }
  return passages;
}
const normalize = (value: string) => value.normalize('NFKD').replace(new RegExp('\\p{M}', 'gu'), '').toLowerCase();
export const researchTopics: { topic: ResearchTopic; label: string; terms: RegExp }[] = [
  { topic: 'history', label: 'История', terms: /(?:\b(?:histor\w*|stori\w*|origin\w*|medieval\w*|centur\w*|secol\w*|tradizion\w*|tradition\w*|geschicht\w*)\b|истори|впервые|век[а-я]*|традици)/ },
  { topic: 'origin', label: 'Страна, регион и зона происхождения', terms: /(?:\b(?:produc\w*|prodot\w*|origin\w*|territor\w*|region\w*|municip\w*|comun[ei]|zona|area|proven\w*|geograph\w*|geograf\w*|herkunft)\b|происхожд|производ|регион|област|территор)/ },
  { topic: 'characteristics', label: 'Молоко, изготовление, выдержка, вкус', terms: /(?:\b(?:milk|latte|lait|milch|leche|whey|siero|pecor\w*|bovin\w*|ovin\w*|caprin\w*|salat\w*|salatur\w*|curd|texture|consisten\w*|stagion\w*|affin\w*|matur\w*|aged?|aging|taste|flavou?r|sapor\w*|gout|sabor|pasta)\b|молок|сыворот|текстур|созрев|выдерж|вкус|солен|солён)/ },
  { topic: 'culinaryUses', label: 'Использование в кухне', terms: /(?:\b(?:culinar\w*|cucin\w*|cook\w*|recipe\w*|ricett\w*|recett\w*|kuch\w*|receta\w*|pasta|grattugi\w*|grated|salad\w*|insalat\w*|abbin\w*|pair\w*|serv\w*|dish\w*)\b|кулинар|кухн|рецепт|блюд|салат|паст[аыу]|натира|сочетан)/ },
];
// Lexical routing identifies passages to REVIEW, not semantic support for facts.
export function researchCoverage(sources: SourceEvidence[]): ResearchCoverage[] {
  return researchTopics.map(({ topic, label, terms }) => {
    const evidence = sources.flatMap((source, sourceIndex) => {
      const matches = editorialSourcePassages(source.text).filter(p => terms.test(normalize(p.text))).slice(0, 3);
      return matches.length ? [{ sourceIndex, passageIds: matches.map(p => p.id), excerpt: matches[0].text.slice(0, 360) }] : [];
    });
    return { topic, label, status: evidence.length ? 'evidence' : 'missing', evidence };
  });
}
export function sourceTopics(source: SourceEvidence): ResearchTopic[] {
  return researchTopics.filter(({ terms }) => terms.test(normalize(source.text))).map(({ topic }) => topic);
}

type Identity = { title: string; nameOriginal?: string; country: string; region: string };
const vocabulary = {
  it: { cheese: 'formaggio', country: 'Italia', topics: ['storia origini tradizione', 'zona produzione comuni disciplinare origine', 'latte lavorazione stagionatura consistenza sapore scheda tecnica', 'uso cucina ricette abbinamenti', 'foto formaggio immagini licenza'] },
  fr: { cheese: 'fromage', country: 'France', topics: ['histoire origines tradition', 'aire production communes origine cahier charges', 'lait fabrication affinage texture gout fiche technique', 'utilisation cuisine recettes accords', 'photos fromage images licence'] },
  ru: { cheese: 'сыр', country: 'Россия', topics: ['история происхождение традиции', 'регион зона производства происхождение', 'молоко изготовление выдержка консистенция вкус', 'использование кухня рецепты сочетания', 'фото сыра изображения лицензия'] },
  es: { cheese: 'queso', country: 'España', topics: ['historia origen tradicion', 'zona produccion origen pliego condiciones', 'leche elaboracion maduracion textura sabor', 'uso cocina recetas maridaje', 'fotos queso imagenes licencia'] },
  de: { cheese: 'Käse', country: 'Deutschland', topics: ['Geschichte Ursprung Tradition', 'Herkunft Erzeugungsgebiet Spezifikation', 'Milch Herstellung Reifung Konsistenz Geschmack', 'Verwendung Küche Rezepte', 'Käse Fotos Bilder Lizenz'] },
  en: { cheese: 'cheese', country: '', topics: ['history origins tradition', 'origin production region specification', 'milk making aging texture taste technical specification', 'culinary uses recipes pairing', 'cheese photos images license'] },
};
export function structuredResearchPlan(cheese: Identity) {
  const country = normalize(cheese.country).trim();
  const language = /^(it|italia|italy|италия)$/.test(country) ? 'it'
    : /^(fr|france|франция)$/.test(country) ? 'fr'
    : /^(ru|russia|россия)$/.test(country) ? 'ru'
    : /^(es|espana|spain|испания)$/.test(country) ? 'es'
    : /^(de|deutschland|germany|германия)$/.test(country) ? 'de' : 'en';
  const words = vocabulary[language];
  const name = (cheese.nameOriginal?.trim() || cheese.title).replace(/\s+/g, ' ').slice(0, 160);
  return [...researchTopics.map(t => ({ topic: t.topic, label: t.label })), { topic: 'photos' as const, label: 'Фотографии' }]
    .map((item, index) => ({ ...item, query: `${name} ${words.cheese} ${words.country || cheese.country.slice(0, 80)} ${words.topics[index]}${index === 0 ? ' Wikipedia' : ''}`.trim().slice(0, 400) }));
}
