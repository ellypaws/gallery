export type GalleryItem = {
  id: number
  title: string
  alt: string
  description: string
  width: number
  height: number
  src: string
  originalSrc: string
  placeholder: string
  srcSet: string
  sizes: string
  camera: string
  lens: string
  aperture: string
  shutter: string
  iso: string
  focalLength: string
  capturedAt: string | null
  capturedAtLocal: string
  updatedAt: string
  updatedAtLocal: string
  timelineGroup: string
  sortOrder: number
  hidden: boolean
  relativePath: string
}

export type GalleryResponse = {
  title: string
  photos: GalleryItem[]
}

export type PhotoPatchPayload = {
  title?: string
  alt?: string
  description?: string
  sort_order?: number
  hidden?: boolean
  captured_at?: string | null
  updated_at?: string
  captured_at_local?: string | null
  updated_at_local?: string
}
