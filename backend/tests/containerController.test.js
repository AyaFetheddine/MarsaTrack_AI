const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const {
  normalizeIsoTypeCode,
  resolveStoredImagePath,
  ISO_TYPE_CODE_FORMAT,
} = require('../src/controllers/containerController');

const UPLOAD_ROOT = path.join(process.cwd(), 'uploads', 'containers');

test('normalizeIsoTypeCode : majuscules + suppression des parasites', () => {
  assert.strictEqual(normalizeIsoTypeCode('22g1'), '22G1');
  assert.strictEqual(normalizeIsoTypeCode(' 2-2 g 1 '), '22G1');
});

test('normalizeIsoTypeCode : vide / null -> null', () => {
  assert.strictEqual(normalizeIsoTypeCode(''), null);
  assert.strictEqual(normalizeIsoTypeCode(null), null);
  assert.strictEqual(normalizeIsoTypeCode(undefined), null);
});

test('ISO_TYPE_CODE_FORMAT : structure 4 caracteres, 3e = lettre', () => {
  assert.ok(ISO_TYPE_CODE_FORMAT.test('22G1'));
  assert.ok(ISO_TYPE_CODE_FORMAT.test('45R1'));
  assert.ok(!ISO_TYPE_CODE_FORMAT.test('2251')); // 3e position non lettre
  assert.ok(!ISO_TYPE_CODE_FORMAT.test('22G')); // trop court
});

test('resolveStoredImagePath : upload local -> chemin dans UPLOAD_ROOT', () => {
  const resolved = resolveStoredImagePath('/uploads/containers/photo.png');
  assert.strictEqual(resolved, path.join(UPLOAD_ROOT, 'photo.png'));
});

test('resolveStoredImagePath : URL externe ou vide -> null', () => {
  assert.strictEqual(resolveStoredImagePath('https://exemple.ma/x.jpg'), null);
  assert.strictEqual(resolveStoredImagePath(''), null);
  assert.strictEqual(resolveStoredImagePath(null), null);
});

test('resolveStoredImagePath : neutralise une tentative de traversal', () => {
  const resolved = resolveStoredImagePath('/uploads/containers/../../../etc/passwd');
  // path.basename ramene le nom seul : le chemin reste dans UPLOAD_ROOT.
  assert.strictEqual(resolved, path.join(UPLOAD_ROOT, 'passwd'));
  assert.ok(resolved.startsWith(UPLOAD_ROOT));
});
