//go:build linux && amd64

package video

import ffstatic "github.com/go-ffstatic/linux-amd64"

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
