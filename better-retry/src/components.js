import React from 'react'

const h = React.createElement
const box = { border: '1px solid var(--dsw-alias-outline-primary, currentColor)', borderRadius: 8, padding: 12, marginTop: 10, minWidth: 0 }
const row = { display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }
const field = { display: 'block', width: '100%', boxSizing: 'border-box', padding: 6, color: 'inherit', background: 'transparent' }
const codeStyle = { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', display: 'block', margin: '6px 0' }
const button = (label, onClick, disabled = false) => h('button', { type: 'button', onClick, disabled, style: { cursor: disabled ? 'default' : 'pointer', padding: '4px 8px' } }, label)
const detail = (label, content) => h('div', null, h('strong', null, label), h('code', { style: codeStyle }, content))
const errorText = error => error instanceof Error ? error.message : String(error)

/** Private interaction state; all decisions and persistence are made on Host. */
export function PatternEditor({ t, call, seed, onSaved, onClose }) {
  const [message, setMessage] = React.useState(seed?.message ?? '')
  const [code, setCode] = React.useState(seed?.code ?? 'PI_AI_ERROR')
  const [provider, setProvider] = React.useState('*')
  const [pattern, setPattern] = React.useState('')
  const [mode, setMode] = React.useState('exact')
  const [preview, setPreview] = React.useState(null)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState('')
  const request = (nextPattern = pattern, nextMode = mode) => ({ message, code, provider, mode: nextMode, ...(nextPattern ? { pattern: nextPattern } : {}) })
  const runPreview = async (nextPattern = pattern, nextMode = mode) => {
    setBusy(true); setError(''); setPreview(null)
    try {
      const result = await call('preview', request(nextPattern, nextMode))
      setPattern(result.pattern); setPreview(result)
    } catch (error) { setError(errorText(error)) }
    finally { setBusy(false) }
  }
  // Changing an input invalidates confirmation; a stale preview can never authorize a new pattern.
  const edit = setter => event => { setter(event.target.value); setPreview(null) }
  const save = async () => {
    setBusy(true); setError('')
    try { await onSaved(await call('add', request())) }
    catch (error) { setError(errorText(error)) }
    finally { setBusy(false) }
  }
  return h('section', { style: box, 'aria-label': t('preview') },
    h('label', null, t('message'), h('textarea', { value: message, rows: 3, maxLength: 4096, style: field, onChange: event => { setMessage(event.target.value); setPattern(''); setPreview(null) } })),
    h('label', null, t('code'), h('input', { value: code, style: field, onChange: edit(setCode) })),
    h('label', null, t('provider'), h('input', { value: provider, style: field, onChange: edit(setProvider) })),
    h('label', null, t('mode'), h('select', { value: mode, style: field, onChange: edit(setMode) },
      h('option', { value: 'exact' }, t('exact')), h('option', { value: 'contains' }, t('contains')))),
    h('label', null, t('pattern'), h('textarea', { value: pattern, rows: 2, maxLength: 4096, style: field, onChange: edit(setPattern) })),
    h('div', { style: row }, button(busy ? t('loading') : t('preview'), () => runPreview(), busy || !message.trim()), button(t('cancel'), onClose, busy)),
    error && h('p', { role: 'alert' }, error),
    preview && h('div', { 'aria-live': 'polite' },
      detail(t('normalized'), preview.normalized),
      h('p', null, preview.reason ? t(preview.reason) : t(preview.valid ? 'valid' : 'invalid')),
      h('p', null, preview.existing ? `${t('matched')}: ${preview.existing.pattern}` : t('noMatch')),
      preview.suggestion && h('div', null, detail(t('suggestion'), preview.suggestion), button(t('useSuggestion'), () => {
        setMode('contains'); setPattern(preview.suggestion); runPreview(preview.suggestion, 'contains')
      }, busy)),
      h('p', null, t('samples')),
      preview.matches.length ? h('ul', null, ...preview.matches.map((item, index) => h('li', { key: index }, h('code', { style: codeStyle }, item.message)))) : h('p', null, t('noSamples')),
      h('p', null, t('future')),
      button(t('save'), save, busy || !preview.valid),
    ),
  )
}

export function RuleList({ t, rules, busy, mutate }) {
  return h('div', null, ...rules.map(rule => h('article', { key: rule.id, style: box },
    h('div', { style: row }, h('strong', null, t(rule.builtin ? 'builtin' : 'custom')), h('span', null, t(rule.enabled ? 'enabled' : 'disabled'))),
    h('code', { style: codeStyle }, rule.pattern),
    h('p', null, `${t(rule.mode)} · ${rule.code} · ${rule.provider}`),
    h('div', { style: row },
      button(t(rule.enabled ? 'disable' : 'enable'), () => mutate('toggle', { id: rule.id, enabled: !rule.enabled }), busy),
      !rule.builtin && button(t('delete'), () => mutate('delete', { id: rule.id }), busy),
    ),
  )))
}

export function RuleManager({ t, call }) {
  const [data, setData] = React.useState(null)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState('')
  const [notice, setNotice] = React.useState('')
  const [adding, setAdding] = React.useState(false)
  const [message, setMessage] = React.useState('')
  const [provider, setProvider] = React.useState('*')
  const [testResult, setTestResult] = React.useState(null)
  const mutate = async (endpoint, payload = {}) => {
    setBusy(true); setError(''); setTestResult(null)
    try { const result = await call(endpoint, payload); setData(result); setNotice(endpoint === 'list' ? '' : t('updated')) }
    catch (error) { setError(errorText(error)) }
    finally { setBusy(false) }
  }
  React.useEffect(() => {
    let active = true
    call('list').then(result => { if (active) setData(result) }, error => { if (active) setError(errorText(error)) })
    return () => { active = false }
  }, [call])
  const test = async () => {
    setBusy(true); setError('')
    try { setTestResult(await call('test', { message, code: 'PI_AI_ERROR', provider })) }
    catch (error) { setError(errorText(error)) }
    finally { setBusy(false) }
  }
  return h('section', { style: { minWidth: 0, padding: 8 }, 'aria-label': t('section') },
    h('h2', null, t('section')), h('p', null, t('description')), h('p', null, t('sampleNote')),
    h('div', { style: row }, button(t('refresh'), () => mutate('list'), busy), button(t('manual'), () => setAdding(true), busy)),
    error && h('p', { role: 'alert' }, `${t('error')}: ${error}`), notice && h('p', { role: 'status' }, notice),
    adding && h(PatternEditor, { t, call, onClose: () => setAdding(false), onSaved: result => { setData(result); setAdding(false); setNotice(t('saved')); setTestResult(null) } }),
    data ? h(RuleList, { t, rules: data.rules, busy, mutate }) : !error && h('p', null, t('loading')),
    h('section', { style: box }, h('h3', null, t('testTitle')),
      h('label', null, t('message'), h('textarea', { value: message, rows: 3, style: field, maxLength: 4096, onChange: event => { setMessage(event.target.value); setTestResult(null) } })),
      h('label', null, t('provider'), h('input', { value: provider, style: field, onChange: event => { setProvider(event.target.value); setTestResult(null) } })),
      button(t('test'), test, busy || !message.trim()),
      testResult && h('div', { role: 'status' }, detail(t('normalized'), testResult.normalized),
        h('p', null, testResult.reason ? t(testResult.reason) : testResult.existing ? `${t('matched')}: ${testResult.existing.pattern}` : t('noMatch'))),
    ),
  )
}

export function BetterTurnError({ node, t, call }) {
  const [editing, setEditing] = React.useState(false)
  const [managing, setManaging] = React.useState(false)
  const [saved, setSaved] = React.useState(false)
  const data = node.data
  return h('div', { style: { overflowWrap: 'anywhere', margin: '8px 0' } },
    h('div', { style: row }, h('strong', { style: { color: 'var(--dsw-alias-state-error-primary)' } }, t('title')),
      h('span', null, data.message), h('code', null, data.code),
      button(t('add'), () => { setEditing(true); setSaved(false) }),
      button(t('manage'), () => setManaging(value => !value))),
    saved && h('p', { role: 'status' }, t('saved')),
    editing && h(PatternEditor, { t, call, seed: data, onClose: () => setEditing(false), onSaved: () => { setEditing(false); setSaved(true) } }),
    managing && h(RuleManager, { t, call }),
  )
}
