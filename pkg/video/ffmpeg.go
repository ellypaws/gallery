package video

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"sort"
	"strconv"
	"strings"

	"github.com/charmbracelet/log"
	ffmpeg "github.com/u2takey/ffmpeg-go"
)

const posterVariant = "poster"

var targetHeights = []int{480, 720, 1080}
var durationPattern = regexp.MustCompile(`Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)`)
var dimensionsPattern = regexp.MustCompile(`(?i)Video:.*?([0-9]{2,5})x([0-9]{2,5})`)
var rotationPattern = regexp.MustCompile(`(?i)rotation of\s*(-?\d+(?:\.\d+)?)\s*degrees`)

type GeneratedDerivative struct {
	Variant      string
	RelativePath string
	Width        int
	Height       int
	ByteSize     int64
	MimeType     string
}

type ProcessedVideo struct {
	Width       int
	Height      int
	Duration    float64
	ByteSize    int64
	MimeType    string
	Placeholder string
	Derivatives []GeneratedDerivative
}

type Processor struct {
	FFmpegPath  string
	FFprobePath string
}

type probeResponse struct {
	Streams []probeStream `json:"streams"`
	Format  probeFormat   `json:"format"`
}

type probeStream struct {
	CodecType string            `json:"codec_type"`
	Width     int               `json:"width"`
	Height    int               `json:"height"`
	Duration  string            `json:"duration"`
	Tags      map[string]string `json:"tags"`
	SideData  []probeSideData   `json:"side_data_list"`
}

type probeSideData struct {
	Rotation int `json:"rotation"`
}

type probeFormat struct {
	Duration string            `json:"duration"`
	Tags     map[string]string `json:"tags"`
}

func NewProcessor() Processor {
	return Processor{
		FFmpegPath:  resolveBinary("FFMPEG_PATH", "ffmpeg"),
		FFprobePath: resolveBinary("FFPROBE_PATH", "ffprobe"),
	}
}

func (p Processor) Process(ctx context.Context, srcPath, cacheDir, hash string, logger *log.Logger) (ProcessedVideo, error) {
	if p.FFmpegPath == "" {
		return ProcessedVideo{}, errors.New("ffmpeg is required for video processing")
	}

	info, err := os.Stat(srcPath)
	if err != nil {
		return ProcessedVideo{}, err
	}

	meta, err := p.Probe(ctx, srcPath)
	if err != nil {
		return ProcessedVideo{}, err
	}

	result := ProcessedVideo{
		Width:    meta.Width,
		Height:   meta.Height,
		Duration: meta.Duration,
		ByteSize: info.Size(),
		MimeType: "video/mp4",
	}

	cacheSubdir := filepath.Join(cacheDir, hash[:2], hash[2:4])
	if err := os.MkdirAll(cacheSubdir, 0o755); err != nil {
		return ProcessedVideo{}, err
	}

	posterRel := filepath.ToSlash(filepath.Join(hash[:2], hash[2:4], hash+"-poster.jpg"))
	posterPath := filepath.Join(cacheDir, filepath.FromSlash(posterRel))
	posterWidth, posterHeight := scaleToWidth(meta.Width, meta.Height, min(meta.Width, 960))
	logger.Debug("generating video poster", "path", srcPath, "width", posterWidth, "height", posterHeight)
	if err := p.runStream(ctx, buildPosterCommand(srcPath, posterPath, posterWidth, posterHeight)); err != nil {
		return ProcessedVideo{}, err
	}
	posterStat, err := os.Stat(posterPath)
	if err != nil {
		return ProcessedVideo{}, err
	}
	result.Placeholder = posterRel
	result.Derivatives = append(result.Derivatives, GeneratedDerivative{
		Variant:      posterVariant,
		RelativePath: posterRel,
		Width:        posterWidth,
		Height:       posterHeight,
		ByteSize:     posterStat.Size(),
		MimeType:     "image/jpeg",
	})

	for _, height := range heightsFor(meta.Height) {
		width, scaledHeight := scaleToHeight(meta.Width, meta.Height, height)
		quality := fmt.Sprintf("%dp", scaledHeight)
		rel := filepath.ToSlash(filepath.Join(hash[:2], hash[2:4], fmt.Sprintf("%s-%s.mp4", hash, quality)))
		outPath := filepath.Join(cacheDir, filepath.FromSlash(rel))

		logger.Debug("generating video derivative", "path", srcPath, "quality", quality, "width", width, "height", scaledHeight)
		if err := p.encodeMP4(ctx, srcPath, outPath, width, scaledHeight); err != nil {
			return ProcessedVideo{}, err
		}
		stat, err := os.Stat(outPath)
		if err != nil {
			return ProcessedVideo{}, err
		}

		result.Derivatives = append(result.Derivatives, GeneratedDerivative{
			Variant:      "video-" + quality,
			RelativePath: rel,
			Width:        width,
			Height:       scaledHeight,
			ByteSize:     stat.Size(),
			MimeType:     "video/mp4",
		})
	}

	return result, nil
}

