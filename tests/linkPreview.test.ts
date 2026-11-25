import { test } from 'node:test'
import assert from 'node:assert/strict'
import { imageUrl } from '../src/renderer/src/lib/linkPreview'

test('imgur page links become direct images', () => {
  assert.equal(imageUrl('https://imgur.com/aBc123X'), 'https://i.imgur.com/aBc123X.jpg')
  assert.equal(imageUrl('https://i.imgur.com/aBc123X.png'), 'https://i.imgur.com/aBc123X.png')
  assert.equal(imageUrl('https://i.imgur.com/aBc123X.gifv'), 'https://i.imgur.com/aBc123X.gif')
})

test('imgur albums and galleries are not previewed', () => {
  assert.equal(imageUrl('https://imgur.com/a/aBc123X'), null)
  assert.equal(imageUrl('https://imgur.com/gallery/aBc123X'), null)
})

test('7tv emote pages show the emote', () => {
  assert.equal(imageUrl('https://7tv.app/emotes/01GNC4JX0R0009JQ8KP7FW0K5R'), 'https://cdn.7tv.app/emote/01GNC4JX0R0009JQ8KP7FW0K5R/2x.webp')
})

test('direct image files anywhere', () => {
  assert.equal(imageUrl('https://example.com/cat.JPG?x=1'), 'https://example.com/cat.JPG?x=1')
  assert.equal(imageUrl('https://example.com/page.html'), null)
  assert.equal(imageUrl('javascript:alert(1)'), null)
  assert.equal(imageUrl('not a url'), null)
})
