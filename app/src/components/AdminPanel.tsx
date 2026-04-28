import { useEffect, useMemo, useState } from 'react'
import { Film, ImagePlus, LoaderCircle, RefreshCcw, Save } from 'lucide-react'

import { patchPhoto, rescanLibrary, uploadPhotos } from '../lib/api'
import type { GalleryItem } from '../lib/types'

type AdminPanelProps = {
  photos: GalleryItem[]
  onRefresh: () => Promise<void>
}

type DraftMap = Record<
  number,
  {
    title: string
    alt: string
    description: string
    sortOrder: number
    hidden: boolean
    capturedAt: string
    updatedAt: string
  }
>

export function AdminPanel({ photos, onRefresh }: AdminPanelProps) {
  const [isBusy, setIsBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [drafts, setDrafts] = useState<DraftMap>(() =>
    Object.fromEntries(
      photos.map((photo) => [
        photo.id,
        {
          title: photo.title,
          alt: photo.alt,
          description: photo.description,
          sortOrder: photo.sortOrder,
          hidden: photo.hidden,
          capturedAt: photo.capturedAtLocal,
          updatedAt: photo.updatedAtLocal,
        },
      ]),
    ),
  )

  useEffect(() => {
    document.documentElement.classList.add('forum-admin-native-scroll')

    return () => {
      document.documentElement.classList.remove('forum-admin-native-scroll')
    }
  }, [])

  useEffect(() => {
    setDrafts(
      Object.fromEntries(
        photos.map((photo) => [
          photo.id,
          {
            title: photo.title,
            alt: photo.alt,
            description: photo.description,
            sortOrder: photo.sortOrder,
            hidden: photo.hidden,
            capturedAt: photo.capturedAtLocal,
            updatedAt: photo.updatedAtLocal,
          },
        ]),
      ),
    )
  }, [photos])

  const items = useMemo(
    () =>
      photos.map((photo) => ({
        photo,
        draft:
          drafts[photo.id] ?? {
            title: photo.title,
            alt: photo.alt,
            description: photo.description,
            sortOrder: photo.sortOrder,
            hidden: photo.hidden,
            capturedAt: photo.capturedAtLocal,
            updatedAt: photo.updatedAtLocal,
          },
      })),
    [drafts, photos],
  )

  async function handleUpload(fileList: FileList | null) {
    if (!fileList?.length) {
      return
    }

    setIsBusy(true)
    setNotice('')
    try {
      await uploadPhotos(Array.from(fileList))
      await onRefresh()
      setNotice('Upload complete.')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Upload failed.')
    } finally {
      setIsBusy(false)
    }
  }

  async function handleRescan() {
    setIsBusy(true)
    setNotice('')
    try {
      await rescanLibrary()
      await onRefresh()
      setNotice('Library rescanned.')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Rescan failed.')
    } finally {
      setIsBusy(false)
    }
  }

  async function handleSave(id: number) {
    const draft = drafts[id]
    if (!draft) {
      return
    }

    setIsBusy(true)
    setNotice('')
    try {
      await patchPhoto(id, {
        title: draft.title,
        alt: draft.alt,
        description: draft.description,
        sort_order: draft.sortOrder,
        hidden: draft.hidden,
        captured_at_local: draft.capturedAt || null,
        updated_at_local: draft.updatedAt || undefined,
      })
      await onRefresh()
      setNotice('Photo updated.')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Save failed.')
    } finally {
      setIsBusy(false)
    }
  }

  return (
    <main className="forum-app-shell forum-admin-shell">
      <div className="forum-page forum-admin-page">
        <section className="forum-window">
          <div className="forum-window-bar">
            <div className="forum-window-title">Gallery Intake</div>
            <div className="forum-window-actions" aria-hidden="true">
              <span className="forum-window-dot" />
              <span className="forum-window-dot" />
              <span className="forum-window-dot" />
            </div>
          </div>

          <div className="forum-panel-body flex flex-col gap-6">
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(320px,1fr)]">
              <div className="flex flex-col gap-4">
                <div>
                  <p className="forum-kicker">Internal Archive Editor</p>
                  <h1 className="forum-heading">Gallery Intake</h1>
                  <p className="forum-copy">
                    Upload new media, rescan the library, and edit titles, dates, ordering, and visibility without leaving the
                    archive tool.
                  </p>
                </div>

                <div className="forum-toolbar">
                  <label className="forum-button cursor-pointer">
                    <ImagePlus className="h-4 w-4" />
                    <span className="flex flex-col items-start leading-tight">
                      <span className="forum-button-label">Upload Media</span>
                      <span className="forum-button-note">Add images or video files</span>
                    </span>
                    <input
                      type="file"
                      accept=".jpg,.jpeg,.png,.heic,.heif,.mp4,.mov,.m4v,.webm,.mkv,.avi,.mpeg,.mpg,.3gp,.ogv"
                      multiple
                      className="hidden"
                      onChange={(event) => void handleUpload(event.target.files)}
                    />
                  </label>

                  <button
                    type="button"
                    onClick={() => void handleRescan()}
                    className="forum-button"
                    disabled={isBusy}
                  >
                    <RefreshCcw className={`h-4 w-4 ${isBusy ? 'animate-spin' : ''}`} />
                    <span className="flex flex-col items-start leading-tight">
                      <span className="forum-button-label">Rescan Library</span>
                      <span className="forum-button-note">Refresh file and EXIF data</span>
                    </span>
                  </button>
                </div>
              </div>

              <div className="forum-stat-grid">
                <div className="forum-stat-card">
                  <p className="forum-stat-label">Indexed Media</p>
                  <p className="forum-stat-value">{photos.length}</p>
                </div>
                <div className="forum-stat-card">
                  <p className="forum-stat-label">Hidden Entries</p>
                  <p className="forum-stat-value">{photos.filter((photo) => photo.hidden).length}</p>
                </div>
                <div className="forum-stat-card">
                  <p className="forum-stat-label">Save State</p>
                  <p className="forum-stat-value">{isBusy ? 'Working' : 'Idle'}</p>
                </div>
                <div className="forum-stat-card">
                  <p className="forum-stat-label">Status</p>
                  <p className="forum-stat-value">{notice || 'Ready for edits'}</p>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 bg-[linear-gradient(180deg,var(--panel-strong)_0%,var(--panel-soft)_100%)] px-3 py-2 border-t border-l border-t-[var(--bp-border-light)] border-l-[var(--bp-border-light)] border-b border-r border-b-[var(--bp-border-darker)] border-r-[var(--bp-border-darker)] shadow-[inset_1px_1px_0_var(--bp-inset),inset_-1px_-1px_0_var(--bp-border-dark)]">
              {isBusy ? <LoaderCircle className="h-4 w-4 animate-spin text-[var(--accent-strong)]" /> : null}
              <span className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--text-soft)]">Session Status</span>
              <span className="text-sm text-[var(--text-strong)]">{notice || `${photos.length} indexed media items available.`}</span>
            </div>
          </div>
        </section>

        <section className="flex flex-col gap-4">
          {items.map(({ photo, draft }) => (
            <article key={photo.id} className="forum-window">
              <div className="forum-window-bar">
                <div className="min-w-0">
                  <div className="forum-window-title truncate">{getPhotoLabel(photo)}</div>
                  <p className="m-0 mt-1 truncate text-[12px] text-[var(--text-soft)]">{photo.relativePath}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.12em] text-[var(--text-soft)]">
                  <span>{photo.width}×{photo.height}</span>
                  <span className="h-1 w-1 rounded-full bg-[var(--line-strong)]" />
                  <span>{draft.hidden ? 'Hidden' : 'Public'}</span>
                </div>
              </div>

              <div className="forum-panel-body">
                <div className="grid gap-4 xl:grid-cols-[240px_minmax(0,1fr)]">
                  <div className="space-y-3">
                    <div className="overflow-hidden border border-[var(--line-strong)] bg-[var(--panel-ink)] shadow-[inset_1px_1px_0_var(--bp-inset),inset_-1px_-1px_0_var(--bp-border-dark)]">
                      {photo.mediaType === 'video' ? (
                        <div className="relative aspect-[4/5] w-full bg-black">
                          <video src={photo.src} poster={photo.placeholder} muted loop autoPlay playsInline preload="metadata" className="h-full w-full object-cover" />
                          <span className="absolute left-2 top-2 inline-flex h-6 items-center gap-1 border border-white/90 bg-black/55 px-1.5 text-[10px] font-bold text-white/90">
                            <Film className="h-3 w-3" />
                            VID
                          </span>
                        </div>
                      ) : (
                        <img src={photo.src} srcSet={photo.srcSet} sizes="240px" alt={photo.alt} className="aspect-[4/5] w-full object-cover" />
                      )}
                    </div>

                    <div className="forum-meta-box">
                      <dl className="forum-meta-table">
                        <dt className="forum-meta-term">Captured</dt>
                        <dd className="forum-meta-desc">{formatDate(photo.capturedAt || photo.updatedAt) || 'Unknown'}</dd>
                        <dt className="forum-meta-term">Camera</dt>
                        <dd className="forum-meta-desc">{photo.mediaType === 'video' ? 'Video' : photo.camera || 'Unknown'}</dd>
                        <dt className="forum-meta-term">Lens</dt>
                        <dd className="forum-meta-desc">{photo.lens || 'Unknown'}</dd>
                      </dl>
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="forum-field">
                      <span className="forum-field-label">Title</span>
                      <input
                        value={draft.title}
                        onChange={(event) =>
                          setDrafts((current) => ({
                            ...current,
                            [photo.id]: { ...draft, title: event.target.value },
                          }))
                        }
                        className="forum-input"
                      />
                    </label>

                    <label className="forum-field">
                      <span className="forum-field-label">Alt Text</span>
                      <input
                        value={draft.alt}
                        onChange={(event) =>
                          setDrafts((current) => ({
                            ...current,
                            [photo.id]: { ...draft, alt: event.target.value },
                          }))
                        }
                        className="forum-input"
                      />
                    </label>

                    <label className="forum-field md:col-span-2">
                      <span className="forum-field-label">Description</span>
                      <textarea
                        value={draft.description}
                        onChange={(event) =>
                          setDrafts((current) => ({
                            ...current,
                            [photo.id]: { ...draft, description: event.target.value },
                          }))
                        }
                        rows={4}
                        className="forum-input min-h-[120px]"
                      />
                    </label>

                    <label className="forum-field">
                      <span className="forum-field-label">Sort Order</span>
                      <input
                        type="number"
                        value={draft.sortOrder}
                        onChange={(event) =>
                          setDrafts((current) => ({
                            ...current,
                            [photo.id]: { ...draft, sortOrder: Number(event.target.value) || 0 },
                          }))
                        }
                        className="forum-input"
                      />
                    </label>

                    <label className="forum-field">
                      <span className="forum-field-label">Date Taken</span>
                      <input
                        type="datetime-local"
                        value={draft.capturedAt}
                        onChange={(event) =>
                          setDrafts((current) => ({
                            ...current,
                            [photo.id]: { ...draft, capturedAt: event.target.value },
                          }))
                        }
                        className="forum-input"
                      />
                    </label>

                    <label className="forum-field">
                      <span className="forum-field-label">Date Modified</span>
                      <input
                        type="datetime-local"
                        value={draft.updatedAt}
                        onChange={(event) =>
                          setDrafts((current) => ({
                            ...current,
                            [photo.id]: { ...draft, updatedAt: event.target.value },
                          }))
                        }
                        className="forum-input"
                      />
                    </label>

                    <label className="forum-field">
                      <span className="forum-field-label">Visibility</span>
                      <span
                        className="flex min-h-[36px] items-center gap-3 bg-[var(--field-fill)] px-3 border-t border-l border-t-[var(--bp-border-darker)] border-l-[var(--bp-border-darker)] border-b border-r border-b-[var(--bp-border-light)] border-r-[var(--bp-border-light)] shadow-[inset_1px_1px_0_var(--bp-border-dark)]"
                      >
                        <input
                          type="checkbox"
                          checked={draft.hidden}
                          onChange={(event) =>
                            setDrafts((current) => ({
                              ...current,
                              [photo.id]: { ...draft, hidden: event.target.checked },
                            }))
                          }
                          className="h-4 w-4 accent-[var(--accent)]"
                        />
                        <span className="text-sm text-[var(--text-strong)]">Hide from public gallery</span>
                      </span>
                    </label>

                    <div className="flex items-end justify-end md:col-span-2">
                      <button
                        type="button"
                        onClick={() => void handleSave(photo.id)}
                        className="forum-button"
                        disabled={isBusy}
                      >
                        <Save className="h-4 w-4" />
                        <span className="flex flex-col items-start leading-tight">
                          <span className="forum-button-label">Save Entry</span>
                          <span className="forum-button-note">Write changes to archive</span>
                        </span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </section>
      </div>
    </main>
  )
}

function getPhotoLabel(photo: GalleryItem) {
  const label = photo.title || photo.alt || photo.relativePath
  if (!label) {
    return `Photo ${photo.id}`
  }

  const segments = label.split(/[\\/]/)
  return segments[segments.length - 1]
}

function formatDate(value?: string | null) {
  if (!value) {
    return ''
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return ''
  }

  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  }).format(date)
}
