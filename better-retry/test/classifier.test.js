import assert from 'node:assert/strict'
import test from 'node:test'
import { createClassifier, commonStableFragment, normalizeMessage } from '../src/classifier.js'

test('normalizes volatile request ids and matches the pending-request rule', () => {
  const classifier = createClassifier()
  assert.equal(normalizeMessage('unknown: Too many pending requests, please retry later (request id: abc123)'), 'too many pending requests, please retry later')
  assert.equal(classifier.classify('unknown: Too many pending requests, please retry later (request id: another-id)'), true)
  assert.equal(classifier.classify('server_error: Our servers are currently overloaded. Please try again later.'), true)
  assert.equal(classifier.classify('invalid request body'), false)
})

test('derives a stable common fragment from multiple samples', () => {
  assert.equal(commonStableFragment([
    'unknown: Gateway overloaded, please retry later (request id: a1)',
    'unknown: Gateway overloaded, please retry later (request id: b2)',
  ]), 'gateway overloaded, please retry later')
})

test('uses the common fragment of saved samples as one user rule', () => {
  const classifier = createClassifier([commonStableFragment([
    'gateway overloaded, please retry later (request id: a1)',
    'gateway overloaded, please retry later (request id: b2)',
  ])])
  assert.equal(classifier.classify('gateway overloaded, please retry later (request id: c3)'), true)
})

test('does not accept short generic fragments', () => {
  const classifier = createClassifier()
  classifier.add(['please retry later'])
  assert.equal(classifier.classify('please retry later'), false)
})
