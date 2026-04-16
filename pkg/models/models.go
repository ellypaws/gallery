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
