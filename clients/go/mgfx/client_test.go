package mgfx

import (
	"context"
	"encoding/binary"
	"math"
	"net"
	"sync/atomic"
	"testing"
	"time"
)

func testFloats(values ...float32) []byte {
	payload := make([]byte, len(values)*4)
	for index, value := range values {
		binary.LittleEndian.PutUint32(payload[index*4:], math.Float32bits(value))
	}
	return payload
}

func TestInteractiveApplicationCoalescesInputRedraws(t *testing.T) {
	clientConnection, serverConnection := net.Pipe()
	client := &Client{connection: clientConnection, sequence: 1}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	defer serverConnection.Close()

	var draws atomic.Int32
	var clicks atomic.Int32
	done := make(chan error, 1)
	go func() {
		done <- client.ServeApplication(ctx, Application{
			Draw: func(canvas *Canvas) {
				draws.Add(1)
				canvas.Clear(RGB(0, 0, 0))
			},
			PointerDown: func(point Point) {
				if point.X == 24 && point.Y == 36 {
					clicks.Add(1)
				}
			},
		})
	}()

	resize := make([]byte, 8)
	binary.LittleEndian.PutUint32(resize[0:4], 640)
	binary.LittleEndian.PutUint32(resize[4:8], 360)
	if err := writeMessage(serverConnection, messageResize, resize, 0); err != nil {
		t.Fatal(err)
	}
	first, err := readMessage(serverConnection)
	if err != nil {
		t.Fatal(err)
	}
	if first.typeID != messageFrame || first.sequence != 1 || draws.Load() != 1 {
		t.Fatalf("unexpected first frame: %#v, draws=%d", first, draws.Load())
	}

	if err := writeMessage(serverConnection, messagePointerDown, testFloats(24, 36), 0); err != nil {
		t.Fatal(err)
	}
	if err := writeMessage(serverConnection, messageFramePresented, nil, 1); err != nil {
		t.Fatal(err)
	}
	second, err := readMessage(serverConnection)
	if err != nil {
		t.Fatal(err)
	}
	if second.typeID != messageFrame || second.sequence != 2 || draws.Load() != 2 {
		t.Fatalf("unexpected coalesced frame: %#v, draws=%d", second, draws.Load())
	}
	if clicks.Load() != 1 {
		t.Fatalf("pointer callback count = %d, want 1", clicks.Load())
	}

	cancel()
	select {
	case err := <-done:
		if err != nil {
			t.Fatal(err)
		}
	case <-time.After(time.Second):
		t.Fatal("application did not stop after context cancellation")
	}
}
