package mgfx

import "testing"

func TestHorizontalStackDistributesFlexibleSpace(t *testing.T) {
	columns, err := (StackLayout{Axis: Horizontal, Gap: 10,
		Padding: SymmetricInsets(20, 8)}).Arrange(
		Rect{X: 5, Y: 7, Width: 380, Height: 100},
		Fixed(60), Flexible(80, 1), Flex(2),
	)
	if err != nil {
		t.Fatal(err)
	}
	want := []Rect{
		{X: 25, Y: 15, Width: 60, Height: 84},
		{X: 95, Y: 15, Width: 140, Height: 84},
		{X: 245, Y: 15, Width: 120, Height: 84},
	}
	for index := range want {
		if columns[index] != want[index] {
			t.Fatalf("column %d = %#v, want %#v", index, columns[index], want[index])
		}
	}
}

func TestVerticalStackAndCenteredBounds(t *testing.T) {
	rows, err := (StackLayout{Axis: Vertical, Gap: 4}).Arrange(
		Rect{Width: 120, Height: 80}, Fixed(20), Flex(1), Fixed(12))
	if err != nil {
		t.Fatal(err)
	}
	if rows[1] != (Rect{X: 0, Y: 24, Width: 120, Height: 40}) {
		t.Fatalf("flex row = %#v", rows[1])
	}
	if centered := rows[1].Centered(Size{Width: 32, Height: 18}); centered != (Rect{X: 44, Y: 35, Width: 32, Height: 18}) {
		t.Fatalf("centered rectangle = %#v", centered)
	}
}

func TestStackRejectsOverconstrainedTracks(t *testing.T) {
	_, err := (StackLayout{Axis: Horizontal, Gap: 8}).Arrange(
		Rect{Width: 100, Height: 20}, Fixed(60), Fixed(60))
	if err == nil {
		t.Fatal("expected over-constrained layout to fail")
	}
}
