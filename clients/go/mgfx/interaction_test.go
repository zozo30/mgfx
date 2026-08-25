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
