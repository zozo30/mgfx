package mgfx

import "errors"

// Constraints bound a component's measured size in logical pixels.
type Constraints struct {
	Minimum, Maximum Size
}

func Tight(size Size) Constraints    { return Constraints{Minimum: size, Maximum: size} }
func Loose(maximum Size) Constraints { return Constraints{Maximum: maximum} }

func (constraints Constraints) Constrain(size Size) Size {
	maximumWidth, maximumHeight := constraints.Maximum.Width, constraints.Maximum.Height
	if maximumWidth <= 0 {
		maximumWidth = size.Width
	}
	if maximumHeight <= 0 {
		maximumHeight = size.Height
	}
	return Size{
		Width:  min(max(size.Width, constraints.Minimum.Width), maximumWidth),
		Height: min(max(size.Height, constraints.Minimum.Height), maximumHeight),
	}
}

// Component is a measured, paintable piece of interface. Implementations hold
// state in ordinary Go values and never expose protocol commands.
type Component interface {
	Measure(Constraints) Size
	Paint(*Canvas, Rect)
}

// PaintComponent adapts a preferred size and callback into a Component.
type PaintComponent struct {
	Preferred Size
	Draw      func(*Canvas, Rect)
}

func (component PaintComponent) Measure(constraints Constraints) Size {
	return constraints.Constrain(component.Preferred)
}
func (component PaintComponent) Paint(canvas *Canvas, bounds Rect) {
	if component.Draw != nil {
		component.Draw(canvas, bounds)
	}
}

// Label paints native server-shaped text. Advance should come from
// Client.MeasureText so the label participates in exact layout.
type Label struct {
	Value   string
	Style   TextStyle
	Advance float32
}

func (label Label) Measure(constraints Constraints) Size {
	return constraints.Constrain(Size{Width: label.Advance, Height: label.Style.Size * 1.2})
}
func (label Label) Paint(canvas *Canvas, bounds Rect) {
	style := label.Style
	style.X, style.Y = bounds.X, bounds.Y
	style.Anchor, style.Baseline = AnchorStart, BaselineTop
	canvas.Text(label.Value, style)
}

// Panel draws one rounded surface around an optional child.
type Panel struct {
	Style   ShapeStyle
	Padding Insets
	Child   Component
}

func (panel Panel) Measure(constraints Constraints) Size {
	paddingWidth := panel.Padding.Left + panel.Padding.Right
	paddingHeight := panel.Padding.Top + panel.Padding.Bottom
	desired := Size{Width: paddingWidth, Height: paddingHeight}
	if panel.Child != nil {
		maximum := Size{Width: max(float32(0), constraints.Maximum.Width-paddingWidth),
			Height: max(float32(0), constraints.Maximum.Height-paddingHeight)}
		child := panel.Child.Measure(Loose(maximum))
		desired.Width += child.Width
		desired.Height += child.Height
	}
	return constraints.Constrain(desired)
}
func (panel Panel) Paint(canvas *Canvas, bounds Rect) {
	canvas.RoundedRect(bounds, panel.Style)
	if panel.Child != nil {
		panel.Child.Paint(canvas, bounds.Inset(panel.Padding))
	}
}

type Alignment uint8

const (
	AlignStart Alignment = iota
	AlignCenter
	AlignEnd
	AlignStretch
)

// Align positions a measured child independently on each axis.
type Align struct {
	Horizontal, Vertical Alignment
	Child                Component
}

func (alignment Align) Measure(constraints Constraints) Size {
	if alignment.Child == nil {
		return constraints.Constrain(Size{})
	}
	return alignment.Child.Measure(constraints)
}
func alignedOrigin(origin, available, extent float32, alignment Alignment) float32 {
	switch alignment {
	case AlignCenter:
		return origin + (available-extent)/2
	case AlignEnd:
		return origin + available - extent
	default:
		return origin
	}
}
func (alignment Align) Paint(canvas *Canvas, bounds Rect) {
	if alignment.Child == nil {
		return
	}
	alignment.Child.Paint(canvas, alignment.childBounds(bounds))
}

// Offset translates a component without changing its reported size.
type Offset struct {
	X, Y  float32
	Child Component
}

