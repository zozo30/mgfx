package mgfx

import (
	"errors"
	"math"
)

// Insets describes logical-pixel space removed from the edges of a rectangle.
type Insets struct {
	Top, Right, Bottom, Left float32
}

func UniformInsets(value float32) Insets {
	return Insets{Top: value, Right: value, Bottom: value, Left: value}
}

func SymmetricInsets(horizontal, vertical float32) Insets {
	return Insets{Top: vertical, Right: horizontal, Bottom: vertical, Left: horizontal}
}

// Inset returns the content rectangle after applying padding. An over-sized
// inset produces an empty rectangle rather than negative dimensions.
func (bounds Rect) Inset(insets Insets) Rect {
	width := max(float32(0), bounds.Width-insets.Left-insets.Right)
	height := max(float32(0), bounds.Height-insets.Top-insets.Bottom)
	return Rect{X: bounds.X + insets.Left, Y: bounds.Y + insets.Top,
		Width: width, Height: height}
}

// Centered returns a rectangle of size centered inside bounds. Its dimensions
// are clamped to the available space.
func (bounds Rect) Centered(size Size) Rect {
	width := min(max(float32(0), size.Width), max(float32(0), bounds.Width))
	height := min(max(float32(0), size.Height), max(float32(0), bounds.Height))
	return Rect{X: bounds.X + (bounds.Width-width)/2, Y: bounds.Y + (bounds.Height-height)/2,
		Width: width, Height: height}
}

type Axis uint8

const (
	Horizontal Axis = iota
	Vertical
)

// Track reserves Minimum pixels and receives a weighted share of remaining
// space when Grow is positive.
type Track struct {
	Minimum float32
	Grow    float32
}

func Fixed(size float32) Track  { return Track{Minimum: size} }
func Flex(weight float32) Track { return Track{Grow: weight} }
func Flexible(minimum, weight float32) Track {
	return Track{Minimum: minimum, Grow: weight}
}

// StackLayout arranges stretching tracks along one axis. Fixed and flexible
// tracks can be mixed without clients manually calculating offsets.
type StackLayout struct {
	Axis    Axis
	Gap     float32
	Padding Insets
}

func (layout StackLayout) Arrange(bounds Rect, tracks ...Track) ([]Rect, error) {
	if len(tracks) == 0 {
		return nil, nil
	}
	values := []float32{bounds.X, bounds.Y, bounds.Width, bounds.Height, layout.Gap,
		layout.Padding.Top, layout.Padding.Right, layout.Padding.Bottom, layout.Padding.Left}
	for _, value := range values {
		if math.IsNaN(float64(value)) || math.IsInf(float64(value), 0) {
			return nil, errors.New("layout geometry must be finite")
		}
	}
	if bounds.Width < 0 || bounds.Height < 0 || layout.Gap < 0 || layout.Axis > Vertical ||
		layout.Padding.Top < 0 || layout.Padding.Right < 0 ||
		layout.Padding.Bottom < 0 || layout.Padding.Left < 0 {
		return nil, errors.New("layout dimensions cannot be negative")
	}
	content := bounds.Inset(layout.Padding)
	available := content.Width
	if layout.Axis == Vertical {
		available = content.Height
	}
	available -= layout.Gap * float32(len(tracks)-1)
	minimum := float32(0)
	totalGrow := float32(0)
	for _, track := range tracks {
		if !finite(track.Minimum, track.Grow) || track.Minimum < 0 || track.Grow < 0 {
			return nil, errors.New("track values must be finite and non-negative")
		}
		minimum += track.Minimum
		totalGrow += track.Grow
	}
	if available < minimum {
		return nil, errors.New("layout tracks do not fit their bounds")
	}
	extra := available - minimum
	result := make([]Rect, len(tracks))
	cursor := content.X
	if layout.Axis == Vertical {
		cursor = content.Y
	}
	for index, track := range tracks {
		extent := track.Minimum
		if totalGrow > 0 {
			extent += extra * track.Grow / totalGrow
		}
		if layout.Axis == Horizontal {
			result[index] = Rect{X: cursor, Y: content.Y, Width: extent, Height: content.Height}
		} else {
			result[index] = Rect{X: content.X, Y: cursor, Width: content.Width, Height: extent}
		}
		cursor += extent + layout.Gap
	}
	return result, nil
}
