package images

import (
	"bytes"
	"fmt"
	"image"
	_ "image/jpeg"
	_ "image/png"
	"math"
	"os"
	"path/filepath"

	"github.com/disintegration/imaging"
	"github.com/dlecorfec/progjpeg"
)

var responsiveWidths = []int{480, 768, 1280, 1800, 2400}

type GeneratedDerivative struct {
	Variant      string
	RelativePath string
	Width        int
	Height       int
	ByteSize     int64
	MimeType     string
}

type ProcessedImage struct {
	Width       int
	Height      int
	ByteSize    int64
	MimeType    string
	Placeholder string
	Derivatives []GeneratedDerivative
}

func ProcessImage(srcPath, cacheDir, hash string) (ProcessedImage, error) {
	info, err := os.Stat(srcPath)
	if err != nil {
		return ProcessedImage{}, err
	}

	img, err := imaging.Open(srcPath, imaging.AutoOrientation(true))
	if err != nil {
		return ProcessedImage{}, err
	}

	bounds := img.Bounds()
	result := ProcessedImage{
		Width:    bounds.Dx(),
		Height:   bounds.Dy(),
		ByteSize: info.Size(),
		MimeType: "image/jpeg",
	}

	cacheSubdir := filepath.Join(cacheDir, hash[:2], hash[2:4])
	if err := os.MkdirAll(cacheSubdir, 0o755); err != nil {
		return ProcessedImage{}, err
	}

	for _, width := range widthsFor(bounds.Dx()) {
		resized := imaging.Resize(img, width, 0, imaging.Lanczos)
		relativePath := filepath.Join(hash[:2], hash[2:4], fmt.Sprintf("%s-w%d.jpg", hash, width))
		outputPath := filepath.Join(cacheDir, relativePath)

		if err := writeProgressiveJPEG(outputPath, resized, 84); err != nil {
			return ProcessedImage{}, err
		}

		stat, err := os.Stat(outputPath)
		if err != nil {
			return ProcessedImage{}, err
		}

		result.Derivatives = append(result.Derivatives, GeneratedDerivative{
			Variant:      "responsive",
			RelativePath: filepath.ToSlash(relativePath),
			Width:        resized.Bounds().Dx(),
			Height:       resized.Bounds().Dy(),
			ByteSize:     stat.Size(),
			MimeType:     "image/jpeg",
		})
	}

	placeholderPath := filepath.Join(cacheDir, hash[:2], hash[2:4], fmt.Sprintf("%s-placeholder.jpg", hash))
	placeholderRel := filepath.Join(hash[:2], hash[2:4], fmt.Sprintf("%s-placeholder.jpg", hash))
	placeholder := imaging.Resize(img, 40, 0, imaging.Linear)
	if err := writeProgressiveJPEG(placeholderPath, placeholder, 28); err != nil {
		return ProcessedImage{}, err
	}
	result.Placeholder = filepath.ToSlash(placeholderRel)
	result.Derivatives = append(result.Derivatives, GeneratedDerivative{
		Variant:      "placeholder",
		RelativePath: filepath.ToSlash(placeholderRel),
		Width:        placeholder.Bounds().Dx(),
		Height:       placeholder.Bounds().Dy(),
		MimeType:     "image/jpeg",
	})

	return result, nil
}

func widthsFor(originalWidth int) []int {
	widths := make([]int, 0, len(responsiveWidths))
	for _, width := range responsiveWidths {
		if width <= originalWidth {
			widths = append(widths, width)
		}
	}
	if len(widths) == 0 || widths[len(widths)-1] != originalWidth {
		widths = append(widths, originalWidth)
	}
	return widths
}

func writeProgressiveJPEG(path string, img image.Image, quality int) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}

	buffer := bytes.NewBuffer(nil)
	if err := progjpeg.Encode(buffer, img, &progjpeg.Options{
		Quality:     quality,
		Progressive: true,
	}); err != nil {
		return err
	}

	return os.WriteFile(path, buffer.Bytes(), 0o644)
}

func EstimateRenderedHeight(sourceWidth, sourceHeight, renderedWidth int) int {
	if sourceWidth == 0 {
		return 0
	}
	return int(math.Round(float64(renderedWidth) * (float64(sourceHeight) / float64(sourceWidth))))
}
