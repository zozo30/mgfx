package mgfx

import (
	"bytes"
	"encoding/binary"
	"encoding/hex"
	"math"
	"slices"
	"testing"
)

func TestMGIPMessageRoundTrip(t *testing.T) {
	encoded, err := encodeMessage(messageFrame, []byte{1, 2, 3}, 42)
	if err != nil {
		t.Fatal(err)
	}
	decoded, err := readMessage(bytes.NewReader(encoded))
	if err != nil {
		t.Fatal(err)
	}
	if decoded.typeID != messageFrame || decoded.sequence != 42 ||
		!bytes.Equal(decoded.payload, []byte{1, 2, 3}) {
		t.Fatalf("unexpected decoded message: %#v", decoded)
	}
}

func TestCanvasMatchesTypeScriptProtocolEncoder(t *testing.T) {
	canvas := newCanvas(Size{Width: 720, Height: 320})
	canvas.Clear(RGB(0.025, 0.035, 0.065))
	canvas.Text("Hello from Go over MGFX", TextStyle{
		X: 40, Y: 140, Size: 34, Color: RGB(0.72, 0.94, 1), Weight: SemiBold,
	})
	frame, err := canvas.finish()
	if err != nil {
		t.Fatal(err)
	}
	want, err := hex.DecodeString("4d474658010000006f000000030000000100000010000000cdcccc3c295c0f3db81e853d0000803f080000003700000000030000398e63bf0000003e9a99593eec51383fd7a3703f0000803f0000803f48656c6c6f2066726f6d20476f206f766572204d4746580300000000000000")
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(frame, want) {
		t.Fatalf("Go frame differs from TypeScript encoder:\n got %x\nwant %x", frame, want)
	}
	if commands := binary.LittleEndian.Uint32(frame[12:16]); commands != 3 {
		t.Fatalf("expected Clear, DrawText, EndFrame; got %d commands", commands)
	}
}

func TestCanvasShapesUseLogicalPixelGeometry(t *testing.T) {
	canvas := newCanvas(Size{Width: 200, Height: 100})
	canvas.RoundedRect(Rect{X: 20, Y: 10, Width: 100, Height: 50}, ShapeStyle{
		Fill: RGB(0.1, 0.2, 0.3), Border: RGB(0.5, 0.6, 0.7),
		BorderWidth: 2, CornerRadius: 12,
	})
	canvas.Circle(Rect{X: 150, Y: 25, Width: 30, Height: 30}, ShapeStyle{
		Fill: RGB(0.2, 0.8, 0.5),
	})
	frame, err := canvas.finish()
	if err != nil {
		t.Fatal(err)
	}
	if opcode := binary.LittleEndian.Uint16(frame[16:18]); opcode != 15 {
		t.Fatalf("first opcode = %d, want DrawRoundedRect", opcode)
	}
	rectPayload := frame[frameHeaderSize+commandHeaderSize:]
	for index, want := range []float32{-0.8, 0.8, 0.2, -0.2, 12, 2} {
		got := math.Float32frombits(binary.LittleEndian.Uint32(rectPayload[index*4:]))
		if math.Abs(float64(got-want)) > 0.00001 {
			t.Fatalf("rounded rectangle value %d = %f, want %f", index, got, want)
		}
	}
	circleOffset := frameHeaderSize + commandHeaderSize + 56
	if opcode := binary.LittleEndian.Uint16(frame[circleOffset : circleOffset+2]); opcode != 16 {
		t.Fatalf("second opcode = %d, want DrawCircle", opcode)
	}
}

func TestCanvasScopesClipAndOpacity(t *testing.T) {
	canvas := newCanvas(Size{Width: 200, Height: 100})
	canvas.Clip(Rect{X: 20, Y: 10, Width: 100, Height: 50}, func(canvas *Canvas) {
		canvas.Opacity(0.5, func(canvas *Canvas) {
			canvas.Circle(Rect{X: 30, Y: 20, Width: 24, Height: 24}, ShapeStyle{
				Fill: RGB(0.2, 0.8, 0.5),
			})
		})
	})
	frame, err := canvas.finish()
	if err != nil {
		t.Fatal(err)
	}
	opcodes := make([]uint16, 0, 6)
	for offset := frameHeaderSize; offset < len(frame); {
		opcodes = append(opcodes, binary.LittleEndian.Uint16(frame[offset:offset+2]))
		offset += commandHeaderSize + int(binary.LittleEndian.Uint32(frame[offset+4:offset+8]))
	}
	want := []uint16{4, 11, 16, 12, 5, 3}
	if !slices.Equal(opcodes, want) {
		t.Fatalf("scoped opcodes = %v, want %v", opcodes, want)
	}
	clip := frame[frameHeaderSize+commandHeaderSize:]
	for index, want := range []float32{-0.8, 0.8, 0.2, -0.2} {
		got := math.Float32frombits(binary.LittleEndian.Uint32(clip[index*4:]))
		if math.Abs(float64(got-want)) > 0.00001 {
			t.Fatalf("clip value %d = %f, want %f", index, got, want)
		}
	}
}

func TestCanvasTransformConvertsPixelTranslation(t *testing.T) {
	canvas := newCanvas(Size{Width: 200, Height: 100})
	canvas.Transform(Transform{TranslateX: 20, TranslateY: 10, Rotation: 90,
		Origin: Point{X: 100, Y: 50}}, func(canvas *Canvas) {
		canvas.RoundedRect(Rect{X: 70, Y: 30, Width: 60, Height: 40}, ShapeStyle{
			Fill: RGB(0.3, 0.7, 1), CornerRadius: 8,
		})
	})
	frame, err := canvas.finish()
	if err != nil {
		t.Fatal(err)
	}
	opcodes := make([]uint16, 0, 4)
	for offset := frameHeaderSize; offset < len(frame); {
		opcodes = append(opcodes, binary.LittleEndian.Uint16(frame[offset:offset+2]))
		offset += commandHeaderSize + int(binary.LittleEndian.Uint32(frame[offset+4:offset+8]))
	}
	if want := []uint16{9, 15, 10, 3}; !slices.Equal(opcodes, want) {
		t.Fatalf("transform opcodes = %v, want %v", opcodes, want)
	}
	payload := frame[frameHeaderSize+commandHeaderSize:]
	for index, want := range []float32{0, -1, 1, 0, 0.2, -0.2} {
		got := math.Float32frombits(binary.LittleEndian.Uint32(payload[index*4:]))
		if math.Abs(float64(got-want)) > 0.00001 {
			t.Fatalf("transform value %d = %f, want %f", index, got, want)
		}
	}
}
