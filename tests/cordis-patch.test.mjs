import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

const PATCH_PATH = fileURLToPath(new URL('../cordis.patch.yml', import.meta.url))

describe('cordis.patch.yml verification', () => {
  it('contains valid insert directive pointing to dsh-customized plugin', () => {
    const raw = readFileSync(PATCH_PATH, 'utf8')
    assert.ok(raw.includes('- insert:'), 'Patch must include - insert: directive')
    assert.ok(raw.includes('- id: dsh-customized'), 'Patch must include - id: dsh-customized')
    assert.ok(raw.includes('name: ./lib/index.js'), 'Patch must reference ./lib/index.js')
  })
})
