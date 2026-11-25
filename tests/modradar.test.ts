import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lookalikeOf } from '../src/renderer/src/lib/lookalike'

test('names imitating the channel are caught', () => {
  assert.equal(lookalikeOf('xqc_official', 'xqc'), 'xqc')
  assert.equal(lookalikeOf('x0c', 'xoc'), 'xoc')
  assert.equal(lookalikeOf('realxqc', 'xqc'), 'xqc')
  assert.equal(lookalikeOf('forsen_giveaway', 'forsen'), 'forsen')
  assert.equal(lookalikeOf('f0rsen', 'forsen'), 'forsen')
})

test('fans with the channel name are not flagged', () => {
  assert.equal(lookalikeOf('xqc', 'xqc'), null)
  assert.equal(lookalikeOf('xqcfan123', 'xqc'), null)
  assert.equal(lookalikeOf('ilovexqc', 'xqc'), null)
  assert.equal(lookalikeOf('nicoaza', 'xqc'), null)
  assert.equal(lookalikeOf('xqc123', 'xqc'), null)
})
