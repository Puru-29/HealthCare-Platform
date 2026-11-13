export function withLocation(path: string, location: string | null): string {
  if (!location || path.startsWith('tel:')) return path

  const [pathname, query = ''] = path.split('?')
  const params = new URLSearchParams(query)
  params.set('location', location)
  return `${pathname}?${params.toString()}`
}
