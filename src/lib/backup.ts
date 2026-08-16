import type Dexie from 'dexie'
import type { InventoryItem, InventoryLocation } from './inventory'

export const BACKUP_FORMAT_VERSION = 1

export type BackupData = {
  formatVersion: number
  exportedAt: string
  locations: InventoryLocation[]
  items: InventoryItem[]
}

const ensureString = (value: unknown, field: string): string => {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Invalid ${field}.`)
  }

  return value
}

const ensureOptionalString = (value: unknown, field: string): string | undefined => {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'string') {
    throw new Error(`Invalid ${field}.`)
  }

  return value
}

export const serializeBackup = (
  locations: InventoryLocation[],
  items: InventoryItem[],
): BackupData => ({
  formatVersion: BACKUP_FORMAT_VERSION,
  exportedAt: new Date().toISOString(),
  locations,
  items,
})

export const validateBackupData = (value: unknown): BackupData => {
  if (!value || typeof value !== 'object') {
    throw new Error('Backup file is not valid JSON.')
  }

  const backup = value as Record<string, unknown>

  if (backup.formatVersion !== BACKUP_FORMAT_VERSION) {
    throw new Error(`Unsupported backup format version: ${String(backup.formatVersion)}.`)
  }

  const exportedAt = ensureString(backup.exportedAt, 'exportedAt')
  const locationsValue = backup.locations
  const itemsValue = backup.items

  if (!Array.isArray(locationsValue)) {
    throw new Error('Locations array is missing or invalid.')
  }

  if (!Array.isArray(itemsValue)) {
    throw new Error('Items array is missing or invalid.')
  }

  const locations: InventoryLocation[] = locationsValue.map((locationValue, index) => {
    if (!locationValue || typeof locationValue !== 'object') {
      throw new Error(`Location ${index} is invalid.`)
    }

    const location = locationValue as Record<string, unknown>
    const parentId = location.parentId === null ? null : ensureOptionalString(location.parentId, `location ${index} parentId`)

    return {
      id: ensureString(location.id, `location ${index} id`),
      name: ensureString(location.name, `location ${index} name`),
      parentId: parentId ?? null,
      createdAt: ensureString(location.createdAt, `location ${index} createdAt`),
      updatedAt: ensureString(location.updatedAt, `location ${index} updatedAt`),
    }
  })

  const locationIds = new Set(locations.map((location) => location.id))
  if (locationIds.size !== locations.length) {
    throw new Error('Duplicate location IDs were found.')
  }

  for (const location of locations) {
    if (location.parentId && !locationIds.has(location.parentId)) {
      throw new Error(`Location parent reference is missing for "${location.name}".`)
    }
  }

  const visiting = new Set<string>()
  const visited = new Set<string>()

  const validateNoCycle = (locationId: string): void => {
    if (visiting.has(locationId)) {
      throw new Error('Location parent hierarchy contains a cycle.')
    }

    if (visited.has(locationId)) return
    visiting.add(locationId)

    const location = locations.find((candidate) => candidate.id === locationId)
    if (location?.parentId) {
      validateNoCycle(location.parentId)
    }

    visiting.delete(locationId)
    visited.add(locationId)
  }

  for (const location of locations) {
    validateNoCycle(location.id)
  }

  const items: InventoryItem[] = itemsValue.map((itemValue, index) => {
    if (!itemValue || typeof itemValue !== 'object') {
      throw new Error(`Item ${index} is invalid.`)
    }

    const item = itemValue as Record<string, unknown>
    const photoValue = item.photo
    const photo = photoValue === undefined || photoValue === null ? undefined : ensureOptionalString(photoValue, `item ${index} photo`)

    if (typeof photo === 'string' && !photo.startsWith('data:image/')) {
      throw new Error(`Item ${index} photo is not a valid data URL.`)
    }

    return {
      id: ensureString(item.id, `item ${index} id`),
      name: ensureString(item.name, `item ${index} name`),
      note: item.note === undefined || item.note === null ? undefined : ensureOptionalString(item.note, `item ${index} note`),
      locationId: ensureString(item.locationId, `item ${index} locationId`),
      createdAt: ensureString(item.createdAt, `item ${index} createdAt`),
      updatedAt: ensureString(item.updatedAt, `item ${index} updatedAt`),
      photo,
    }
  })

  const itemIds = new Set(items.map((item) => item.id))
  if (itemIds.size !== items.length) {
    throw new Error('Duplicate item IDs were found.')
  }

  for (const item of items) {
    if (!locationIds.has(item.locationId)) {
      throw new Error(`Item "${item.name}" references a missing location.`)
    }
  }

  return {
    formatVersion: BACKUP_FORMAT_VERSION,
    exportedAt,
    locations,
    items,
  }
}

export const restoreBackupData = async (
  db: Dexie,
  backup: BackupData,
): Promise<void> => {
  const validated = validateBackupData(backup)

  await db.transaction('rw', db.table('locations'), db.table('items'), async () => {
    const locationTable = db.table('locations')
    const itemTable = db.table('items')

    await locationTable.clear()
    await itemTable.clear()
    await locationTable.bulkPut(validated.locations)
    await itemTable.bulkPut(validated.items)
  })
}

export const compressImageFile = async (file: File): Promise<string> => {
  if (!file.type.startsWith('image/')) {
    throw new Error('Selected file is not an image.')
  }

  const objectUrl = URL.createObjectURL(file)

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const imageElement = new Image()
      imageElement.onload = () => resolve(imageElement)
      imageElement.onerror = () => reject(new Error('Image could not be decoded.'))
      imageElement.src = objectUrl
    })

    const maxDimension = 1600
    const scale = Math.min(1, maxDimension / Math.max(image.width, image.height))
    const width = Math.max(1, Math.round(image.width * scale))
    const height = Math.max(1, Math.round(image.height * scale))

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height

    const context = canvas.getContext('2d')
    if (!context) {
      throw new Error('Canvas is not supported in this browser.')
    }

    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, width, height)
    context.drawImage(image, 0, 0, width, height)

    return canvas.toDataURL('image/jpeg', 0.8)
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}
