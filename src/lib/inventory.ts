export type InventoryLocation = {
  id: string
  name: string
  parentId: string | null
  createdAt: string
  updatedAt: string
}

export type InventoryItem = {
  id: string
  name: string
  note?: string
  photo?: string
  locationId: string
  createdAt: string
  updatedAt: string
}

export type LocationPathEntry = {
  id: string
  name: string
  parentId: string | null
}

export const createStableId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }

  return `inv-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export const getLocationPath = (
  locations: InventoryLocation[],
  locationId: string | null,
): LocationPathEntry[] => {
  if (!locationId) return []

  const byId = new Map(locations.map((location) => [location.id, location]))
  const path: LocationPathEntry[] = []
  let current: InventoryLocation | null | undefined = byId.get(locationId)

  while (current) {
    path.unshift({ id: current.id, name: current.name, parentId: current.parentId })
    current = current.parentId ? (byId.get(current.parentId) ?? null) : null
  }

  return path
}

export const getNodeChildren = (
  locations: InventoryLocation[],
  parentId: string | null,
): InventoryLocation[] =>
  locations.filter((location) => location.parentId === parentId)

export const canDeleteLocation = (
  locations: InventoryLocation[],
  items: InventoryItem[],
  locationId: string,
): boolean => {
  const hasChildLocations = locations.some((location) => location.parentId === locationId)
  const hasItems = items.some((item) => item.locationId === locationId)

  return !hasChildLocations && !hasItems
}

export const moveItemToLocation = (
  items: InventoryItem[],
  itemId: string,
  targetLocationId: string,
  locations: InventoryLocation[],
): InventoryItem | null => {
  const itemIndex = items.findIndex((item) => item.id === itemId)
  if (itemIndex === -1) return null

  const targetExists = locations.some((location) => location.id === targetLocationId)
  if (!targetExists) return null

  return {
    ...items[itemIndex],
    locationId: targetLocationId,
    updatedAt: new Date().toISOString(),
  }
}

export const findItemsByName = (
  items: InventoryItem[],
  locations: InventoryLocation[],
  query: string,
): Array<{ item: InventoryItem; locationPath: string }> => {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) return []

  return items
    .filter((item) => item.name.toLowerCase().includes(normalizedQuery))
    .map((item) => {
      const path = getLocationPath(locations, item.locationId)
      const locationName = path.map((location) => location.name).join(' → ') || 'Unknown location'

      return {
        item,
        locationPath: locationName,
      }
    })
}
