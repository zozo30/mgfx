package mgfx

import "testing"

func TestComponentHostRoutesButtonClickThroughLayout(t *testing.T) {
	clicks := 0
	button := &Button{Child: PaintComponent{Preferred: Size{Width: 40, Height: 24}},
		Style: ButtonStyle{Padding: UniformInsets(4)}, OnClick: func() { clicks++ }}
	root := ComponentStack{Axis: Horizontal, Padding: UniformInsets(10),
		Children: []StackChild{{Track: Flex(1), Child: Align{
			Horizontal: AlignCenter, Vertical: AlignCenter, Child: button}}}}
	host := &ComponentHost{}
	host.Paint(newCanvas(Size{Width: 200, Height: 100}), Rect{Width: 200, Height: 100}, root)
	host.PointerMove(Point{X: 100, Y: 50})
	host.PointerDown(Point{X: 100, Y: 50})
	if !button.hovered || !button.pressed {
		t.Fatal("button did not enter hover and pressed state")
	}
	host.PointerUp(Point{X: 100, Y: 50})
	if button.pressed || clicks != 1 {
		t.Fatalf("pressed=%v clicks=%d", button.pressed, clicks)
	}
}

func TestButtonReleaseOutsideDoesNotClick(t *testing.T) {
	clicks := 0
	button := &Button{OnClick: func() { clicks++ }}
	host := &ComponentHost{}
	host.Paint(newCanvas(Size{Width: 80, Height: 40}), Rect{Width: 80, Height: 40}, button)
	host.PointerDown(Point{X: 10, Y: 10})
	host.PointerMove(Point{X: 100, Y: 100})
	host.PointerUp(Point{X: 100, Y: 100})
	if clicks != 0 || button.pressed || button.hovered {
		t.Fatalf("outside release left state: clicks=%d pressed=%v hovered=%v",
			clicks, button.pressed, button.hovered)
	}
}

func TestComponentHostTraversesAndActivatesButtonsFromKeyboard(t *testing.T) {
	clicks := [2]int{0, 0}
	first := &Button{OnClick: func() { clicks[0]++ }}
	second := &Button{OnClick: func() { clicks[1]++ }}
	root := ComponentStack{Axis: Horizontal, Children: []StackChild{
		{Track: Flex(1), Child: first}, {Track: Flex(1), Child: second},
	}}
	host := &ComponentHost{}
	host.Paint(newCanvas(Size{Width: 200, Height: 40}), Rect{Width: 200, Height: 40}, root)

	host.KeyDown(KeyEvent{Key: KeyTab})
	if !first.focused || second.focused {
		t.Fatal("Tab did not focus the first button")
	}
	host.KeyDown(KeyEvent{Key: KeyTab})
	if first.focused || !second.focused {
		t.Fatal("second Tab did not focus the second button")
	}
	host.KeyDown(KeyEvent{Key: KeySpace})
	if !second.pressed {
		t.Fatal("Space did not press the focused button")
	}
	host.KeyUp(KeyEvent{Key: KeySpace})
	if second.pressed || clicks != [2]int{0, 1} {
		t.Fatalf("keyboard activation state: pressed=%v clicks=%v", second.pressed, clicks)
	}
	host.KeyDown(KeyEvent{Key: KeyTab, Modifiers: ModifierShift})
	if !first.focused || second.focused {
		t.Fatal("Shift-Tab did not traverse backward")
	}
}

func TestOverlayHitTestingPrefersFrontmostButton(t *testing.T) {
	clicks := [2]int{}
	back := &Button{OnClick: func() { clicks[0]++ }}
	front := &Button{OnClick: func() { clicks[1]++ }}
	host := &ComponentHost{}
	host.Paint(newCanvas(Size{Width: 100, Height: 60}), Rect{Width: 100, Height: 60},
		Overlay{Children: []Component{back, front}})
	host.PointerDown(Point{X: 50, Y: 30})
	host.PointerUp(Point{X: 50, Y: 30})
	if clicks != [2]int{0, 1} {
		t.Fatalf("overlay click order = %v", clicks)
	}
}

func TestModalBlocksBackdropAndDismissesFromResolvedContent(t *testing.T) {
	lowerClicks, dismissals := 0, 0
	lower := &Button{OnClick: func() { lowerClicks++ }}
	modal := &Modal{OnDismiss: func() { dismissals++ },
		Child: Align{Horizontal: AlignCenter, Vertical: AlignCenter,
			Child: PaintComponent{Preferred: Size{Width: 40, Height: 20}}}}
	host := &ComponentHost{}
	host.Paint(newCanvas(Size{Width: 120, Height: 80}), Rect{Width: 120, Height: 80},
		Overlay{Children: []Component{lower, modal}})

	if cursor := host.CursorAt(Point{X: 10, Y: 10}); cursor != CursorArrow {
		t.Fatalf("modal backdrop cursor = %d, want arrow", cursor)
	}
	host.PointerDown(Point{X: 10, Y: 10})
	host.PointerUp(Point{X: 10, Y: 10})
	if lowerClicks != 0 || dismissals != 0 {
		t.Fatalf("backdrop routing: lower=%d dismissals=%d", lowerClicks, dismissals)
	}
	host.PointerDown(Point{X: 60, Y: 40})
	host.PointerUp(Point{X: 60, Y: 40})
	if lowerClicks != 0 || dismissals != 1 {
		t.Fatalf("modal routing: lower=%d dismissals=%d", lowerClicks, dismissals)
	}
}
