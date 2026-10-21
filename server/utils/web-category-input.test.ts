import assert from 'node:assert/strict';
import { test } from 'node:test';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import { categories } from '../../shared/schema';
import { createWebCategorySchema, updateWebCategorySchema } from './web-category-input';

const image = '/objects/uploads/new-category-photo';
const db = drizzle.mock();

test('category creation keeps the uploaded image and allows a root category', () => {
  const body = createWebCategorySchema.parse({
    name: 'Formaggi', slug: 'formaggi', image, parentId: null,
    sortOrder: 0, isVisible: true,
  });
  assert.equal(body.image, image);
  assert.equal(body.parentId, null);
  const query = db.insert(categories).values(body).toSQL();
  assert.ok(query.sql.includes('"image"'));
  assert.ok(query.params.includes(image));
});

test('replacing a photo writes the image column in the database update', () => {
  const body = updateWebCategorySchema.parse({ image });
  assert.deepEqual(body, { image });
  const query = db.update(categories).set(body).where(eq(categories.id, 'category-id')).toSQL();
  assert.match(query.sql, /set "image" = \$1/);
  assert.equal(query.params[0], image);
});

test('removing a photo persists null', () => {
  const body = updateWebCategorySchema.parse({ image: null });
  assert.deepEqual(body, { image: null });
  assert.equal(db.update(categories).set(body).toSQL().params[0], null);
});

test('editing another field does not overwrite the existing photo', () => {
  const body = updateWebCategorySchema.parse({ name: 'Nuovo nome' });
  assert.deepEqual(body, { name: 'Nuovo nome' });
  assert.ok(!db.update(categories).set(body).toSQL().sql.includes('"image"'));
});

test('legacy imageUrl input maps to image and never reaches SQL as imageUrl', () => {
  for (const value of [image, null]) {
    assert.deepEqual(updateWebCategorySchema.parse({ imageUrl: value }), { image: value });
    const body = createWebCategorySchema.parse({ name: 'Test', slug: 'test', imageUrl: value });
    assert.equal(body.image, value);
    assert.ok(!('imageUrl' in body));
  }
});

test('explicit image takes priority over the legacy alias, including removal', () => {
  assert.deepEqual(updateWebCategorySchema.parse({ image: null, imageUrl: image }), { image: null });
});

test('invalid photos and empty required fields are rejected', () => {
  assert.equal(updateWebCategorySchema.safeParse({ image: 42 }).success, false);
  assert.equal(createWebCategorySchema.safeParse({ name: '', slug: 'test' }).success, false);
});
