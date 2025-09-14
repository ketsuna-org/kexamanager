const fs = require('fs')
const path = require('path')

function collectKeys(obj, prefix = '') {
  let keys = []
  for (const k of Object.keys(obj)) {
    const newPrefix = prefix ? `${prefix}.${k}` : k
    if (obj[k] && typeof obj[k] === 'object' && !Array.isArray(obj[k])) {
      keys = keys.concat(collectKeys(obj[k], newPrefix))
    } else {
      keys.push(newPrefix)
    }
  }
  return keys
}

function compare(aPath, bPath) {
  const a = JSON.parse(fs.readFileSync(aPath, 'utf8'))
  const b = JSON.parse(fs.readFileSync(bPath, 'utf8'))
  const aKeys = new Set(collectKeys(a))
  const bKeys = new Set(collectKeys(b))
  const missingInB = [...aKeys].filter(k => !bKeys.has(k))
  const missingInA = [...bKeys].filter(k => !aKeys.has(k))
  return { missingInB, missingInA }
}

const pairs = [
  [
    'src/locales/en/translation.json',
    'locales/en/translation.json'
  ],
  [
    'src/locales/fr/translation.json',
    'locales/fr/translation.json'
  ]
]

for (const [a,b] of pairs) {
  const r = compare(path.join(__dirname, '..', a), path.join(__dirname, '..', b))
  console.log('\nComparing', a, '->', b)
  console.log(' Missing in', b, ':', r.missingInB)
  console.log(' Missing in', a, ':', r.missingInA)
}
