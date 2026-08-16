import { useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import './App.css'
import { db } from './lib/db'
import { compressImageFile, serializeBackup, validateBackupData } from './lib/backup'
import {
  canDeleteLocation,
  createStableId,
  findItemsByName,
  getLocationPath,
  getNodeChildren,
  moveItemToLocation,
} from './lib/inventory'
import type { InventoryItem } from './lib/inventory'

function App() {
  const [currentLocationId, setCurrentLocationId] = useState<string | null>(null)
  const [locationName, setLocationName] = useState('')
  const [searchText, setSearchText] = useState('')
  const [renameLocationId, setRenameLocationId] = useState<string | null>(null)
  const [renameLocationValue, setRenameLocationValue] = useState('')
  const [itemName, setItemName] = useState('')
  const [itemNote, setItemNote] = useState('')
  const [itemPhoto, setItemPhoto] = useState<string | undefined>(undefined)
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [editingItemName, setEditingItemName] = useState('')
  const [editingItemNote, setEditingItemNote] = useState('')
  const [editingItemLocationId, setEditingItemLocationId] = useState<string>('')
  const [editingItemPhoto, setEditingItemPhoto] = useState<string | undefined>(undefined)
  const [showSettings, setShowSettings] = useState(false)
  const [showLocationForm, setShowLocationForm] = useState(false)
  const [showItemForm, setShowItemForm] = useState(false)
  const [openLocationMenuId, setOpenLocationMenuId] = useState<string | null>(null)
  const importInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    const closeLocationMenu = () => setOpenLocationMenuId(null)

    document.addEventListener('click', closeLocationMenu)
    return () => document.removeEventListener('click', closeLocationMenu)
  }, [])

  const locationsQuery = useLiveQuery(
    () => db.locations.orderBy('updatedAt').reverse().toArray(),
    [],
  )
  const itemsQuery = useLiveQuery(
    () => db.items.orderBy('updatedAt').reverse().toArray(),
    [],
  )

  const locations = useMemo(() => locationsQuery ?? [], [locationsQuery])
  const items = useMemo(() => itemsQuery ?? [], [itemsQuery])

  const currentLocation = currentLocationId
    ? locations.find((location) => location.id === currentLocationId) ?? null
    : null

  const breadcrumbs = useMemo(
    () => getLocationPath(locations, currentLocationId),
    [locations, currentLocationId],
  )

  const childLocations = useMemo(
    () => getNodeChildren(locations, currentLocationId),
    [locations, currentLocationId],
  )

  const currentItems = useMemo(
    () => items.filter((item) => item.locationId === currentLocationId),
    [items, currentLocationId],
  )

  const searchResults = useMemo(
    () => findItemsByName(items, locations, searchText),
    [items, locations, searchText],
  )

  const handlePhotoFile = async (
    file: File | null,
    onApply: (dataUrl: string | undefined) => void,
  ) => {
    if (!file) return

    try {
      const compressed = await compressImageFile(file)
      onApply(compressed)
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Could not process the selected image.')
    }
  }

  const handleAddLocation = async (event: React.FormEvent) => {
    event.preventDefault()

    const trimmedName = locationName.trim()
    if (!trimmedName) return

    const now = new Date().toISOString()

    await db.locations.put({
      id: createStableId(),
      name: trimmedName,
      parentId: currentLocationId,
      createdAt: now,
      updatedAt: now,
    })

    setLocationName('')
    setShowLocationForm(false)
  }

  const handleRenameLocation = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!renameLocationId) return

    const trimmedName = renameLocationValue.trim()
    if (!trimmedName) return

    const location = locations.find((candidate) => candidate.id === renameLocationId)
    if (!location) return

    await db.locations.update(renameLocationId, {
      name: trimmedName,
      updatedAt: new Date().toISOString(),
    })

    setRenameLocationId(null)
    setRenameLocationValue('')
  }

  const handleDeleteLocation = async (locationId: string) => {
    const location = locations.find((candidate) => candidate.id === locationId)
    if (!location) return

    if (!canDeleteLocation(locations, items, locationId)) {
      window.alert('This location is not empty. Delete its child locations and items first.')
      return
    }

    if (!window.confirm(`Delete "${location.name}"?`)) return

    await db.locations.delete(locationId)

    if (currentLocationId === locationId) {
      setCurrentLocationId(location.parentId)
    }
  }

  const handleAddItem = async (event: React.FormEvent) => {
    event.preventDefault()

    if (!currentLocationId) {
      window.alert('Create or open a location before adding an item.')
      return
    }

    const trimmedName = itemName.trim()
    if (!trimmedName) return

    const now = new Date().toISOString()

    await db.items.put({
      id: createStableId(),
      name: trimmedName,
      note: itemNote.trim() || undefined,
      photo: itemPhoto || undefined,
      locationId: currentLocationId,
      createdAt: now,
      updatedAt: now,
    })

    setItemName('')
    setItemNote('')
    setItemPhoto(undefined)
    setShowItemForm(false)
  }

  const beginEditItem = (item: InventoryItem) => {
    setEditingItemId(item.id)
    setEditingItemName(item.name)
    setEditingItemNote(item.note ?? '')
    setEditingItemLocationId(item.locationId)
    setEditingItemPhoto(item.photo ?? undefined)
  }

  const handleSaveItem = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!editingItemId) return

    const trimmedName = editingItemName.trim()
    if (!trimmedName) return

    const candidate = moveItemToLocation(
      items,
      editingItemId,
      editingItemLocationId,
      locations,
    )

    if (!candidate) {
      window.alert('The target location is invalid or no longer exists.')
      return
    }

    const updatedItem: InventoryItem = {
      ...candidate,
      name: trimmedName,
      note: editingItemNote.trim() || undefined,
      photo: editingItemPhoto || undefined,
    }

    await db.items.put(updatedItem)
    setEditingItemId(null)
    setEditingItemName('')
    setEditingItemNote('')
    setEditingItemLocationId('')
    setEditingItemPhoto(undefined)
  }

  const handleDeleteItem = async (itemId: string) => {
    const item = items.find((candidate) => candidate.id === itemId)
    if (!item) return

    if (!window.confirm(`Delete "${item.name}"?`)) return

    await db.items.delete(itemId)
  }

  const handleExportBackup = async () => {
    const backup = serializeBackup(locations, items)
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `inventar-backup-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const handleImportBackup = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      const raw = await file.text()
      const parsed = JSON.parse(raw)
      const backup = validateBackupData(parsed)

      if (!window.confirm('This will replace the current inventory with the selected backup. Continue?')) {
        event.target.value = ''
        return
      }

      await db.transaction('rw', db.locations, db.items, async () => {
        await db.locations.clear()
        await db.items.clear()
        await db.locations.bulkPut(backup.locations)
        await db.items.bulkPut(backup.items)
      })

      setCurrentLocationId(null)
      setSearchText('')
      window.alert('Backup restored successfully.')
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'The selected backup is invalid.')
    } finally {
      event.target.value = ''
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-row">
          <button className="brand" type="button" onClick={() => setCurrentLocationId(null)}>
            Inventar
          </button>
          <div className="settings-wrap">
            <button
              className="icon-button"
              type="button"
              aria-label="Open settings"
              aria-expanded={showSettings}
              onClick={() => setShowSettings((visible) => !visible)}
            >
              <span aria-hidden="true">⚙</span>
            </button>
            {showSettings ? (
              <div className="settings-menu">
                <span className="settings-title">Settings</span>
                <button type="button" onClick={handleExportBackup}>Export backup</button>
                <label className="menu-file-button">
                  <input
                    ref={importInputRef}
                    type="file"
                    accept="application/json,.json"
                    hidden
                    onChange={handleImportBackup}
                  />
                  Import backup
                </label>
              </div>
            ) : null}
          </div>
        </div>

        <label className="search-field" htmlFor="global-search">
          <span className="search-label">Search your inventory</span>
          <input
            id="global-search"
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            placeholder="Search items..."
          />
        </label>
      </header>

      {searchText.trim() ? (
        <section className="panel search-panel">
          <h2>Search results</h2>
          {searchResults.length === 0 ? (
            <p>No items match your search.</p>
          ) : (
            <ul className="search-list">
              {searchResults.map(({ item, locationPath }) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className="result-item"
                    onClick={() => {
                      setCurrentLocationId(item.locationId)
                      setSearchText('')
                    }}
                  >
                    <strong>{item.name}</strong>
                    <span>{locationPath}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      <main className="content">
        {currentLocationId ? (
          <nav className="breadcrumbs" aria-label="Breadcrumb">
            <button type="button" className="crumb home" onClick={() => setCurrentLocationId(null)}>
              Inventar
            </button>
            {breadcrumbs.map((location) => (
              <button
                key={location.id}
                type="button"
                className="crumb"
                onClick={() => setCurrentLocationId(location.id)}
              >
                {location.name}
              </button>
            ))}
          </nav>
        ) : null}

        <section className="panel">
          <div className="section-heading page-heading">
            <div>
              <p className="eyebrow">{currentLocation ? 'Inside location' : 'Your inventory'}</p>
              <h1>{currentLocation ? currentLocation.name : 'Locations'}</h1>
            </div>
            {currentLocation ? (
              <button className="danger-outline" type="button" onClick={() => handleDeleteLocation(currentLocation.id)}>
                Delete location
              </button>
            ) : null}
          </div>
          <button className="primary-action" type="button" onClick={() => setShowLocationForm((visible) => !visible)}>
            <span aria-hidden="true">+</span> {currentLocation ? 'Add sublocation' : 'Add location'}
          </button>
          {showLocationForm ? (
            <form className="stack-form inline-form" onSubmit={handleAddLocation}>
              <label>
                <span>{currentLocation ? 'Sublocation name' : 'Location name'}</span>
                <input
                  autoFocus
                  value={locationName}
                  onChange={(event) => setLocationName(event.target.value)}
                  placeholder={currentLocation ? 'e.g. Top shelf' : 'e.g. Bedroom'}
                />
              </label>
              <div className="row-actions form-actions">
                <button type="submit">Save location</button>
                <button className="secondary" type="button" onClick={() => setShowLocationForm(false)}>Cancel</button>
              </div>
            </form>
          ) : null}
        </section>

        {currentLocationId ? (
          <section className="panel">
            <div className="section-heading compact-heading">
              <div>
                <p className="eyebrow">Keep track of what is here</p>
                <h2>Items</h2>
              </div>
              <button className="primary-action" type="button" onClick={() => setShowItemForm((visible) => !visible)}>
                <span aria-hidden="true">+</span> Add item
              </button>
            </div>
            {showItemForm ? <form className="stack-form inline-form" onSubmit={handleAddItem}>
              <label>
                <span>Name</span>
                <input
                  value={itemName}
                  onChange={(event) => setItemName(event.target.value)}
                  placeholder="Item name"
                />
              </label>
              <label>
                <span>Note</span>
                <textarea
                  value={itemNote}
                  onChange={(event) => setItemNote(event.target.value)}
                  placeholder="Optional note"
                />
              </label>
              <label>
                <span>Photo</span>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(event) => void handlePhotoFile(event.target.files?.[0] ?? null, setItemPhoto)}
                />
              </label>
              {itemPhoto ? (
                <div className="photo-preview">
                  <img src={itemPhoto} alt="Item preview" />
                  <button type="button" className="secondary" onClick={() => setItemPhoto(undefined)}>
                    Remove photo
                  </button>
                </div>
              ) : null}
              <div className="row-actions form-actions">
                <button type="submit">Save item</button>
                <button className="secondary" type="button" onClick={() => setShowItemForm(false)}>Cancel</button>
              </div>
            </form> : null}
          </section>
        ) : null}

        <section className="panel">
          <div className="section-heading compact-heading">
            <h2>{currentLocation ? 'Sublocations' : 'Locations'}</h2>
          </div>
          {childLocations.length === 0 ? (
            <p className="empty-state">No locations here yet. Add one to start organizing.</p>
          ) : (
            <ul className="card-list">
              {childLocations.map((location) => (
                <li key={location.id} className="card location-card">
                  <button className="location-link" type="button" onClick={() => setCurrentLocationId(location.id)}>
                    <strong>{location.name}</strong>
                    <span className="location-arrow" aria-hidden="true">›</span>
                  </button>
                  <div className="location-menu-wrap" onClick={(event) => event.stopPropagation()}>
                    <button
                      className="overflow-button"
                      type="button"
                      aria-label={`Actions for ${location.name}`}
                      aria-expanded={openLocationMenuId === location.id}
                      onClick={() => setOpenLocationMenuId((openId) => openId === location.id ? null : location.id)}
                    >
                      ⋮
                    </button>
                    {openLocationMenuId === location.id ? (
                      <div className="location-menu">
                        <button
                          type="button"
                          onClick={() => {
                            setRenameLocationId(location.id)
                            setRenameLocationValue(location.name)
                            setOpenLocationMenuId(null)
                          }}
                        >
                          Rename
                        </button>
                        <button
                          className="menu-danger"
                          type="button"
                          onClick={() => {
                            setOpenLocationMenuId(null)
                            void handleDeleteLocation(location.id)
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {currentLocation ? (
          <section className="panel">
            <div className="section-heading compact-heading"><h2>Items</h2></div>
            {currentItems.length === 0 ? (
              <p className="empty-state">No items in this location.</p>
            ) : (
              <ul className="card-list">
                {currentItems.map((item) => (
                  <li key={item.id} className="card item-card">
                    <div className="item-summary">
                      {item.photo ? (
                        <img src={item.photo} alt={item.name} className="item-thumb" />
                      ) : (
                        <div className="thumb-placeholder">No photo</div>
                      )}
                      <div>
                        <strong>{item.name}</strong>
                        {item.note ? <small>{item.note}</small> : <small>No note</small>}
                      </div>
                    </div>
                    <div className="card-actions">
                      <button className="quiet-action" type="button" onClick={() => beginEditItem(item)}>
                        Edit
                      </button>
                      <button className="danger-action" type="button" onClick={() => handleDeleteItem(item.id)}>
                        Delete
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : null}

        {renameLocationId ? (
          <section className="panel modal-panel">
            <h2>Rename location</h2>
            <form className="stack-form" onSubmit={handleRenameLocation}>
              <label>
                <span>Location name</span>
                <input
                  value={renameLocationValue}
                  onChange={(event) => setRenameLocationValue(event.target.value)}
                />
              </label>
              <div className="row-actions">
                <button type="submit">Save</button>
                <button type="button" className="secondary" onClick={() => setRenameLocationId(null)}>
                  Cancel
                </button>
              </div>
            </form>
          </section>
        ) : null}

        {editingItemId ? (
          <section className="panel modal-panel">
            <h2>Edit item</h2>
            <form className="stack-form" onSubmit={handleSaveItem}>
              <label>
                <span>Name</span>
                <input
                  value={editingItemName}
                  onChange={(event) => setEditingItemName(event.target.value)}
                />
              </label>
              <label>
                <span>Note</span>
                <textarea
                  value={editingItemNote}
                  onChange={(event) => setEditingItemNote(event.target.value)}
                />
              </label>
              <label>
                <span>Photo</span>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(event) =>
                    void handlePhotoFile(event.target.files?.[0] ?? null, setEditingItemPhoto)
                  }
                />
              </label>
              {editingItemPhoto ? (
                <div className="photo-preview">
                  <img src={editingItemPhoto} alt="Selected item preview" />
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => setEditingItemPhoto(undefined)}
                  >
                    Remove photo
                  </button>
                </div>
              ) : null}
              <label>
                <span>Move to location</span>
                <select
                  value={editingItemLocationId}
                  onChange={(event) => setEditingItemLocationId(event.target.value)}
                >
                  {locations.map((location) => (
                    <option key={location.id} value={location.id}>
                      {getLocationPath(locations, location.id)
                        .map((pathLocation) => pathLocation.name)
                        .join(' / ')}
                    </option>
                  ))}
                </select>
              </label>
              <div className="row-actions">
                <button type="submit">Save</button>
                <button type="button" className="secondary" onClick={() => setEditingItemId(null)}>
                  Cancel
                </button>
              </div>
            </form>
          </section>
        ) : null}
      </main>
    </div>
  )
}

export default App
