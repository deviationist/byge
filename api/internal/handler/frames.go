package handler

import (
	"context"
	"fmt"
	"net/http"

	"github.com/deviationist/byge/api/internal/cache"
	"github.com/deviationist/byge/api/internal/field"
	"github.com/deviationist/byge/api/internal/frames"
)

// fetchWholeFrame pulls one complete national frame from MET.
//
// Whole, not a window, and that is the entire point of the store above it: 3.6
// million cells is only five times a national map window, and holding one lets
// every window at every zoom be a slice of memory instead of a request.
//
// It goes through the same cache as `/fetch`, so a frame already pulled for one
// reason is not pulled again for another, and two simultaneous first-time map
// loads collapse into one upstream call.
func (h *Handler) fetchWholeFrame(ctx context.Context, base string, frame int) ([]float32, error) {
	target := fmt.Sprintf(
		"%s.dods?lwe_precipitation_rate[%d:1:%d][0:1:%d][0:1:%d]",
		base, frame, frame, frames.NY-1, frames.NX-1,
	)

	entry, _, err := h.cache.Do(target, func() (cache.Entry, error) {
		return h.client.Fetch(ctx, target)
	})
	if err != nil {
		return nil, err
	}
	if entry.Status != http.StatusOK {
		return nil, fmt.Errorf("upstream returned %d", entry.Status)
	}
	return field.ParseDods(entry.Body, frames.NX*frames.NY)
}
