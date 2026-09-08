// Run from the Vikings repo: npm test
// Or set VIKINGS_APP_PATH to an absolute path to playbook/app.js.
// This harness executes the current application functions with controlled RPCs
// and minimal UI stand-ins. It performs no network calls or repository writes.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import vm from 'node:vm';

const appPath = process.env.VIKINGS_APP_PATH || resolve('playbook/app.js');
const source = readFileSync(appPath, 'utf8');
const {blankBook, validateBook} = await import(pathToFileURL(resolve(dirname(appPath), 'model.js')));

function extract(start, end) {
  const first = source.indexOf(start);
  const last = source.indexOf(end, first);
  assert.ok(first >= 0 && last > first, `Could not locate ${start}`);
  return source.slice(first, last);
}

const functions = [
  extract('async function save(){', 'function updateUrl(){'),
  extract('async function loadBook(', 'async function makeBook('),
  extract('async function makeBook(', 'function download('),
].join('\n');

function fixture(title) {
  return {...blankBook(), title};
}

function harness(overrides = {}) {
  const calls = [];
  const notices = [];
  const drafts = new Map();
  const elements = new Map();
  let context;
  context = vm.createContext({
    initial: {
      book: fixture('Original'), key: 'workspace-key', bookId: 'old-id',
      revision: 6, dirty: true, serial: 1, initialized: true,
      ...overrides,
    },
    structuredClone, JSON, Promise, blankBook, validateBook,
    crypto: {randomUUID: () => 'new-id'},
    setTimeout: () => 0,
    clearTimeout() {},
    status() {},
    notice(text, actions = []) { notices.push({text, actions}); },
    $(id) {
      if (!elements.has(id)) elements.set(id, {hidden: false});
      return elements.get(id);
    },
    refreshBooks: async () => {},
    draftRead: async id => structuredClone(drafts.get(id)),
    cache: async () => {
      const state = context.state();
      drafts.set(`${state.key}:${state.bookId}`, structuredClone({
        book: state.book, revision: state.revision, dirty: state.dirty,
      }));
    },
    updateUrl() {}, renderAll() {}, changed() {},
    rpc(name, args) {
      return new Promise((resolveCall, rejectCall) => {
        calls.push({name, args, resolve: resolveCall, reject: rejectCall});
      });
    },
  });
  vm.runInContext(`
    let {book, key, bookId, revision, dirty, serial, initialized} = initial;
    let timer, saving = null, conflict = false, busy = false;
    let history = [], selected = 0;
    function lock(value) { busy = value; globalThis.inputsDisabled = value; }
    ${functions}
    globalThis.state = () => ({book, key, bookId, revision, dirty, busy, initialized, conflict});
  `, context);
  return {context, calls, notices, drafts};
}

async function until(predicate, message) {
  for (let i = 0; i < 100; i++) {
    if (predicate()) return;
    await Promise.resolve();
  }
  assert.fail(message);
}

test('copy waits for an in-flight save and creates its own ID at revision zero', async () => {
  const h = harness();
  const originalSave = h.context.save();
  const copy = h.context.makeBook(fixture('Restored'), true);
  assert.equal(h.context.state().bookId, 'old-id');
  assert.equal(h.context.state().busy, true);
  assert.equal(h.calls.length, 1);
  h.calls[0].resolve({revision: 7});
  await originalSave;
  await until(() => h.calls.length === 2, 'Copy did not start its own save');
  assert.equal(h.calls[1].args.p_id, 'new-id');
  assert.equal(h.calls[1].args.p_revision, 0);
  assert.equal(h.calls[1].args.p_payload.title, 'Restored (copy)');
  h.calls[1].resolve({revision: 1});
  await copy;
  const state = h.context.state();
  assert.equal(state.bookId, 'new-id');
  assert.equal(state.revision, 1);
  assert.equal(state.dirty, false);
  assert.equal(state.busy, false);
});

test('overlapping selections while dirty cannot start concurrent loads', async () => {
  const h = harness();
  const first = h.context.loadBook('book-b');
  const second = h.context.loadBook('book-c');
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].name, 'save');
  h.calls[0].resolve({revision: 7});
  await until(() => h.calls.length === 2, 'First selection did not begin loading');
  assert.equal(h.calls[1].name, 'load');
  assert.equal(h.calls[1].args.p_id, 'book-b');
  h.calls[1].resolve({payload: fixture('Book B'), revision: 2});
  await Promise.all([first, second]);
  assert.equal(h.calls.filter(call => call.name === 'load').length, 1);
  assert.equal(h.context.state().bookId, 'book-b');
  assert.equal(h.context.state().book.title, 'Book B');
});

test('first-load failure leaves editing disabled but its Retry action works', async () => {
  const h = harness({dirty: false, initialized: false, revision: 0});
  const opening = h.context.loadBook('book-b');
  await until(() => h.calls.length === 1, 'Initial load was not requested');
  h.calls[0].reject(new Error('Network unavailable'));
  await opening;
  assert.equal(h.context.state().busy, false);
  assert.equal(h.context.inputsDisabled, true);
  const retryAction = h.notices.at(-1).actions.find(([label]) => label === 'Try again');
  assert.ok(retryAction, 'Failure notice must provide Retry');
  const retry = retryAction[1]();
  await until(() => h.calls.length === 2, 'Retry was blocked after the first failure');
  h.calls[1].resolve({payload: fixture('Recovered'), revision: 3});
  await retry;
  assert.equal(h.context.state().initialized, true);
  assert.equal(h.context.state().book.title, 'Recovered');
  assert.equal(h.context.state().busy, false);
  assert.equal(h.context.inputsDisabled, false);
});

test('save conflict during switching preserves both recovery actions', async () => {
  const h = harness();
  const switching = h.context.loadBook('book-b');
  await until(() => h.calls.length === 1, 'Pending edits were not saved');
  h.calls[0].reject(Object.assign(new Error('Changed elsewhere'), {status: 409}));
  await switching;
  assert.deepEqual(Array.from(h.notices.at(-1).actions, ([label]) => label), [
    'Open cloud version', 'Save as new playbook',
  ]);
  assert.equal(h.context.state().bookId, 'old-id');
  assert.equal(h.context.state().conflict, true);
});

test('invalid cloud payload cannot change the active book identity', async () => {
  const h = harness({dirty: false});
  const switching = h.context.loadBook('book-b');
  await until(() => h.calls.length === 1, 'Load was not requested');
  h.calls[0].resolve({payload: {broken: true}, revision: 2});
  await switching;
  assert.equal(h.context.state().bookId, 'old-id');
  assert.equal(h.context.state().book.title, 'Original');
  assert.equal(h.context.state().revision, 6);
});
