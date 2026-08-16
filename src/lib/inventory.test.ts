import { describe, expect, it } from 'vitest'
import {
  canDeleteLocation,
  findItemsByName,
  getLocationPath,
  moveItemToLocation,
} from './inventory'
import type { InventoryItem, InventoryLocation } from './inventory'

const locations: InventoryLocation[] = [
  { id: 'room-1', name: 'Spavaća soba', parentId: null, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
  { id: 'cabinet-1', name: 'Ormar', parentId: 'room-1', createdAt: '2024-01-01', updatedAt: '2024-01-01' },
  { id: 'drawer-1', name: 'Leva strana', parentId: 'cabinet-1', createdAt: '2024-01-01', updatedAt: '2024-01-01' },
  { id: 'box-1', name: 'Fioka 3', parentId: 'drawer-1', createdAt: '2024-01-01', updatedAt: '2024-01-01' },
  { id: 'basement', name: 'Podrum', parentId: null, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
]

const items: InventoryItem[] = [
  { id: 'item-1', name: 'Laptop', note: 'Work laptop', locationId: 'box-1', createdAt: '2024-01-01', updatedAt: '2024-01-01' },
  { id: 'item-2', name: 'Kablovi', note: '', locationId: 'basement', createdAt: '2024-01-01', updatedAt: '2024-01-01' },
]

describe('inventory hierarchy', () => {
  it('builds a full path for arbitrary nested locations', () => {
    expect(getLocationPath(locations, 'box-1').map((location) => location.name)).toEqual([
      'Spavaća soba',
      'Ormar',
      'Leva strana',
      'Fioka 3',
    ])
  })

  it('blocks deleting a location that still has child locations or items', () => {
    expect(canDeleteLocation(locations, items, 'drawer-1')).toBe(false)
    expect(canDeleteLocation(locations, [{ ...items[0], locationId: 'room-1' }], 'room-1')).toBe(false)
    expect(canDeleteLocation(locations, items, 'basement')).toBe(false)
  })

  it('moves an item to another existing location', () => {
    const moved = moveItemToLocation(items, 'item-2', 'room-1', locations)
    expect(moved?.locationId).toBe('room-1')
    expect(moveItemToLocation(items, 'missing-item', 'room-1', locations)).toBeNull()
    expect(moveItemToLocation(items, 'item-2', 'missing-location', locations)).toBeNull()
  })

  it('finds global item search results with the full path', () => {
    const results = findItemsByName(items, locations, 'kabl')
    expect(results).toHaveLength(1)
    expect(results[0]).toMatchObject({
      item: { id: 'item-2', name: 'Kablovi' },
      locationPath: 'Podrum',
    })
  })
})
