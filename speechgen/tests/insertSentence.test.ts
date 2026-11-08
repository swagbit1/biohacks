import assert from 'node:assert/strict'
import test from 'node:test'
import { insertGlideSentence } from '../lib/insertSentence'

test('inserts at the last cursor without deleting draft text', () => {
  assert.deepEqual(insertGlideSentence('Hello there.', 'my friend', 6), {
    ok: true, text: 'Hello my friend there.', caret: 16,
  })
  assert.deepEqual(insertGlideSentence('Hello.', 'Good morning'), {
    ok: true, text: 'Hello. Good morning', caret: 19,
  })
  assert.deepEqual(insertGlideSentence('Hello!', 'again', 5), {
    ok: true, text: 'Hello again!', caret: 11,
  })
})

test('rejects overlong insertions without returning a modified draft', () => {
  const draft = 'a'.repeat(3498)
  assert.deepEqual(insertGlideSentence(draft, 'hi'), { ok: false, remaining: 2 })
  assert.equal(insertGlideSentence(draft, 'a').ok, true)
})
