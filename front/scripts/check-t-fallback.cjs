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

const en = collectKeys(JSON.parse(fs.readFileSync(path.join(__dirname, '..','src','locales','en','translation.json'),'utf8')))
const fr = collectKeys(JSON.parse(fs.readFileSync(path.join(__dirname, '..','src','locales','fr','translation.json'),'utf8')))
const keys = new Set([...en, ...fr])

function listFiles(dir, ext) {
  const res = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name)
    if (entry.isDirectory()) res.push(...listFiles(p, ext))
    else if (entry.isFile() && p.endsWith(ext)) res.push(p)
  }
  return res
}

const files = listFiles(path.join(__dirname,'..','src'), '.tsx')
const missing = []

const re = /t\(\s*['\"]([^'\"]+)['\"](?:\s*,\s*['\"][^'\"]+['\"])\s*\)/g

for (const f of files) {
  const content = fs.readFileSync(f,'utf8')
  let m
  while ((m = re.exec(content)) !== null) {
    const key = m[1]
    if (!keys.has(key)) missing.push({file:f,key})
  }
}

if (missing.length===0) console.log('All fallback keys are present')
else console.log('Missing keys:', missing)
