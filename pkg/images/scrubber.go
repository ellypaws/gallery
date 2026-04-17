package images

import (
	"io"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/charmbracelet/log"
	exif "github.com/dsoprea/go-exif/v3"
	exifcommon "github.com/dsoprea/go-exif/v3/common"
	jpegstructure "github.com/dsoprea/go-jpeg-image-structure/v2"
)

func ScrubAndSaveJpeg(srcPath, dstPath string, meta ExifMetadata, logger *log.Logger) error {
	jmp := jpegstructure.NewJpegMediaParser()
	intfc, err := jmp.ParseFile(srcPath)
	if err != nil {
		logger.Debug("skipping EXIF scrubbing (not a JPEG or unparseable)", "path", srcPath)
		return copyFile(srcPath, dstPath)
	}
	sl, ok := intfc.(*jpegstructure.SegmentList)
	if !ok {
		logger.Debug("skipping EXIF scrubbing (not segment payload)", "path", srcPath)
		return copyFile(srcPath, dstPath)
	}

	im, err := exifcommon.NewIfdMappingWithStandard()
	if err != nil {
		return copyFile(srcPath, dstPath)
	}

	ti := exif.NewTagIndex()
	ib := exif.NewIfdBuilder(im, ti, exifcommon.IfdStandardIfdIdentity, exifcommon.EncodeDefaultByteOrder)

	if meta.CameraMake != "" {
		_ = ib.AddStandardWithName("Make", meta.CameraMake)
	}
	if meta.CameraModel != "" {
		_ = ib.AddStandardWithName("Model", meta.CameraModel)
	}
	if meta.CapturedAt != nil {
		_ = ib.AddStandardWithName("DateTime", meta.CapturedAt.Format("2006:01:02 15:04:05"))
	}

	childIb := exif.NewIfdBuilder(im, ti, exifcommon.IfdExifStandardIfdIdentity, exifcommon.EncodeDefaultByteOrder)

	if meta.LensModel != "" && meta.LensModel != "Unknown" {
		_ = childIb.AddStandardWithName("LensModel", meta.LensModel)
	}
	if meta.CapturedAt != nil {
		_ = childIb.AddStandardWithName("DateTimeOriginal", meta.CapturedAt.Format("2006:01:02 15:04:05"))
		_ = childIb.AddStandardWithName("DateTimeDigitized", meta.CapturedAt.Format("2006:01:02 15:04:05"))
	}
	if meta.ISO != "" {
		if iso, err := strconv.ParseUint(meta.ISO, 10, 16); err == nil {
			_ = childIb.AddStandardWithName("ISOSpeedRatings", []uint16{uint16(iso)})
		}
	}
	if rat := parseShutter(meta.Shutter); rat != nil {
		_ = childIb.AddStandardWithName("ExposureTime", []exifcommon.Rational{{Numerator: rat[0], Denominator: rat[1]}})
	}
	if rat := parseAperture(meta.Aperture); rat != nil {
		_ = childIb.AddStandardWithName("FNumber", []exifcommon.Rational{{Numerator: rat[0], Denominator: rat[1]}})
	}
	if rat := parseFocal(meta.FocalLength); rat != nil {
		_ = childIb.AddStandardWithName("FocalLength", []exifcommon.Rational{{Numerator: rat[0], Denominator: rat[1]}})
	}

	_ = ib.AddChildIb(childIb)

	sl.DropExif()
	if err := sl.SetExif(ib); err != nil {
		logger.Warn("failed to set scrubbed exif", "err", err)
	} else {
		logger.Debug("successfully scrubbed and injected EXIF", "dst_path", dstPath)
	}

	dir := filepath.Dir(dstPath)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}

	f, err := os.Create(dstPath)
	if err != nil {
		return err
	}
	defer f.Close()

	return sl.Write(f)
}

func parseShutter(s string) []uint32 {
	parts := strings.Split(s, "/")
	if len(parts) == 2 {
		num, _ := strconv.ParseUint(strings.TrimSpace(parts[0]), 10, 32)
		den, _ := strconv.ParseUint(strings.TrimSpace(parts[1]), 10, 32)
		if num > 0 && den > 0 {
			return []uint32{uint32(num), uint32(den)}
		}
	} else if len(parts) == 1 && s != "" {
		num, _ := strconv.ParseUint(strings.TrimSpace(parts[0]), 10, 32)
		if num > 0 {
			return []uint32{uint32(num), 1}
		}
	}
	return nil
}

func parseAperture(s string) []uint32 {
	s = strings.TrimPrefix(s, "f/")
	s = strings.TrimPrefix(s, "F/")
	val, err := strconv.ParseFloat(strings.TrimSpace(s), 64)
	if err == nil && val > 0 {
		return []uint32{uint32(val * 100), 100}
	}
	return nil
}

func parseFocal(s string) []uint32 {
	s = strings.ReplaceAll(s, "mm", "")
	s = strings.ReplaceAll(s, " ", "")
	val, err := strconv.ParseFloat(s, 64)
	if err == nil && val > 0 {
		return []uint32{uint32(val * 100), 100}
	}
	return nil
}

func copyFile(src, dst string) error {
	dir := filepath.Dir(dst)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	s, err := os.Open(src)
	if err != nil {
		return err
	}
	defer s.Close()
	d, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer d.Close()
	_, err = io.Copy(d, s)
	return err
}
