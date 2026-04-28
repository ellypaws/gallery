//go:build linux && arm64

package video

import ffstatic "github.com/go-ffstatic/linux-arm64"

func ffstaticBinary(name string) string {
	switch name {
	case "ffmpeg":
		return ffstatic.FFmpegPath()
	case "ffprobe":
		return ffstatic.FFprobePath()
	default:
		return ""
	}
}
