package handler

import (
	"context"
	"fmt"
	"net/http"
	"time"

	"github.com/deviationist/byge/api/internal/cache"
)

// The dataset MET publishes the nowcast into.
//
// Held here rather than passed in by the client, which is the direction this
// service should have been built in from the start: the proxy knows what it
// talks to, and a caller that can name an upstream is a caller that can be
// pointed at one we did not choose. The warmer needs this anyway — nothing is
// asking it for a URL at four in the morning.
const (
	datasetDir  = "https://thredds.met.no/thredds/dodsC/radarnowcasting/"
	datasetStem = "yrwms-nordic.mos.pcappi-0-rr.noclass-clfilter-novpr-clcorr-block.nordiclcc-1000."
	// Analyses are stamped every five minutes.
	analysisStep = 5 * time.Minute
	// How far back to look before giving up. Publication runs late and
	// irregularly — measured between five and fifteen minutes behind the stamp
	// — so a short walk finds nothing at all for much of every hour.
	maxLookback = 8
)

// DatasetBase returns the dataset URL for a stamp, ready for an OPeNDAP suffix
// (`.dds`, `.ascii?…`, `.dods?…`).
//
// The `.nc` IS PART OF THE FILENAME, not an extension OPeNDAP strips. Leaving it
// off produces a URL that is well-formed, allowlisted, and answered by MET with
// `Error { code = 404; message = "FileNotFound" }` for every stamp ever
// published — which reads exactly like "the run has not landed yet" and sent the
// analysis walk back through all eight steps finding nothing. The suffix goes
// AFTER it: `….20260806T212500Z.nc.dds`.
//
// The stamp reaching here has already been validated — by the regex on the way
// in, or by being formatted from a time.Time — which is what makes this
// concatenation safe.
func DatasetBase(stamp string) string {
	return datasetDir + datasetStem + stamp + ".nc"
}

// AnalysisBase returns the dataset URL for an analysis time.
func AnalysisBase(t time.Time) string {
	return DatasetBase(t.UTC().Format(stampLayout))
}

/** The stamp format, shared by the formatter and the validating regex. */
const stampLayout = "20060102T150405Z"

// LatestAnalysis walks back from now until it finds a published analysis.
//
// Each probe is a metadata request — a few KB describing the file rather than
// reading it — and the response cache absorbs the repeats, including the 404s,
// which get the short negative TTL precisely so this poll stays cheap.
func (h *Handler) LatestAnalysis(ctx context.Context) (string, error) {
	now := time.Now().UTC().Truncate(analysisStep)
	for i := 0; i < maxLookback; i++ {
		base := AnalysisBase(now.Add(-time.Duration(i) * analysisStep))
		entry, _, err := h.cache.Do(base+".dds", func() (cache.Entry, error) {
			return h.client.Fetch(ctx, base+".dds")
		})
		if err != nil {
			return "", err
		}
		if entry.Status == http.StatusOK {
			return base, nil
		}
	}
	return "", fmt.Errorf("no analysis published in the last %d steps", maxLookback)
}
