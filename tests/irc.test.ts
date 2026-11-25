import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseIrc } from '../src/renderer/src/lib/irc'
import { parseEmoteTag, tokenize } from '../src/renderer/src/lib/tokenize'

test("PRIVMSG with tags", () => {
  const m = parseIrc('@badge-info=;badges=moderator/1,subscriber/12;color=#FF0000;display-name=Foo;emotes=25:0-4,12-16;first-msg=1;id=abc;room-id=123;tmi-sent-ts=1700000000000;user-id=42 :foo!foo@foo.tmi.twitch.tv PRIVMSG #papaplatte :Kappa hallo Kappa du\\s')!
  assert.equal(m.command, 'PRIVMSG')
  assert.equal(m.channel, 'papaplatte')
  assert.equal(m.nick, 'foo')
  assert.equal(m.tags['display-name'], 'Foo')
  assert.equal(m.tags['first-msg'], '1')
  assert.equal(m.trailing, 'Kappa hallo Kappa du\\s')
})

test("tag escapes", () => {
  const m = parseIrc('@system-msg=5\\sGeschenk-Abos\\:\\sDanke! :tmi.twitch.tv USERNOTICE #x')!
  assert.equal(m.tags['system-msg'], '5 Geschenk-Abos; Danke!')
  assert.equal(m.params.length, 1)
})

test('JOIN / PART / NAMES', () => {
  assert.equal(parseIrc(':lurker1!lurker1@lurker1.tmi.twitch.tv JOIN #chan')!.nick, 'lurker1')
  const n = parseIrc(':me.tmi.twitch.tv 353 me = #chan :a b c')!
  assert.equal(n.command, '353')
  assert.equal(n.channel, 'chan')
  assert.deepEqual(n.trailing.split(' '), ['a', 'b', 'c'])
  const p = parseIrc(':x!x@x.tmi.twitch.tv PART #chan')!
  assert.equal(p.command, 'PART')
})

test("CLEARCHAT with and without target", () => {
  const a = parseIrc('@ban-duration=600 :tmi.twitch.tv CLEARCHAT #chan :baduser')!
  assert.equal(a.params.length, 2)
  assert.equal(a.trailing, 'baduser')
  const b = parseIrc(':tmi.twitch.tv CLEARCHAT #chan')!
  assert.equal(b.params.length, 1)
})

test('PING', () => {
  const m = parseIrc('PING :tmi.twitch.tv')!
  assert.equal(m.command, 'PING')
  assert.equal(m.trailing, 'tmi.twitch.tv')
})

test("emote tag and tokenizer use code points", () => {
  const refs = parseEmoteTag('25:3-7/1902:9-13')
  assert.equal(refs.length, 2)
  const toks = tokenize('😀 hKappa Keepo www.twitch.tv @Foo, hi', parseEmoteTag('25:3-7'), undefined, false)
  const kinds = toks.map((t) => t.t)
  assert.ok(kinds.includes('emote'))
  assert.ok(kinds.includes('link'))
  assert.ok(kinds.includes('mention'))
  const em = toks.find((t) => t.t === 'emote')!
  assert.equal(em.t === 'emote' && em.e.name, 'Kappa')
})
