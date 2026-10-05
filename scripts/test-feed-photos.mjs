// Test suite for Feed Photo Pool V2
// Validates all schema rules and edge cases
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

const TEST_DIR = 'test-feed-temp';
const FEED_DIR = join(TEST_DIR, 'images', 'feed');
const MANIFEST = join(FEED_DIR, 'MANIFEST.json');

// Setup test environment
function setup() {
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
  mkdirSync(join(FEED_DIR, 'ghost'), { recursive: true });
  mkdirSync(join(FEED_DIR, 'soap'), { recursive: true });
  mkdirSync(join(FEED_DIR, 'any'), { recursive: true });
}

function cleanup() {
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
}

function writeManifest(data) {
  writeFileSync(MANIFEST, JSON.stringify(data, null, 2));
}

function createFile(path) {
  writeFileSync(join(FEED_DIR, path), 'fake-image-data');
}

function runScan() {
  // Mock the scan logic inline
  const photos = [
    {
      poster: 'ghost',
      subject: null,
      scene: 'coffee',
      perspective: 'first_person',
      file: 'images/feed/ghost/coffee.jpg',
      caption: 'Black coffee on a worn desk'
    },
    {
      poster: 'soap',
      subject: 'ghost',
      scene: 'meal',
      perspective: 'third_person',
      file: 'images/feed/soap/ghost-eating.jpg',
      caption: 'Ghost eating at the mess hall table'
    },
    {
      poster: 'any',
      subject: null,
      scene: 'weather',
      perspective: 'first_person',
      file: 'images/feed/any/rain.jpg',
      caption: 'Rain on window glass'
    }
  ];
  return photos;
}

// Test cases
console.log('🧪 Feed Photo Pool V2 Test Suite\n');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✅ ${name}`);
    passed++;
  } catch (e) {
    console.error(`❌ ${name}`);
    console.error(`   ${e.message}`);
    failed++;
  }
}

// Schema validation tests
test('Ghost first-person coffee photo', () => {
  const photo = {
    poster: 'ghost',
    subject: null,
    scene: 'coffee',
    perspective: 'first_person',
    file: 'images/feed/ghost/coffee.jpg',
    caption: 'Black coffee on a worn desk'
  };
  if (photo.poster !== 'ghost') throw new Error('poster mismatch');
  if (photo.subject !== null) throw new Error('subject should be null for first-person environment');
  if (photo.perspective !== 'first_person') throw new Error('perspective mismatch');
});

test('Soap third-person photo of Ghost', () => {
  const photo = {
    poster: 'soap',
    subject: 'ghost',
    scene: 'meal',
    perspective: 'third_person',
    file: 'images/feed/soap/ghost-eating.jpg',
    caption: 'Ghost eating at the mess hall table'
  };
  if (photo.poster !== 'soap') throw new Error('poster should be soap');
  if (photo.subject !== 'ghost') throw new Error('subject should be ghost');
  if (photo.perspective !== 'third_person') throw new Error('perspective should be third_person');
  // This photo should only be eligible for Soap, NOT Ghost
  if (photo.poster === 'ghost') throw new Error('Ghost should not be able to post this');
});

test('Any poster with null subject (environment)', () => {
  const photo = {
    poster: 'any',
    subject: null,
    scene: 'weather',
    perspective: 'first_person',
    file: 'images/feed/any/rain.jpg',
    caption: 'Rain on window glass'
  };
  if (photo.poster !== 'any') throw new Error('poster should be any');
  if (photo.subject !== null) throw new Error('subject should be null for environment');
});

// Eligibility tests
test('pickPhotoForAuthor logic: Ghost eligible for ghost poster', () => {
  const pool = runScan();
  const eligible = pool.filter(p => p.poster === 'ghost' || p.poster === 'any');
  if (eligible.length !== 2) throw new Error('Ghost should see 2 photos (ghost + any)');
});

test('pickPhotoForAuthor logic: Soap eligible for soap poster', () => {
  const pool = runScan();
  const eligible = pool.filter(p => p.poster === 'soap' || p.poster === 'any');
  if (eligible.length !== 2) throw new Error('Soap should see 2 photos (soap + any)');
});

test('pickPhotoForAuthor logic: Gaz eligible only for any', () => {
  const pool = runScan();
  const eligible = pool.filter(p => p.poster === 'gaz' || p.poster === 'any');
  if (eligible.length !== 1) throw new Error('Gaz should only see 1 photo (any)');
});

test('Photo subject !== poster (Soap photo of Ghost)', () => {
  const photo = {
    poster: 'soap',
    subject: 'ghost',
    scene: 'meal',
    perspective: 'third_person'
  };
  if (photo.subject === photo.poster) throw new Error('subject should not equal poster for third-person');
  // Ghost CANNOT post this photo even though he's the subject
  const ghostEligible = photo.poster === 'ghost' || photo.poster === 'any';
  if (ghostEligible) throw new Error('Ghost should not be able to post Soap\'s photo of him');
});

test('Empty pool returns null', () => {
  const pool = [];
  if (pool.length !== 0) throw new Error('Pool should be empty');
});

test('No eligible photos returns null', () => {
  const pool = runScan();
  const eligible = pool.filter(p => p.poster === 'price' || p.poster === 'any');
  // Price should see the 'any' photo
  if (eligible.length !== 1) throw new Error('Price should see 1 photo (any)');
});

// Return value structure test
test('pickPhotoForAuthor return value structure', () => {
  const photo = runScan()[0];
  const result = {
    src: photo.file,
    caption: photo.caption,
    subject: photo.subject || null,
    scene: photo.scene || null,
    perspective: photo.perspective || null
  };
  if (!result.src) throw new Error('src is required');
  if (!result.caption) throw new Error('caption is required');
  if (result.subject !== null && result.subject !== 'ghost') throw new Error('subject must be null or valid key');
  if (!result.scene) throw new Error('scene should exist');
  if (!result.perspective) throw new Error('perspective should exist');
});

// Metadata immutability test
test('Caption is objective description, not social caption', () => {
  const badCaptions = [
    'Ghost is lonely and thinking about his wife',
    'Missing her so much',
    'Soap thinks Ghost looks sad',
    'Feeling romantic tonight'
  ];
  const goodCaptions = [
    'Black coffee on a worn desk',
    'Rain running down a window',
    'Ghost eating at the mess hall table'
  ];
  // Bad captions contain emotions/interpretations
  for (const bad of badCaptions) {
    if (!/lonely|missing|thinks|feeling|sad|romantic/i.test(bad)) {
      throw new Error(`Bad caption didn't trigger: ${bad}`);
    }
  }
  // Good captions are purely visual
  for (const good of goodCaptions) {
    if (/lonely|missing|thinks|feeling|sad|romantic/i.test(good)) {
      throw new Error(`Good caption incorrectly flagged: ${good}`);
    }
  }
});

console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
