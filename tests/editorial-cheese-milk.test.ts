import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cheeseMilkText, detectCheeseMilk, resolveCheeseMilk } from '../shared/editorial-cheese-milk';
import { cheeseMilkCompositionSchema } from '../shared/editorial';

test('recognizes explicitly described milk species in Russian and legacy language text', () => {
  for (const [description, type] of [
    ['Сыр из цельного сырого молока местных коров.', 'cow'],
    ['Сыр изготавливается из сырого козьего молока.', 'goat'],
    ['Сыр производят из молока овец.', 'sheep'],
    ['Сыр изготовлен из ослиного молока.', 'donkey'],
    ['Сыр из кобыльего молока.', 'mare'],
    ['Сыр изготавливается из цельного молока буйволиц.', 'buffalo'],
    ['Formaggio a base di latte di asina.', 'donkey'],
    ["It is made with raw mare's milk.", 'mare'],
    ['It is made with buffalo milk.', 'buffalo'],
  ]) assert.deepEqual(detectCheeseMilk({ description }), { status: 'known', types: [type] }, description);
});

test('recognizes fixed blends with shared or repeated noun, including percentages', () => {
  for (const description of [
    'Его изготавливают из смеси овечьего (70–80%) и коровьего (20–30%) молока.',
    'Молоко: овечье, коровье.',
    'Смесь овечьего молока и коровьего молока.',
    'Formaggio di latte di pecora e di vacca.',
    "A mix of sheep's and cow's milk.",
  ]) {
    const result = detectCheeseMilk({ description });
    assert.deepEqual(result, { status: 'known', types: ['sheep', 'cow'] }, description);
    assert.equal(cheeseMilkText(result), 'смесь (овечье, коровье)');
  }
  assert.deepEqual(detectCheeseMilk({ description: 'Сыр из коровьего молока с добавлением козьего молока.' }),
    { status: 'known', types: ['cow', 'goat'] });
});

test('does not label alternatives, optional additions or conflicting text as a fixed blend', () => {
  for (const description of [
    'Сыр готовят из коровьего или козьего молока.',
    'Сыр изготавливают из коровьего, овечьего или смешанного молока.',
    'Сыр из коровьего молока с возможным добавлением козьего молока.',
    'Изготавливается из коровьего молока с редким добавлением овечьего или козьего.',
    'Made with goat milk or cow milk.',
  ]) assert.deepEqual(detectCheeseMilk({ description }), { status: 'review', types: [] }, description);
  assert.deepEqual(detectCheeseMilk({ description: 'Сыр из овечьего молока.', characteristics: 'Производится из свежего коровьего молока.' }),
    { status: 'review', types: [] });
});

test('does not infer it from a name, a comparison, rennet, whey or an excluded ingredient', () => {
  for (const description of [
    'Пекорино Романо. Сыр из молока с козлиным сычужным ферментом.',
    'Сыр из сыворотки овечьего молока.',
    "Prepared from sheep's milk whey.",
    'Продукт без коровьего молока.',
    'Текстура как у сыра из овечьего молока.',
    'Сыр без козьего и овечьего молока.',
  ]) assert.deepEqual(detectCheeseMilk({ description }), { status: 'unknown', types: [] }, description);
  assert.deepEqual(detectCheeseMilk({ description: 'Сыр из козьего молока, по текстуре напоминает сыр из коровьего молока.' }),
    { status: 'known', types: ['goat'] });
});

test('uses characteristics for older descriptions and ignores an explicitly historical aside', () => {
  assert.deepEqual(detectCheeseMilk({
    description: 'Неопределённое описание.',
    characteristics: 'Традиционный сыр из козьего молока (исторически также использовалось коровье или овечье молоко).',
  }), { status: 'known', types: ['goat'] });
  assert.equal(cheeseMilkText({ status: 'review', types: [] }), 'не уточнён');
});

test('manual milk types override text and omit unknown shares from the displayed label', () => {
  const composition = cheeseMilkCompositionSchema.parse([{ type: 'mare', percentage: 80.25 }, { type: 'donkey' }]);
  const cheese = { description: 'Сыр из овечьего молока.', milkComposition: composition };
  assert.deepEqual(resolveCheeseMilk(cheese), { status: 'known', types: ['mare', 'donkey'], composition });
  assert.equal(cheeseMilkText(resolveCheeseMilk(cheese)), 'смесь (кобылье 80,25%, ослиное)');
  assert.equal(cheeseMilkText(resolveCheeseMilk({ ...cheese, milkComposition: undefined })), 'овечье');
  assert.equal(cheeseMilkText(resolveCheeseMilk({ milkComposition: [{ type: 'cow', percentage: 100 }] })), 'коровье 100%');
});

test('milk percentages reject impossible totals, invalid shares and repeated types', () => {
  for (const percentages of [[80, 21], [80, 19.99], [100, undefined], [0, undefined], [101, undefined], [-2, undefined], [80.255, undefined]]) {
    const result = cheeseMilkCompositionSchema.safeParse([
      { type: 'cow', percentage: percentages[0] }, { type: 'goat', percentage: percentages[1] },
    ]);
    assert.equal(result.success, false, JSON.stringify(percentages));
  }
  assert.equal(cheeseMilkCompositionSchema.safeParse([{ type: 'cow' }, { type: 'cow' }]).success, false);
  assert.equal(cheeseMilkCompositionSchema.safeParse([{ type: 'other' }]).success, false);
  assert.equal(cheeseMilkCompositionSchema.safeParse([{ type: 'cow', percentage: 54.58 }, { type: 'goat', percentage: 45.42 }]).success, true);
  assert.equal(cheeseMilkCompositionSchema.safeParse([{ type: 'cow' }, { type: 'goat' }]).success, true);
});
