package mgfx

import (
	"bytes"
	"encoding/binary"
	"encoding/hex"
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
