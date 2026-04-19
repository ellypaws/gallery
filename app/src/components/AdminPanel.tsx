import { useEffect, useMemo, useState } from 'react'
import { ImagePlus, LoaderCircle, RefreshCcw, Save } from 'lucide-react'

import { patchPhoto, rescanLibrary, uploadPhotos } from '../lib/api'
import type { GalleryItem } from '../lib/types'

type AdminPanelProps = {
  photos: GalleryItem[]
  onRefresh: () => Promise<void>
}

type DraftMap = Record<number, { title: string; alt: string; description: string; sortOrder: number; hidden: boolean; capturedAt: string; updatedAt: string }>

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
          drafts[photo.id] ??
          {
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
    <main className="min-h-screen px-4 py-6 md:px-8">
      <div className="mx-auto max-w-[1220px]">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-[0.2em] text-[var(--muted)]">Admin</p>
            <h1 className="mt-2 font-teko text-[72px] leading-[0.9] text-[var(--text)]">Gallery Intake</h1>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-sm font-medium text-[var(--text)] transition hover:border-[var(--accent)]">
              <ImagePlus className="h-4 w-4" />
              Upload Images
              <input
                type="file"
                accept=".jpg,.jpeg,.png,.heic,.heif"
                multiple
                className="hidden"
                onChange={(event) => void handleUpload(event.target.files)}
              />
            </label>
            <button
              type="button"
              onClick={() => void handleRescan()}
              className="inline-flex items-center gap-2 rounded-md border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-sm font-medium text-[var(--text)] transition hover:border-[var(--accent)]"
            >
              <RefreshCcw className="h-4 w-4" />
              Rescan Library
            </button>
          </div>
        </div>

        <div className="mt-6 flex items-center gap-3 text-sm text-[var(--muted)]">
          {isBusy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
          <span>{notice || `${photos.length} indexed photos.`}</span>
        </div>

        <div className="mt-8 space-y-4">
          {items.map(({ photo, draft }) => (
            <article
              key={photo.id}
              className="grid gap-4 rounded-md border border-[var(--line)] bg-[var(--surface)] p-4 shadow-[var(--shadow)] lg:grid-cols-[220px_minmax(0,1fr)]"
            >
              <div className="overflow-hidden rounded-[6px] border border-[var(--line)]">
                <img src={photo.src} srcSet={photo.srcSet} sizes="220px" alt={photo.alt} className="aspect-[4/5] w-full object-cover" />
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="flex flex-col gap-2 text-sm text-[var(--muted)]">
                  Title
                  <input
                    value={draft.title}
                    onChange={(event) =>
                      setDrafts((current) => ({
                        ...current,
                        [photo.id]: { ...draft, title: event.target.value },
                      }))
                    }
                    className="rounded-md border border-[var(--line)] bg-transparent px-3 py-2 text-[var(--text)] outline-none transition focus:border-[var(--accent)]"
                  />
                </label>
                <label className="flex flex-col gap-2 text-sm text-[var(--muted)]">
                  Alt Text
                  <input
                    value={draft.alt}
                    onChange={(event) =>
                      setDrafts((current) => ({
                        ...current,
                        [photo.id]: { ...draft, alt: event.target.value },
                      }))
                    }
                    className="rounded-md border border-[var(--line)] bg-transparent px-3 py-2 text-[var(--text)] outline-none transition focus:border-[var(--accent)]"
                  />
                </label>
                <label className="flex flex-col gap-2 text-sm text-[var(--muted)] md:col-span-2">
                  Description
                  <textarea
                    value={draft.description}
                    onChange={(event) =>
                      setDrafts((current) => ({
                        ...current,
                        [photo.id]: { ...draft, description: event.target.value },
                      }))
                    }
                    rows={4}
                    className="rounded-md border border-[var(--line)] bg-transparent px-3 py-2 text-[var(--text)] outline-none transition focus:border-[var(--accent)]"
                  />
                </label>
                <label className="flex flex-col gap-2 text-sm text-[var(--muted)]">
                  Sort Order
                  <input
                    type="number"
                    value={draft.sortOrder}
                    onChange={(event) =>
                      setDrafts((current) => ({
                        ...current,
                        [photo.id]: { ...draft, sortOrder: Number(event.target.value) || 0 },
                      }))
                    }
                    className="rounded-md border border-[var(--line)] bg-transparent px-3 py-2 text-[var(--text)] outline-none transition focus:border-[var(--accent)]"
                  />
                </label>
                <label className="flex flex-col gap-2 text-sm text-[var(--muted)]">
                  Date Taken
                  <input
                    type="datetime-local"
                    value={draft.capturedAt}
                    onChange={(event) =>
                      setDrafts((current) => ({
                        ...current,
                        [photo.id]: { ...draft, capturedAt: event.target.value },
                      }))
                    }
                    className="rounded-md border border-[var(--line)] bg-transparent px-3 py-2 text-[var(--text)] outline-none transition focus:border-[var(--accent)]"
                  />
                </label>
                <label className="flex flex-col gap-2 text-sm text-[var(--muted)]">
                  Date Modified
                  <input
                    type="datetime-local"
                    value={draft.updatedAt}
                    onChange={(event) =>
                      setDrafts((current) => ({
                        ...current,
                        [photo.id]: { ...draft, updatedAt: event.target.value },
                      }))
                    }
                    className="rounded-md border border-[var(--line)] bg-transparent px-3 py-2 text-[var(--text)] outline-none transition focus:border-[var(--accent)]"
                  />
                </label>
                <label className="flex items-center gap-3 self-end text-sm text-[var(--text)]">
                  <input
                    type="checkbox"
                    checked={draft.hidden}
                    onChange={(event) =>
                      setDrafts((current) => ({
                        ...current,
                        [photo.id]: { ...draft, hidden: event.target.checked },
                      }))
                    }
                    className="h-4 w-4 rounded border-[var(--line)] accent-[var(--accent)]"
                  />
                  Hidden from public gallery
                </label>
                <div className="flex items-end justify-end md:col-span-2">
                  <button
                    type="button"
                    onClick={() => void handleSave(photo.id)}
                    className="inline-flex items-center gap-2 rounded-md border border-[var(--line)] bg-[var(--surface-strong)] px-4 py-3 text-sm font-medium text-[var(--text)] transition hover:border-[var(--accent)]"
                  >
                    <Save className="h-4 w-4" />
                    Save
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </main>
  )
}
