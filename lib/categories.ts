// Stable chart color (1-5) for a category name, so the donut/labels stay
// consistent as categories are added/removed.
export function categoryColor(name: string | null | undefined): string {
  if (!name) return "var(--chart-5)"
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0
  }
  return `var(--chart-${(hash % 5) + 1})`
}
