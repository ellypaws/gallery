//go:build !(windows && amd64) && !(linux && amd64) && !(linux && arm64) && !(darwin && amd64) && !(darwin && arm64)

package video

func ffstaticBinary(string) string {
	return ""
}
