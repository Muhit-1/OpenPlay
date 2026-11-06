import { test } from 'node:test';
import assert from 'node:assert/strict';
import { queryCatalog, facets, needsIndex, MIN_VOTES_FOR_TOP } from '../src/lib/catalog-query.js';

const R = (name, o = {}) => ({ name, title: name, found: true, genres: [], rating: 7, votes: 1000, year: 2015, language: 'en', ...o });
const data = [
  R('Alpha',  { genres: ['Comedy', 'Romance'], rating: 6.5, year: 2021, language: 'en' }),
  R('Bravo',  { genres: ['Comedy'], rating: 8.2, year: 2008, language: 'hi' }),
  R('Charlie',{ genres: ['Horror'], rating: 7.4, year: 2016, language: 'en', votes: 12 }),
  R('Delta',  { genres: ['Romance'], rating: 9.1, year: 1985, language: 'bn', votes: 40 }),
  { name: 'zzz unmatched', found: false },
];
const names = rs => rs.map(r => r.name);

test('genre filter', () => {
  assert.deepEqual(names(queryCatalog(data, { genre: 'Comedy' })), ['Alpha', 'Bravo']);
  assert.deepEqual(names(queryCatalog(data, { genre: 'Romance' })), ['Alpha', 'Delta']);
});

test('minimum rating', () => {
  assert.deepEqual(names(queryCatalog(data, { minRating: 8 })), ['Bravo', 'Delta']);
  assert.deepEqual(names(queryCatalog(data, { minRating: 7 })), ['Bravo', 'Charlie', 'Delta']);
});

test('decades, including "before 1990"', () => {
  assert.deepEqual(names(queryCatalog(data, { year: '2010s' })), ['Charlie']);
  assert.deepEqual(names(queryCatalog(data, { year: '2000s' })), ['Bravo']);
  assert.deepEqual(names(queryCatalog(data, { year: 'older' })), ['Delta']);
});

test('language', () => {
  assert.deepEqual(names(queryCatalog(data, { language: 'hi' })), ['Bravo']);
});

test('filters combine', () => {
  assert.deepEqual(names(queryCatalog(data, { genre: 'Comedy', minRating: 8, language: 'hi' })), ['Bravo']);
  assert.deepEqual(names(queryCatalog(data, { genre: 'Horror', minRating: 8 })), []);
});

test('any filter drops unmatched titles; no filter keeps them', () => {
  assert.equal(queryCatalog(data, {}).length, 5);
  assert.ok(!names(queryCatalog(data, { genre: 'Comedy' })).includes('zzz unmatched'));
  assert.ok(!names(queryCatalog(data, { year: '2010s' })).includes('zzz unmatched'));
});

test('sort: newest, popular, A-Z', () => {
  assert.deepEqual(names(queryCatalog(data, { sort: 'newest' })).slice(0, 3), ['Alpha', 'Charlie', 'Bravo']);
  assert.deepEqual(names(queryCatalog(data, { sort: 'popular' })).slice(0, 2), ['Alpha', 'Bravo']);
  assert.deepEqual(names(queryCatalog(data, { sort: 'az' })), ['Alpha', 'Bravo', 'Charlie', 'Delta', 'zzz unmatched']);
});

test('top rated puts well-voted titles first, so 9.1 from 40 votes does not win', () => {
  assert.ok(40 < MIN_VOTES_FOR_TOP && 12 < MIN_VOTES_FOR_TOP);
  const top = names(queryCatalog(data, { sort: 'top' }));
  assert.deepEqual(top.slice(0, 2), ['Bravo', 'Alpha']);
  assert.ok(top.indexOf('Delta') > top.indexOf('Alpha'));
});

test('text search matches the folder name or the TMDB title', () => {
  assert.deepEqual(names(queryCatalog(data, { text: 'brav' })), ['Bravo']);
});

test('facets count genres and languages, most common first', () => {
  const f = facets(data);
  assert.deepEqual(f.genres[0], ['Comedy', 2]);
  assert.equal(f.genres.find(([g]) => g === 'Horror')[1], 1);
  assert.deepEqual(f.languages[0], ['en', 2]);
});

test('needsIndex says when the index is required', () => {
  assert.equal(needsIndex({}), false);
  assert.equal(needsIndex({ sort: 'az' }), false);
  assert.equal(needsIndex({ sort: 'top' }), true);
  assert.equal(needsIndex({ genre: 'Comedy' }), true);
  assert.equal(needsIndex({ year: 'all' }), false);
});
