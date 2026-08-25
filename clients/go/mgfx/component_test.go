package mgfx

import "testing"

type recordingComponent struct {
	desired Size
	painted Rect
}

func (component *recordingComponent) Measure(constraints Constraints) Size {
	return constraints.Constrain(component.desired)
}
func (component *recordingComponent) Paint(_ *Canvas, bounds Rect) { component.painted = bounds }

func TestPanelMeasuresPaddingAndAlignCentersIt(t *testing.T) {
	child := &recordingComponent{desired: Size{Width: 80, Height: 24}}
	panel := Panel{Padding: SymmetricInsets(10, 6), Child: child}
	if got := panel.Measure(Loose(Size{Width: 300, Height: 200})); got != (Size{100, 36}) {
		t.Fatalf("panel size = %#v", got)
	}
	Align{Horizontal: AlignCenter, Vertical: AlignCenter, Child: panel}.Paint(
		newCanvas(Size{Width: 300, Height: 200}), Rect{Width: 300, Height: 200})
	if child.painted != (Rect{X: 110, Y: 88, Width: 80, Height: 24}) {
		t.Fatalf("child frame = %#v", child.painted)
	}
}

func TestComponentStackPaintsTrackFrames(t *testing.T) {
	center := &recordingComponent{desired: Size{Width: 40, Height: 20}}
	right := &recordingComponent{desired: Size{Width: 30, Height: 20}}
	stack := ComponentStack{Axis: Horizontal, Gap: 5, Padding: UniformInsets(10),
		Children: []StackChild{
			{Track: Fixed(30)},
			{Track: Flex(1), Child: center},
			{Track: Fixed(30), Child: right},
		}}
	stack.Paint(newCanvas(Size{Width: 220, Height: 60}), Rect{Width: 220, Height: 60})
	if center.painted != (Rect{X: 45, Y: 10, Width: 130, Height: 40}) {
		t.Fatalf("center frame = %#v", center.painted)
	}
	if right.painted != (Rect{X: 180, Y: 10, Width: 30, Height: 40}) {
		t.Fatalf("right frame = %#v", right.painted)
	}
}
