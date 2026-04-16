import type { GalleryResponse, PhotoPatchPayload } from './types'

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
