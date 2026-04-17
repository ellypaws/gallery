package images

import (
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

	exif "github.com/dsoprea/go-exif/v3"
	exifcommon "github.com/dsoprea/go-exif/v3/common"
)

type ExifMetadata struct {
	CameraMake  string
	CameraModel string
	LensModel   string
	Aperture    string
	Shutter     string
	ISO         string
	FocalLength string
	CapturedAt  *time.Time
}

func ExtractExif(path string) (ExifMetadata, error) {
	rawExif, err := exif.SearchFileAndExtractExif(path)
	if err != nil {
		return ExifMetadata{}, nil
	}

	mapping, err := exifcommon.NewIfdMappingWithStandard()
	if err != nil {
		return ExifMetadata{}, err
	}

	tagIndex := exif.NewTagIndex()
	if err := exif.LoadStandardTags(tagIndex); err != nil {
		return ExifMetadata{}, err
	}

	_, index, err := exif.Collect(mapping, tagIndex, rawExif)
	if err != nil {
		return ExifMetadata{}, nil
	}

	root := index.RootIfd
	if root == nil {
		return ExifMetadata{}, nil
	}

	exifIfd, _ := root.ChildWithIfdPath(exifcommon.IfdExifStandardIfdIdentity)

	makeValue, _ := firstFormatted(root, "Make")
	modelValue, _ := firstFormatted(root, "Model")
	lensValue := firstWithFallback(exifIfd, "LensModel", "LensSpecification")
	apertureValue := firstWithFallback(exifIfd, "FNumber", "ApertureValue")
	shutterValue := firstWithFallback(exifIfd, "ExposureTime")
	isoValue := firstWithFallback(exifIfd, "PhotographicSensitivity", "ISOSpeedRatings")
	focalValue := firstWithFallback(exifIfd, "FocalLength")
	captured := parseCapturedAt(firstWithFallback(exifIfd, "DateTimeOriginal", "DateTimeDigitized"), firstWithFallback(root, "DateTime"))

	return ExifMetadata{
		CameraMake:  strings.TrimSpace(makeValue),
		CameraModel: strings.TrimSpace(modelValue),
		LensModel:   sanitizeLens(lensValue),
		Aperture:    formatAperture(apertureValue),
		Shutter:     strings.TrimSpace(shutterValue),
		ISO:         strings.TrimSpace(isoValue),
		FocalLength: formatFocalLength(focalValue),
		CapturedAt:  captured,
	}, nil
}

func sanitizeLens(val string) string {
	val = strings.TrimSpace(val)
	if strings.Trim(val, "-_ \x00\t\n\r") == "" {
		return "Unknown"
	}
	return val
}

func firstWithFallback(ifd *exif.Ifd, names ...string) string {
	for _, name := range names {
		value, err := firstFormatted(ifd, name)
		if err == nil && value != "" {
			return value
		}
	}
	return ""
}

func firstFormatted(ifd *exif.Ifd, name string) (string, error) {
	if ifd == nil {
		return "", errors.New("missing ifd")
	}

	results, err := ifd.FindTagWithName(name)
	if err != nil || len(results) == 0 {
		return "", fmt.Errorf("tag %s not found", name)
	}

	if formatted, err := results[0].FormatFirst(); err == nil && formatted != "" {
		return formatted, nil
	}

	value, err := results[0].Value()
	if err != nil {
		return "", err
	}

	return fmt.Sprint(value), nil
}

func parseCapturedAt(values ...string) *time.Time {
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value == "" {
			continue
		}
		parsed, err := time.Parse("2006:01:02 15:04:05", value)
		if err == nil {
			return &parsed
		}
	}
	return nil
}

func formatAperture(val string) string {
	val = strings.TrimSpace(val)
	if val == "" {
		return ""
	}
	parts := strings.Split(val, "/")
	if len(parts) == 2 {
		num, err1 := strconv.ParseFloat(strings.TrimSpace(parts[0]), 64)
		den, err2 := strconv.ParseFloat(strings.TrimSpace(parts[1]), 64)
		if err1 == nil && err2 == nil && den != 0 {
			res := num / den
			if res == float64(int(res)) {
				return fmt.Sprintf("%d", int(res))
			}
			return fmt.Sprintf("%.1f", res)
		}
	}
	return val
}

func formatFocalLength(val string) string {
	val = strings.TrimSpace(val)
	if val == "" {
		return ""
	}
	parts := strings.Split(val, "/")
	if len(parts) == 2 {
		num, err1 := strconv.ParseFloat(strings.TrimSpace(parts[0]), 64)
		den, err2 := strconv.ParseFloat(strings.TrimSpace(parts[1]), 64)
		if err1 == nil && err2 == nil && den != 0 {
			res := num / den
			if res == float64(int(res)) {
				return fmt.Sprintf("%d mm", int(res))
			}
			return fmt.Sprintf("%.1f mm", res)
		}
	}
	if !strings.HasSuffix(strings.ToLower(val), "mm") {
		return val + " mm"
	}
	return val
}
