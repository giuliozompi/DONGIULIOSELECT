import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cheeseDataSchema, videoDataSchema, videoUrl } from '../shared/editorial';

test('uploaded image paths survive complete draft validation alongside remote photos', () => {
  const photos = ['/objects/uploads/photo.png', '/public-objects/cheese.jpg', '/uploads/image.webp', 'https://example.org/photo.jpg'];
  const parsed = cheeseDataSchema.safeParse({ title: 'Castelmagno', country: 'Italia', photos });
  assert.equal(parsed.success, true);
  if (parsed.success) assert.deepEqual(parsed.data.photos, photos);
  assert.equal(videoDataSchema.safeParse({
    title: 'Video', url: 'https://youtu.be/fixture-video', category: 'recipe', cover: '/objects/cover.png',
  }).success, true);
});

test('malformed image, source and video values return validation issues instead of throwing', () => {
  for (const value of ['not a url', '/objects/photo.png', 'javascript:alert(1)', 'https://user:password@example.org/photo']) {
    const photo = cheeseDataSchema.safeParse({ title: 'Cheese', country: 'Italia', photos: [value] });
    assert.equal(photo.success, value === '/objects/photo.png');
    assert.equal(cheeseDataSchema.safeParse({ title: 'Cheese', country: 'Italia', sources: [value] }).success, false);
    assert.equal(videoUrl.safeParse(value).success, false);
  }
  assert.equal(cheeseDataSchema.safeParse({
    title: 'Cheese', country: 'Italia', photos: Array.from({ length: 13 }, (_, i) => `/objects/${i}.png`),
  }).success, false);
});
