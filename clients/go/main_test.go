package main

import (
	"bytes"
	"encoding/binary"
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

func TestBasicTextFrame(t *testing.T) {
	frame, err := makeFrame(720, 320)
	if err != nil {
		t.Fatal(err)
	}
	if string(frame[0:4]) != "MGFX" {
		t.Fatal("missing MGFX frame magic")
	}
	if size := binary.LittleEndian.Uint32(frame[8:12]); int(size) != len(frame) {
		t.Fatalf("frame declares %d bytes, encoded %d", size, len(frame))
	}
	if commands := binary.LittleEndian.Uint32(frame[12:16]); commands != 3 {
		t.Fatalf("expected Clear, DrawText, EndFrame; got %d commands", commands)
	}
	if opcode := binary.LittleEndian.Uint16(frame[16:18]); opcode != 1 {
		t.Fatalf("first opcode = %d, want Clear", opcode)
	}
	textOffset := frameHeaderSize + commandHeaderSize + 16
	if opcode := binary.LittleEndian.Uint16(frame[textOffset : textOffset+2]); opcode != 8 {
		t.Fatalf("second opcode = %d, want DrawText", opcode)
	}
}
