import { test } from 'node:test'
import assert from 'node:assert/strict'
import { extractMedia, imageUrl, isVideo, pageToResolve } from '../src/renderer/src/lib/linkPreview'

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

test('new imgur slug links, mp4 and giphy', () => {
  assert.equal(imageUrl('https://imgur.com/funny-cat-aBc123X'), 'https://i.imgur.com/aBc123X.jpg')
  assert.equal(imageUrl('https://i.imgur.com/aBc123X.mp4'), 'https://i.imgur.com/aBc123X.mp4')
  assert.equal(isVideo('https://i.imgur.com/aBc123X.mp4'), true)
  assert.equal(imageUrl('https://giphy.com/gifs/cat-dance-3o7TKSjRrfIPjeiVyM'), 'https://media.giphy.com/media/3o7TKSjRrfIPjeiVyM/giphy.gif')
})

test('albums, galleries and tenor are resolved via their page', () => {
  assert.equal(pageToResolve('https://imgur.com/a/aBc123X'), 'https://imgur.com/a/aBc123X')
  assert.equal(pageToResolve('https://imgur.com/gallery/some-title-aBc123X'), 'https://imgur.com/gallery/some-title-aBc123X')
  assert.equal(pageToResolve('https://tenor.com/view/cat-dance-gif-12345'), 'https://tenor.com/view/cat-dance-gif-12345')
  assert.equal(pageToResolve('https://example.com/a/b'), null)
})

test('og:video wins over og:image, imgur ?fb crop is removed', () => {
  assert.equal(extractMedia('<meta property="og:image" content="https://i.imgur.com/x.jpeg?fb">'), 'https://i.imgur.com/x.jpeg')
  assert.equal(extractMedia('<meta property="og:image" content="https://i.imgur.com/x.jpeg"><meta property="og:video" content="https://i.imgur.com/x.mp4">'), 'https://i.imgur.com/x.mp4')
  assert.equal(extractMedia('<meta property="og:image" content="javascript:x">'), null)
})
