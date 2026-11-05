// Refresh the pinned browser client and its browser polyfills without a runtime CDN dependency.
import { mkdir, writeFile } from 'node:fs/promises'
const seen = new Set()
async function vendor(path, filename) {
  if (seen.has(path)) return
  seen.add(path)
  const response = await fetch(`https://esm.sh${path}`, { signal: AbortSignal.timeout(20000) })
  if (!response.ok) throw new Error(`Unable to download ${path}: ${response.status}`)
  let source = await response.text()
  const imports = [...new Set([...source.matchAll(/(?:from\s*|import\s*)["'](\/node\/[^"']+)["']/g)].map(match => match[1]))]
  for (const dependency of imports) {
    const name = dependency.split('/').pop()
    await vendor(dependency, name)
    source = source.replaceAll(`"${dependency}"`, `"./${name}"`).replaceAll(`'${dependency}'`, `'./${name}'`)
  }
  await writeFile(new URL(`../assets/vendor/${filename}`, import.meta.url), source)
}
await mkdir(new URL('../assets/vendor/', import.meta.url), { recursive: true })
await vendor('/@netlify/identity@2.0.0/es2022/identity.bundle.mjs', 'identity.mjs')
console.log(`Vendored Identity browser client and ${seen.size - 1} dependencies.`)
