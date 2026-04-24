import type { GalleryInteraction, GalleryResponse, PhotoPatchPayload } from './types'

async function expectOK(response: Response) {
  if (!response.ok) {
    const message = await response.text()
    throw new Error(message || response.statusText)
  }
}

export async function fetchGallery() {
  const response = await fetch('/api/gallery')
  await expectOK(response)
  return (await response.json()) as GalleryResponse
}

export async function fetchAdminGallery() {
  const response = await fetch('/api/admin/gallery')
  await expectOK(response)
  return (await response.json()) as GalleryResponse
}

export async function uploadPhotos(files: File[]) {
  const form = new FormData()
  for (const file of files) {
    form.append('files', file)
  }

  const response = await fetch('/api/admin/upload', {
    method: 'POST',
    body: form,
  })
  await expectOK(response)
}

export async function rescanLibrary() {
  const response = await fetch('/api/admin/rescan', {
    method: 'POST',
  })
  await expectOK(response)
}

export async function patchPhoto(id: number, payload: PhotoPatchPayload) {
  const response = await fetch(`/api/admin/photos/${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
  await expectOK(response)
}

export async function trackPhotoView(id: number) {
  const response = await fetch(`/api/photos/${id}/view`, {
    method: 'POST',
  })
  await expectOK(response)
  return (await response.json()) as GalleryInteraction
}

export async function trackPhotoViews(ids: number[]) {
  const response = await fetch('/api/photos/views', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ photo_ids: ids }),
  })
  await expectOK(response)
  return (await response.json()) as { interactions: GalleryInteraction[] }
}

export async function trackPhotoClick(id: number) {
  const response = await fetch(`/api/photos/${id}/click`, {
    method: 'POST',
  })
  await expectOK(response)
  return (await response.json()) as GalleryInteraction
}

export async function togglePhotoStar(id: number) {
  const response = await fetch(`/api/photos/${id}/star`, {
    method: 'POST',
  })
  await expectOK(response)
  return (await response.json()) as GalleryInteraction
}
