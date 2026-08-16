import Dexie, { type Table } from 'dexie'
import type { InventoryItem, InventoryLocation } from './inventory'

class InventoryDatabase extends Dexie {
  locations!: Table<InventoryLocation, string>
  items!: Table<InventoryItem, string>

  constructor() {
    super('inventar-db')

    this.version(1).stores({
      locations: '&id, name, parentId, createdAt, updatedAt',
      items: '&id, name, locationId, createdAt, updatedAt',
    })

    this.version(2).stores({
      locations: '&id, name, parentId, createdAt, updatedAt',
      items: '&id, name, locationId, createdAt, updatedAt, photo',
    })
  }
}

export const db = new InventoryDatabase()
