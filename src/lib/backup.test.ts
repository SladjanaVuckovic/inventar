import { describe, expect, it } from 'vitest'
import { BACKUP_FORMAT_VERSION, serializeBackup, validateBackupData } from './backup'
import type { InventoryItem, InventoryLocation } from './inventory'

const validLocations: InventoryLocation[] = [
  { id: 'room-1', name: 'Bedroom', parentId: null, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
  { id: 'cabinet-1', name: 'Cabinet', parentId: 'room-1', createdAt: '2024-01-01', updatedAt: '2024-01-01' },
]

const validItems: InventoryItem[] = [
  {
    id: 'item-1',
    name: 'Laptop',
    note: 'Work laptop',
    photo: 'data:image/jpeg;base64,AAAA',
    locationId: 'cabinet-1',
    createdAt: '2024-01-01',
    updatedAt: '2024-01-01',
  },
]

describe('backup validation', () => {
  it('accepts valid backup data', () => {
    const backup = serializeBackup(validLocations, validItems)
    expect(validateBackupData(backup)).toMatchObject({
      formatVersion: BACKUP_FORMAT_VERSION,
      locations: validLocations,
      items: validItems,
    })
  })

  it('rejects missing item location references', () => {
    expect(() =>
      validateBackupData({
        formatVersion: BACKUP_FORMAT_VERSION,
        exportedAt: '2024-01-01',
        locations: validLocations,
        items: [{ ...validItems[0], locationId: 'missing-location' }],
      }),
    ).toThrow(/missing location/i)
  })

  it('rejects cyclic location hierarchy', () => {
    const cyclicLocations: InventoryLocation[] = [
      { id: 'a', name: 'A', parentId: 'b', createdAt: '2024-01-01', updatedAt: '2024-01-01' },
      { id: 'b', name: 'B', parentId: 'a', createdAt: '2024-01-01', updatedAt: '2024-01-01' },
    ]

    expect(() =>
      validateBackupData({
        formatVersion: BACKUP_FORMAT_VERSION,
        exportedAt: '2024-01-01',
        locations: cyclicLocations,
        items: [],
      }),
    ).toThrow(/cycle/i)
  })
})
