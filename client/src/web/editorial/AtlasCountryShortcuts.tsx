type CountryShortcut = { label: string; country: string };
const shortcuts: CountryShortcut[] = [
  { label: 'Италия', country: 'Италия' },
  { label: 'Франция', country: 'Франция' },
  { label: 'Нидерланды', country: 'Нидерланды' },
  { label: 'Испания', country: 'Испания' },
  { label: 'Греция', country: 'Греция' },
  { label: 'Великобритания', country: 'Великобритания' },
  { label: 'Россия', country: 'Россия' },
];

export default function AtlasCountryShortcuts({ country, world, onSelect }: {
  country: string;
  world: boolean;
  onSelect: (country: string) => void;
}) {
  return <nav className="ed-country-shortcuts" aria-label="Быстрый выбор страны">
    {shortcuts.map(shortcut => {
      const active = !world && country === shortcut.country;
      return <button type="button" key={shortcut.label} className={active ? 'active' : undefined}
        aria-pressed={active}
        onClick={() => onSelect(shortcut.country)}>{shortcut.label}</button>;
    })}
  </nav>;
}
