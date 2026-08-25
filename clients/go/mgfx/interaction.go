package mgfx

type ButtonStyle struct {
	Normal, Hovered, Pressed ShapeStyle
	Padding                  Insets
}

// Button is a measured component with persistent hover, press, and click state.
type Button struct {
	Style   ButtonStyle
	Child   Component
	OnClick func()
	hovered bool
	pressed bool
}

func (button *Button) Measure(constraints Constraints) Size {
	paddingWidth := button.Style.Padding.Left + button.Style.Padding.Right
	paddingHeight := button.Style.Padding.Top + button.Style.Padding.Bottom
	desired := Size{Width: paddingWidth, Height: paddingHeight}
	if button.Child != nil {
		maximum := Size{Width: max(float32(0), constraints.Maximum.Width-paddingWidth),
			Height: max(float32(0), constraints.Maximum.Height-paddingHeight)}
		child := button.Child.Measure(Loose(maximum))
		desired.Width += child.Width
		desired.Height += child.Height
	}
	return constraints.Constrain(desired)
}

func (button *Button) Paint(canvas *Canvas, bounds Rect) {
	style := button.Style.Normal
	if button.pressed && button.hovered {
		style = button.Style.Pressed
	} else if button.hovered {
		style = button.Style.Hovered
	}
	canvas.RoundedRect(bounds, style)
	if button.Child != nil {
		button.Child.Paint(canvas, bounds.Inset(button.Style.Padding))
	}
}

type componentHitTester interface{ hitTest(Rect, Point) *Button }

func contains(bounds Rect, point Point) bool {
	return point.X >= bounds.X && point.X <= bounds.X+bounds.Width &&
		point.Y >= bounds.Y && point.Y <= bounds.Y+bounds.Height
}
func hitComponent(component Component, bounds Rect, point Point) *Button {
	if component == nil || !contains(bounds, point) {
		return nil
	}
	if tester, ok := component.(componentHitTester); ok {
		return tester.hitTest(bounds, point)
	}
	return nil
}
func (button *Button) hitTest(bounds Rect, point Point) *Button {
	if contains(bounds, point) {
		return button
	}
	return nil
}
func (panel Panel) hitTest(bounds Rect, point Point) *Button {
	return hitComponent(panel.Child, bounds.Inset(panel.Padding), point)
}

func (alignment Align) childBounds(bounds Rect) Rect {
	if alignment.Child == nil {
		return Rect{}
	}
	size := alignment.Child.Measure(Loose(Size{Width: bounds.Width, Height: bounds.Height}))
	if alignment.Horizontal == AlignStretch {
		size.Width = bounds.Width
	}
	if alignment.Vertical == AlignStretch {
		size.Height = bounds.Height
	}
	return Rect{X: alignedOrigin(bounds.X, bounds.Width, size.Width, alignment.Horizontal),
		Y:     alignedOrigin(bounds.Y, bounds.Height, size.Height, alignment.Vertical),
		Width: size.Width, Height: size.Height}
}
func (alignment Align) hitTest(bounds Rect, point Point) *Button {
	return hitComponent(alignment.Child, alignment.childBounds(bounds), point)
}
func (offset Offset) hitTest(bounds Rect, point Point) *Button {
	bounds.X += offset.X
	bounds.Y += offset.Y
	return hitComponent(offset.Child, bounds, point)
}

func (stack ComponentStack) frames(bounds Rect) ([]Rect, error) {
	tracks := stack.childTracks(Tight(Size{Width: bounds.Width, Height: bounds.Height}))
	return (StackLayout{Axis: stack.Axis, Gap: stack.Gap, Padding: stack.Padding}).Arrange(
		bounds, tracks...)
}
func (stack ComponentStack) hitTest(bounds Rect, point Point) *Button {
	frames, err := stack.frames(bounds)
	if err != nil {
		return nil
	}
	for index := len(frames) - 1; index >= 0; index-- {
		if target := hitComponent(stack.Children[index].Child, frames[index], point); target != nil {
			return target
		}
	}
	return nil
}

// ComponentHost paints a tree and routes pointer events through the same layout.
type ComponentHost struct {
	root    Component
	bounds  Rect
	hovered *Button
	pressed *Button
}

func (host *ComponentHost) Paint(canvas *Canvas, bounds Rect, root Component) {
	host.root, host.bounds = root, bounds
	PaintComponentTree(canvas, bounds, root)
}
func (host *ComponentHost) target(point Point) *Button {
	return hitComponent(host.root, host.bounds, point)
}
func (host *ComponentHost) updateHover(target *Button) {
	if target == host.hovered {
		return
	}
	if host.hovered != nil {
		host.hovered.hovered = false
	}
	host.hovered = target
	if target != nil {
		target.hovered = true
	}
}
func (host *ComponentHost) PointerMove(point Point) { host.updateHover(host.target(point)) }
func (host *ComponentHost) PointerDown(point Point) {
	target := host.target(point)
	host.updateHover(target)
	if host.pressed != nil {
		host.pressed.pressed = false
	}
	host.pressed = target
	if target != nil {
		target.pressed = true
	}
}
func (host *ComponentHost) PointerUp(point Point) {
	target := host.target(point)
	host.updateHover(target)
	pressed := host.pressed
	host.pressed = nil
	if pressed == nil {
		return
	}
	pressed.pressed = false
	if pressed == target && pressed.OnClick != nil {
		pressed.OnClick()
	}
}
