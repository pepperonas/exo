import { test } from 'node:test'
import assert from 'node:assert/strict'

import { ansiToHtml, sgr, trimCapture, xterm256 } from '../tools/screens'

test('plain text is escaped and passes through', () => {
  assert.equal(ansiToHtml('a <b> & c'), 'a &lt;b&gt; &amp; c')
})

test('SGR colours become spans: 16, 256 and true colour', () => {
  assert.equal(ansiToHtml('\x1b[31mred\x1b[0m'), '<span style="color:#ff7b72">red</span>')
  assert.match(ansiToHtml('\x1b[38;5;196mx'), /color:rgb\(255,0,0\)/)
  assert.match(ansiToHtml('\x1b[38;2;1;2;3mx'), /color:rgb\(1,2,3\)/)
  assert.match(ansiToHtml('\x1b[48;5;240mx'), /background:rgb\(88,88,88\)/)
})

test('reset, bold, dim and inverse', () => {
  assert.deepEqual(sgr({ fg: '#fff', bold: true }, [0]), {})
  assert.deepEqual(sgr({}, [1, 2]), { bold: true, dim: true })
  assert.match(ansiToHtml('\x1b[7mx'), /color:#0d1117;background:#e6edf3/)
})

test('cursor and OSC escapes are dropped, not printed', () => {
  assert.equal(ansiToHtml('\x1b[2Ka\x1b]0;title\x07b'), 'ab')
})

test('the 256-colour cube and grey ramp', () => {
  assert.equal(xterm256(16), 'rgb(0,0,0)')
  assert.equal(xterm256(231), 'rgb(255,255,255)')
  assert.equal(xterm256(232), 'rgb(8,8,8)')
})

test('trailing blank lines (even with colour codes) are trimmed', () => {
  assert.equal(trimCapture('a\nb\n\x1b[0m  \n\n'), 'a\nb')
})