type Metadata struct {
	Width    int
	Height   int
	Duration float64
}

func (p Processor) Probe(ctx context.Context, srcPath string) (Metadata, error) {
	if p.FFprobePath == "" {
		return p.probeWithFFmpeg(ctx, srcPath)
	}

	output, err := exec.CommandContext(ctx, p.FFprobePath, "-v", "error", "-print_format", "json", "-show_streams", "-show_format", srcPath).Output()
	if err != nil {
		return Metadata{}, err
	}

	var response probeResponse
	if err := json.Unmarshal(output, &response); err != nil {
		return Metadata{}, err
	}

	for _, stream := range response.Streams {
		if stream.CodecType != "video" {
			continue
		}
		width, height := orientedDimensions(stream)
		duration := parseFloat(stream.Duration)
		if duration == 0 {
			duration = parseFloat(response.Format.Duration)
		}
		if width <= 0 || height <= 0 {
			return Metadata{}, errors.New("video stream is missing dimensions")
		}
		return Metadata{Width: width, Height: height, Duration: duration}, nil
	}

	return Metadata{}, errors.New("no video stream found")
}

func (p Processor) probeWithFFmpeg(ctx context.Context, srcPath string) (Metadata, error) {
	cmd := exec.CommandContext(ctx, p.FFmpegPath, "-hide_banner", "-i", srcPath)
	output, _ := cmd.CombinedOutput()
	text := string(output)

	dimensionMatch := dimensionsPattern.FindStringSubmatch(text)
	if len(dimensionMatch) < 3 {
		return Metadata{}, errors.New("ffmpeg probe output is missing video dimensions")
	}

	width := parseInt(dimensionMatch[1])
	height := parseInt(dimensionMatch[2])
	rotationMatch := rotationPattern.FindStringSubmatch(text)
	if len(rotationMatch) >= 2 {
		rotation := int(math.Abs(parseFloat(rotationMatch[1]))) % 180
		if rotation == 90 {
			width, height = height, width
		}
	}

	duration := 0.0
	durationMatch := durationPattern.FindStringSubmatch(text)
	if len(durationMatch) >= 4 {
		hours := parseFloat(durationMatch[1])
		minutes := parseFloat(durationMatch[2])
		seconds := parseFloat(durationMatch[3])
		duration = hours*3600 + minutes*60 + seconds
	}

	if width <= 0 || height <= 0 {
		return Metadata{}, errors.New("video stream is missing dimensions")
	}

	return Metadata{Width: width, Height: height, Duration: duration}, nil
}

func (p Processor) encodeMP4(ctx context.Context, srcPath, outPath string, width, height int) error {
	if err := os.MkdirAll(filepath.Dir(outPath), 0o755); err != nil {
		return err
	}

	return p.runStream(ctx, buildMP4Command(srcPath, outPath, width, height))
}

func buildPosterCommand(srcPath, posterPath string, width, height int) *ffmpeg.Stream {
	return ffmpeg.Input(srcPath, ffmpeg.KwArgs{"ss": "0.1"}).Output(posterPath, ffmpeg.KwArgs{
		"frames:v": 1,
		"pix_fmt":  "yuvj420p",
		"q:v":      3,
		"vf":       fmt.Sprintf("scale=%d:%d", width, height),
	})
}

func buildMP4Command(srcPath, outPath string, width, height int) *ffmpeg.Stream {
	return ffmpeg.Input(srcPath).Output(outPath, ffmpeg.KwArgs{
		"ac":        2,
		"b:a":       "128k",
		"c:a":       "aac",
		"c:v":       "libx264",
		"crf":       23,
		"format":    "mp4",
		"map":       []string{"0:v:0", "0:a?"},
		"movflags":  "+faststart",
		"pix_fmt":   "yuv420p",
		"preset":    "veryfast",
		"profile:v": "high",
		"tag:v":     "avc1",
		"vf":        fmt.Sprintf("scale=%d:%d", width, height),
	})
}

