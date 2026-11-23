import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cheeseMilkText, detectCheeseMilk } from '../shared/editorial-cheese-milk';

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
