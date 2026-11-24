export const atlasRegionCountries = {
  IT: 'Италия', FR: 'Франция', ES: 'Испания', NL: 'Нидерланды', CH: 'Швейцария',
  DE: 'Германия', AT: 'Австрия', GR: 'Греция', PT: 'Португалия', GB: 'Великобритания',
} as const;
export type AtlasRegionCountry = keyof typeof atlasRegionCountries;