func (p Processor) runStream(ctx context.Context, stream *ffmpeg.Stream) error {
	args := append([]string{"-y", "-hide_banner", "-loglevel", "error"}, stream.GetArgs()...)
	cmd := exec.CommandContext(ctx, p.FFmpegPath, args...)
	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("ffmpeg failed: %w: %s", err, strings.TrimSpace(string(output)))
	}
	return nil
}

func resolveBinary(envKey, name string) string {
	if value := strings.TrimSpace(os.Getenv(envKey)); value != "" {
		return value
	}
	if local := localBinary(name); local != "" {
		return local
	}
	path, err := exec.LookPath(name)
	if err == nil {
		return path
	}
	return normalizeExecutablePath(ffstaticBinary(name))
}

func localBinary(name string) string {
	candidates := []string{
		filepath.Join("pkg", "video", "bin", runtimeBinaryName(name)),
		filepath.Join("bin", runtimeBinaryName(name)),
	}
	for _, candidate := range candidates {
		if stat, err := os.Stat(candidate); err == nil && !stat.IsDir() {
			return candidate
		}
	}
	return ""
}

func normalizeExecutablePath(path string) string {
	if path == "" || runtime.GOOS != "windows" || strings.EqualFold(filepath.Ext(path), ".exe") {
		return path
	}

	exePath := path + ".exe"
	if stat, err := os.Stat(exePath); err == nil && !stat.IsDir() {
		return exePath
	}

	src, err := os.Open(path)
	if err != nil {
		return path
	}
	defer src.Close()

	dst, err := os.OpenFile(exePath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o755)
	if err != nil {
		return path
	}
	_, copyErr := io.Copy(dst, src)
	closeErr := dst.Close()
	if copyErr != nil || closeErr != nil {
		_ = os.Remove(exePath)
		return path
	}

	return exePath
}

func runtimeBinaryName(name string) string {
	if filepath.Ext(name) != "" {
		return name
	}
	if runtime.GOOS == "windows" {
		return name + ".exe"
	}
	return name
}

func orientedDimensions(stream probeStream) (int, int) {
	width := stream.Width
	height := stream.Height
	rotation := 0
	if stream.Tags != nil {
		rotation = parseInt(stream.Tags["rotate"])
	}
	for _, data := range stream.SideData {
		if data.Rotation != 0 {
			rotation = data.Rotation
			break
		}
	}
	rotation = int(math.Abs(float64(rotation))) % 180
	if rotation == 90 {
		return height, width
	}
	return width, height
}

func heightsFor(sourceHeight int) []int {
	heights := make([]int, 0, 4)
	for _, height := range targetHeights {
		if height < sourceHeight {
			heights = append(heights, height)
		}
	}
	if len(heights) == 0 || heights[len(heights)-1] != sourceHeight {
		heights = append(heights, sourceHeight)
	}
	if len(heights) > 4 {
		heights = heights[len(heights)-4:]
	}
	sort.Ints(heights)
	return heights
}

func scaleToHeight(sourceWidth, sourceHeight, targetHeight int) (int, int) {
	if sourceWidth <= 0 || sourceHeight <= 0 || targetHeight <= 0 {
		return sourceWidth, sourceHeight
	}
	height := even(targetHeight)
	width := even(int(math.Round(float64(sourceWidth) * (float64(height) / float64(sourceHeight)))))
	return width, height
}

func scaleToWidth(sourceWidth, sourceHeight, targetWidth int) (int, int) {
	if sourceWidth <= 0 || sourceHeight <= 0 || targetWidth <= 0 {
		return sourceWidth, sourceHeight
	}
	width := even(targetWidth)
	height := even(int(math.Round(float64(sourceHeight) * (float64(width) / float64(sourceWidth)))))
	return width, height
}

func even(value int) int {
	if value < 2 {
		return 2
	}
	if value%2 != 0 {
		return value - 1
	}
	return value
}

func parseFloat(value string) float64 {
	parsed, _ := strconv.ParseFloat(strings.TrimSpace(value), 64)
	return parsed
}

func parseInt(value string) int {
	parsed, _ := strconv.Atoi(strings.TrimSpace(value))
	return parsed
}