func (offset Offset) Measure(constraints Constraints) Size {
	if offset.Child == nil {
		return constraints.Constrain(Size{})
	}
	return offset.Child.Measure(constraints)
}
func (offset Offset) Paint(canvas *Canvas, bounds Rect) {
	if offset.Child != nil {
		bounds.X += offset.X
		bounds.Y += offset.Y
		offset.Child.Paint(canvas, bounds)
	}
}

type StackChild struct {
	Track Track
	Child Component
}

// Overlay paints children in slice order into the same bounds. Later children
// appear above earlier children; wrap a child in Align to give it a smaller,
// positioned frame.
type Overlay struct {
	Children []Component
}

func (overlay Overlay) Measure(constraints Constraints) Size {
	desired := Size{}
	for _, child := range overlay.Children {
		if child == nil {
			continue
		}
		size := child.Measure(constraints)
		desired.Width = max(desired.Width, size.Width)
		desired.Height = max(desired.Height, size.Height)
	}
	return constraints.Constrain(desired)
}

func (overlay Overlay) Paint(canvas *Canvas, bounds Rect) {
	for _, child := range overlay.Children {
		if child != nil {
			child.Paint(canvas, bounds)
		}
	}
}

// Modal paints a backdrop and child above lower overlay layers. Use a stable
// pointer so its internal barrier can retain pointer state across frames.
type Modal struct {
	Backdrop  ShapeStyle
	Child     Component
	OnDismiss func()
	barrier   Button
	dismiss   Button
}

func (modal *Modal) Measure(constraints Constraints) Size {
	if modal.Child == nil {
		return constraints.Constrain(constraints.Maximum)
	}
	return modal.Child.Measure(constraints)
}

func (modal *Modal) Paint(canvas *Canvas, bounds Rect) {
	canvas.RoundedRect(bounds, modal.Backdrop)
	if modal.Child != nil {
		modal.Child.Paint(canvas, bounds)
	}
}

// ComponentStack combines track layout with measured children.
type ComponentStack struct {
	Axis     Axis
	Gap      float32
	Padding  Insets
	Children []StackChild
}

func (stack ComponentStack) childTracks(constraints Constraints) []Track {
	tracks := make([]Track, len(stack.Children))
	for index, child := range stack.Children {
		track := child.Track
		if child.Child != nil && track.Minimum == 0 && track.Grow == 0 {
			desired := child.Child.Measure(Loose(constraints.Maximum))
			track.Minimum = desired.Width
			if stack.Axis == Vertical {
				track.Minimum = desired.Height
			}
		}
		tracks[index] = track
	}
	return tracks
}

func (stack ComponentStack) Measure(constraints Constraints) Size {
	tracks := stack.childTracks(constraints)
	primary := stack.Gap * max(float32(0), float32(len(tracks)-1))
	cross := float32(0)
	for index, track := range tracks {
		primary += track.Minimum
		if child := stack.Children[index].Child; child != nil {
			desired := child.Measure(Loose(constraints.Maximum))
			if stack.Axis == Horizontal {
				cross = max(cross, desired.Height)
			} else {
				cross = max(cross, desired.Width)
			}
		}
	}
	if stack.Axis == Horizontal {
		return constraints.Constrain(Size{Width: primary + stack.Padding.Left + stack.Padding.Right,
			Height: cross + stack.Padding.Top + stack.Padding.Bottom})
	}
	return constraints.Constrain(Size{Width: cross + stack.Padding.Left + stack.Padding.Right,
		Height: primary + stack.Padding.Top + stack.Padding.Bottom})
}

func (stack ComponentStack) Paint(canvas *Canvas, bounds Rect) {
	frames, err := stack.frames(bounds)
	if err != nil {
		canvas.err = errors.New("component stack: " + err.Error())
		return
	}
	for index, frame := range frames {
		if child := stack.Children[index].Child; child != nil {
			child.Paint(canvas, frame)
		}
	}
}

func PaintComponentTree(canvas *Canvas, bounds Rect, root Component) {
	if root != nil {
		root.Paint(canvas, bounds)
	}
}
