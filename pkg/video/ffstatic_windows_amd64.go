//go:build windows && amd64

package video

import ffstatic "github.com/go-ffstatic/windows-amd64"

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
