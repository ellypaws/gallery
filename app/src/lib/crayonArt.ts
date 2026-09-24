import type { CSSProperties } from 'react'

const files = import.meta.glob<string>('../assets/crayon/*.webp', { eager: true, import: 'default', query: '?url' })

const art = new Map(
  Object.entries(files).map(([path, url]) => [path.slice(path.lastIndexOf('/') + 1, -'.webp'.length), url]),
)

export function crayonArt(name: string): string {
  const url = art.get(name)
  if (!url) {
    throw new Error(`missing crayon drawing: ${name}`)
  }
  return url
}

export type CSSVars = CSSProperties & Record<`--${string}`, string | number>
