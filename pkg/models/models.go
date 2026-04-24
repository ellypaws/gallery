package models

import "time"

type Photo struct {
	ID           uint `gorm:"primaryKey"`
	CreatedAt    time.Time
	UpdatedAt    time.Time
	RelativePath string `gorm:"uniqueIndex;not null"`
	Hash         string `gorm:"index;not null"`
	Width        int
	Height       int
	ByteSize     int64
	MimeType     string
	TakenAt      *time.Time
	Exif         PhotoExif     `gorm:"constraint:OnDelete:CASCADE;"`
	Override     PhotoOverride `gorm:"constraint:OnDelete:CASCADE;"`
	Derivatives  []Derivative  `gorm:"constraint:OnDelete:CASCADE;"`
	Views        []PhotoView   `gorm:"constraint:OnDelete:CASCADE;"`
	Clicks       []PhotoClick  `gorm:"constraint:OnDelete:CASCADE;"`
	Stars        []PhotoStar   `gorm:"constraint:OnDelete:CASCADE;"`
}

type PhotoExif struct {
	ID          uint `gorm:"primaryKey"`
	PhotoID     uint `gorm:"uniqueIndex;not null"`
	CameraMake  string
	CameraModel string
	LensModel   string
	Aperture    string
	Shutter     string
	ISO         string
	FocalLength string
	CapturedAt  *time.Time
}

type PhotoOverride struct {
	ID          uint `gorm:"primaryKey"`
	PhotoID     uint `gorm:"uniqueIndex;not null"`
	Title       string
	Alt         string
	Description string
	SortOrder   int
	Hidden      bool
}

type Derivative struct {
	ID           uint   `gorm:"primaryKey"`
	PhotoID      uint   `gorm:"index;not null"`
	Variant      string `gorm:"index;not null"`
	RelativePath string `gorm:"not null"`
	Width        int
	Height       int
	ByteSize     int64
	MimeType     string
}

type PhotoView struct {
	ID         uint `gorm:"primaryKey"`
	CreatedAt  time.Time
	PhotoID    uint   `gorm:"uniqueIndex:idx_photo_viewer;index;not null"`
	ViewerHash string `gorm:"uniqueIndex:idx_photo_viewer;size:64;not null"`
}

type PhotoClick struct {
	ID         uint `gorm:"primaryKey"`
	CreatedAt  time.Time
	PhotoID    uint   `gorm:"uniqueIndex:idx_photo_clicker;index;not null"`
	ViewerHash string `gorm:"uniqueIndex:idx_photo_clicker;size:64;not null"`
}

type PhotoStar struct {
	ID         uint `gorm:"primaryKey"`
	CreatedAt  time.Time
	PhotoID    uint   `gorm:"uniqueIndex:idx_photo_starrer;index;not null"`
	ViewerHash string `gorm:"uniqueIndex:idx_photo_starrer;size:64;not null"`
}
