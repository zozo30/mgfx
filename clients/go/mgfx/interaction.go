package mgfx

type ButtonStyle struct {
	Normal, Hovered, Focused, Pressed ShapeStyle
	Padding                           Insets
}

// Button is a measured component with persistent hover, press, and click state.
type Button struct {
	Style   ButtonStyle
	Child   Component
	OnClick func()
	hovered bool
	focused bool
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
	if button.pressed && button.Style.Pressed != (ShapeStyle{}) {
		style = button.Style.Pressed
	} else if button.hovered && button.Style.Hovered != (ShapeStyle{}) {
		style = button.Style.Hovered
	} else if button.focused {
		if button.Style.Focused != (ShapeStyle{}) {
			style = button.Style.Focused
		} else if button.Style.Hovered != (ShapeStyle{}) {
			style = button.Style.Hovered
		}
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
func (overlay Overlay) hitTest(bounds Rect, point Point) *Button {
	for index := len(overlay.Children) - 1; index >= 0; index-- {
		if target := hitComponent(overlay.Children[index], bounds, point); target != nil {
			return target
		}
	}
	return nil
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

type buttonEntry struct {
	button *Button
	bounds Rect
}
type componentButtonCollector interface {
	collectButtons(Rect, *[]buttonEntry)
}

func collectComponentButtons(component Component, bounds Rect, entries *[]buttonEntry) {
	if collector, ok := component.(componentButtonCollector); ok {
		collector.collectButtons(bounds, entries)
	}
}
func (button *Button) collectButtons(bounds Rect, entries *[]buttonEntry) {
	*entries = append(*entries, buttonEntry{button: button, bounds: bounds})
}
func (panel Panel) collectButtons(bounds Rect, entries *[]buttonEntry) {
	collectComponentButtons(panel.Child, bounds.Inset(panel.Padding), entries)
}
func (alignment Align) collectButtons(bounds Rect, entries *[]buttonEntry) {
	collectComponentButtons(alignment.Child, alignment.childBounds(bounds), entries)
}
func (offset Offset) collectButtons(bounds Rect, entries *[]buttonEntry) {
	bounds.X += offset.X
	bounds.Y += offset.Y
	collectComponentButtons(offset.Child, bounds, entries)
}
func (overlay Overlay) collectButtons(bounds Rect, entries *[]buttonEntry) {
	for _, child := range overlay.Children {
		collectComponentButtons(child, bounds, entries)
	}
}
func (stack ComponentStack) collectButtons(bounds Rect, entries *[]buttonEntry) {
	frames, err := stack.frames(bounds)
	if err != nil {
		return
	}
	for index, frame := range frames {
		collectComponentButtons(stack.Children[index].Child, frame, entries)
	}
}

// ComponentHost paints a tree and routes pointer events through the same layout.
type ComponentHost struct {
	root            Component
	bounds          Rect
	hovered         *Button
	pressed         *Button
	focused         *Button
	keyboardPressed *Button
	keyboardKey     Key
}

func (host *ComponentHost) Paint(canvas *Canvas, bounds Rect, root Component) {
	host.root, host.bounds = root, bounds
	PaintComponentTree(canvas, bounds, root)
}
func (host *ComponentHost) target(point Point) *Button {
	return hitComponent(host.root, host.bounds, point)
}

// CursorAt maps interactive component geometry to a portable native cursor.
func (host *ComponentHost) CursorAt(point Point) Cursor {
	if host.target(point) != nil {
		return CursorPointingHand
	}
	return CursorArrow
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
	host.setFocus(target)
	if host.pressed != nil {
		host.pressed.pressed = false
	}
	host.pressed = target
	if target != nil {
		target.pressed = true
	}
}

func (host *ComponentHost) setFocus(target *Button) {
	if target == host.focused {
		return
	}
	if host.focused != nil {
		host.focused.focused = false
	}
	host.focused = target
	if target != nil {
		target.focused = true
	}
}

func (host *ComponentHost) focusStep(reverse bool) {
	entries := []buttonEntry{}
	collectComponentButtons(host.root, host.bounds, &entries)
	if len(entries) == 0 {
		host.setFocus(nil)
		return
	}
	index := -1
	for candidate, entry := range entries {
		if entry.button == host.focused {
			index = candidate
			break
		}
	}
	if reverse {
		if index <= 0 {
			index = len(entries) - 1
		} else {
			index--
		}
	} else {
		index = (index + 1) % len(entries)
	}
	host.setFocus(entries[index].button)
}

// KeyDown and KeyUp provide Tab traversal plus Enter/Space activation.
func (host *ComponentHost) KeyDown(event KeyEvent) {
	if event.Key == KeyTab {
		host.focusStep(event.Modifiers&ModifierShift != 0)
		return
	}
	if (event.Key != KeyEnter && event.Key != KeySpace) || host.focused == nil ||
		host.keyboardPressed != nil {
		return
	}
	host.keyboardPressed = host.focused
	host.keyboardKey = event.Key
	host.keyboardPressed.pressed = true
}

func (host *ComponentHost) KeyUp(event KeyEvent) {
	if host.keyboardPressed == nil || event.Key != host.keyboardKey {
		return
	}
	button := host.keyboardPressed
	host.keyboardPressed = nil
	host.keyboardKey = KeyUnknown
	button.pressed = false
	if button == host.focused && button.OnClick != nil {
		button.OnClick()
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
