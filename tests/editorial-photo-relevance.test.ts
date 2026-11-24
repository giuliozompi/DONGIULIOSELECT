import assert from 'node:assert/strict';
import { test } from 'node:test';
import { editorialPhotoQuery } from '../server/services/editorial-photo-search';
import { researchPhotos, sourcePageImages } from '../server/services/editorial-research-photos';
import type { SourceEvidence } from '../server/services/editorial-ai-sources';

const identity = { title: 'Пекорино Романо', nameOriginal: 'Pecorino Romano', country: 'Италия', region: 'Лацио' };
function evidence(images: { url: string; alt: string }[], suffix = ''): SourceEvidence {
  return { url: `https://example.org/cheese${suffix}`, finalUrl: `https://example.org/cheese${suffix}`,
    title: 'Pecorino Romano', text: 'Pecorino Romano cheese', images,
    sha256: 'fixture', retrievedAt: new Date().toISOString(), characters: 21, truncated: false };
}

test('photo searches use country vocabulary and distinct bounded intents without mixing languages', () => {
  const queries = [0, 1, 2, 3].map(attempt => editorialPhotoQuery(identity, attempt));
  assert.equal(new Set(queries).size, 4);
  for (const query of queries) {
    assert.match(query, /^Pecorino Romano formaggio Italia/);
    assert.doesNotMatch(query, /fromage|сыр|cheese|лицензия|licenza/);
    assert.ok(query.length <= 400);
  }
  assert.match(editorialPhotoQuery({ ...identity, nameOriginal: 'Вологодский', country: 'Россия' }, 1), /головка разрез/);
  assert.match(editorialPhotoQuery({ ...identity, nameOriginal: 'Comté', country: 'Франция' }, 2), /croûte pâte/);
  assert.match(editorialPhotoQuery({ ...identity, nameOriginal: 'Manchego', country: 'Испания' }, 0), /productor quesería/);
});

test('named cheese photographs precede generic social images and recipe dishes across pages', () => {
  const photos = researchPhotos([
    evidence([
      { url: 'https://example.org/social.jpg', alt: 'Our dairy' },
      { url: 'https://example.org/pasta.jpg', alt: 'Pecorino Romano pasta recipe' },
      { url: 'https://example.org/whole.jpg', alt: 'Pecorino Romano wheel' },
      { url: 'https://example.org/advert.jpg', alt: 'Newsletter banner' },
    ]),
    evidence([{ url: 'https://example.org/pecorino-romano-cut.jpg', alt: '' }], '/producer'),
  ], [], identity);
  assert.deepEqual(photos.map(photo => photo.imageUrl), [
    'https://example.org/whole.jpg', 'https://example.org/pecorino-romano-cut.jpg', 'https://example.org/social.jpg',
  ]);
  assert.equal(photos[1].sourceUrl, 'https://example.org/cheese/producer');
  assert.equal(photos[0].licenseUrl, undefined);
});

test('new ranking retains exclusions, source diversity and safe URL validation', () => {
  const photos = researchPhotos([
    evidence([
      { url: 'https://example.org/old.jpg?utm_source=one', alt: 'Pecorino Romano' },
      { url: 'https://127.0.0.1/private.jpg', alt: 'Pecorino Romano' },
      { url: 'https://example.org/a.jpg', alt: 'Pecorino Romano' },
      { url: 'https://example.org/b.jpg', alt: 'Pecorino Romano' },
    ]),
    evidence([{ url: 'https://example.org/c.jpg', alt: 'Pecorino Romano' }], '/second'),
  ], ['https://example.org/old.jpg'], identity);
  assert.deepEqual(photos.map(photo => photo.imageUrl), [
    'https://example.org/c.jpg', 'https://example.org/a.jpg', 'https://example.org/b.jpg',
  ]);
});

test('extracts larger responsive and lazy images rather than tiny loading placeholders', () => {
  const images = sourcePageImages(`<main>
    <img src="/placeholder.jpg" data-srcset="/pecorino-small.jpg 320w, /pecorino-large.jpg 1200w" alt="Pecorino Romano">
    <img src="/placeholder.jpg" data-lazy-src="/wheel.jpg" alt="Pecorino Romano wheel">
    <img src="/fake.jpg" srcset="https://127.0.0.1/private.jpg 1200w">
    </main>`, 'https://example.org/cheese');
  assert.deepEqual(images.map(image => image.url), ['https://example.org/pecorino-large.jpg', 'https://example.org/wheel.jpg']);
});
