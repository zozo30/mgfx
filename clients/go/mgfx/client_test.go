package mgfx

import (
	"context"
	"encoding/binary"
	"math"
	"net"
	"slices"
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

func TestApplicationAnimationUsesServerClock(t *testing.T) {
	clientConnection, serverConnection := net.Pipe()
	client := &Client{connection: clientConnection, sequence: 1}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	defer serverConnection.Close()

	var animationNanos atomic.Int64
	done := make(chan error, 1)
	go func() {
		done <- client.ServeApplication(ctx, Application{
			Draw:      func(canvas *Canvas) { canvas.Clear(RGB(0, 0, 0)) },
			Animation: func(now time.Duration) { animationNanos.Store(int64(now)) },
		})
	}()

	resize := make([]byte, 8)
	binary.LittleEndian.PutUint32(resize[0:4], 320)
	binary.LittleEndian.PutUint32(resize[4:8], 200)
	if err := writeMessage(serverConnection, messageResize, resize, 0); err != nil {
		t.Fatal(err)
	}
	if frame, err := readMessage(serverConnection); err != nil || frame.typeID != messageFrame {
		t.Fatalf("initial frame = %#v, %v", frame, err)
	}
	request, err := readMessage(serverConnection)
	if err != nil || request.typeID != messageRequestAnimationFrame || request.sequence != 1 {
		t.Fatalf("animation request = %#v, %v", request, err)
	}

	clock := make([]byte, 8)
	binary.LittleEndian.PutUint64(clock, 1_234_567_890)
	if err := writeMessage(serverConnection, messageAnimationFrame, clock, request.sequence); err != nil {
		t.Fatal(err)
	}
	nextRequest, err := readMessage(serverConnection)
	if err != nil || nextRequest.typeID != messageRequestAnimationFrame || nextRequest.sequence != 2 {
		t.Fatalf("next animation request = %#v, %v", nextRequest, err)
	}
	if got := animationNanos.Load(); got != 1_234_567_890 {
		t.Fatalf("animation time = %d, want server nanoseconds", got)
	}

	cancel()
	select {
	case err := <-done:
		if err != nil {
			t.Fatal(err)
		}
	case <-time.After(time.Second):
		t.Fatal("animated application did not stop")
	}
}

func TestApplicationSuspendsAndResumesAnimationRequests(t *testing.T) {
	clientConnection, serverConnection := net.Pipe()
	client := &Client{connection: clientConnection, sequence: 1}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	defer serverConnection.Close()
	var active atomic.Bool
	var animationNanos atomic.Int64
	active.Store(true)
	done := make(chan error, 1)
	go func() {
		done <- client.ServeApplication(ctx, Application{
			Draw:            func(canvas *Canvas) { canvas.Clear(RGB(0, 0, 0)) },
			Animation:       func(now time.Duration) { animationNanos.Store(int64(now)) },
			AnimationActive: active.Load,
			PointerDown:     func(Point) {},
		})
	}()

	resize := make([]byte, 8)
	binary.LittleEndian.PutUint32(resize[0:4], 320)
	binary.LittleEndian.PutUint32(resize[4:8], 200)
	if err := writeMessage(serverConnection, messageResize, resize, 0); err != nil {
		t.Fatal(err)
	}
	if frame, err := readMessage(serverConnection); err != nil || frame.typeID != messageFrame {
		t.Fatalf("initial frame = %#v, %v", frame, err)
	}
	request, err := readMessage(serverConnection)
	if err != nil || request.typeID != messageRequestAnimationFrame {
		t.Fatalf("initial animation request = %#v, %v", request, err)
	}

	clock := make([]byte, 8)
	binary.LittleEndian.PutUint64(clock, uint64(time.Second))
	if err := writeMessage(serverConnection, messageAnimationFrame, clock, request.sequence); err != nil {
		t.Fatal(err)
	}
	nextRequest, err := readMessage(serverConnection)
	if err != nil || nextRequest.typeID != messageRequestAnimationFrame {
		t.Fatalf("next animation request = %#v, %v", nextRequest, err)
	}
	if got := animationNanos.Load(); got != int64(time.Second) {
		t.Fatalf("initial animation time = %v", time.Duration(got))
	}

	active.Store(false)
	if err := writeMessage(serverConnection, messagePointerDown, testFloats(10, 10), 0); err != nil {
		t.Fatal(err)
	}
	binary.LittleEndian.PutUint64(clock, uint64(11*time.Second))
	if err := writeMessage(serverConnection, messageAnimationFrame, clock, nextRequest.sequence); err != nil {
		t.Fatal(err)
	}
	if err := serverConnection.SetReadDeadline(time.Now().Add(40 * time.Millisecond)); err != nil {
		t.Fatal(err)
	}
	if unexpected, err := readMessage(serverConnection); err == nil {
		t.Fatalf("paused animation emitted %#v", unexpected)
	}
	if err := serverConnection.SetReadDeadline(time.Time{}); err != nil {
		t.Fatal(err)
	}

	active.Store(true)
	if err := writeMessage(serverConnection, messagePointerDown, testFloats(10, 10), 0); err != nil {
		t.Fatal(err)
	}
	resumed, err := readMessage(serverConnection)
	if err != nil || resumed.typeID != messageRequestAnimationFrame || resumed.sequence == request.sequence {
		t.Fatalf("resumed animation request = %#v, %v", resumed, err)
	}
	binary.LittleEndian.PutUint64(clock, uint64(21*time.Second))
	if err := writeMessage(serverConnection, messageAnimationFrame, clock, resumed.sequence); err != nil {
		t.Fatal(err)
	}
	continued, err := readMessage(serverConnection)
	if err != nil || continued.typeID != messageRequestAnimationFrame {
		t.Fatalf("continued animation request = %#v, %v", continued, err)
	}
	if got := time.Duration(animationNanos.Load()); got != time.Second {
		t.Fatalf("resumed timeline jumped to %v, want paused phase %v", got, time.Second)
	}

	cancel()
	select {
	case err := <-done:
		if err != nil {
			t.Fatal(err)
		}
	case <-time.After(time.Second):
		t.Fatal("suspended animation application did not stop")
	}
}

func TestMeasureTextReturnsLogicalPixelAdvance(t *testing.T) {
	clientConnection, serverConnection := net.Pipe()
	client := &Client{connection: clientConnection, sequence: 7}
	defer clientConnection.Close()
	defer serverConnection.Close()

	serverDone := make(chan error, 1)
	go func() {
		request, err := readMessage(serverConnection)
		if err != nil {
			serverDone <- err
			return
		}
		if request.typeID != messageTextMeasure || request.sequence != 7 {
			t.Errorf("text request = %#v", request)
		}
		if len(request.payload) != 13 || request.payload[0] != byte(RoundedFont) ||
			request.payload[1] != byte(SemiBold) || request.payload[2] != 1 ||
			request.payload[3] != 1 || string(request.payload[8:]) != "MGFX!" {
			t.Errorf("text measurement payload = %v", request.payload)
		}
		spacing := math.Float32frombits(binary.LittleEndian.Uint32(request.payload[4:8]))
		if math.Abs(float64(spacing-0.05)) > 0.00001 {
			t.Errorf("encoded letter spacing = %f", spacing)
		}
		serverDone <- writeMessage(serverConnection, messageTextMetrics, testFloats(2.75), 7)
	}()

	advance, err := client.MeasureText(context.Background(), "MGFX!", TextMeasureStyle{
		Size: 20, Family: RoundedFont, Weight: SemiBold, Italic: true, LetterSpacing: 1,
	})
	if err != nil {
		t.Fatal(err)
	}
	if advance != 55 {
		t.Fatalf("advance = %f, want 55 logical pixels", advance)
	}
	if err := <-serverDone; err != nil {
		t.Fatal(err)
	}
}

func TestApplicationLowersComponentCursorChanges(t *testing.T) {
	clientConnection, serverConnection := net.Pipe()
	client := &Client{connection: clientConnection, sequence: 1}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	defer serverConnection.Close()
	done := make(chan error, 1)
	go func() {
		done <- client.ServeApplication(ctx, Application{
			Draw: func(canvas *Canvas) { canvas.Clear(RGB(0, 0, 0)) },
			Cursor: func(point Point) Cursor {
				if point.X >= 100 {
					return CursorPointingHand
				}
				return CursorArrow
			},
		})
	}()

	resize := make([]byte, 8)
	binary.LittleEndian.PutUint32(resize[0:4], 200)
	binary.LittleEndian.PutUint32(resize[4:8], 100)
	if err := writeMessage(serverConnection, messageResize, resize, 0); err != nil {
		t.Fatal(err)
	}
	if frame, err := readMessage(serverConnection); err != nil || frame.typeID != messageFrame {
		t.Fatalf("initial frame = %#v, %v", frame, err)
	}
	if err := writeMessage(serverConnection, messagePointerMove, testFloats(140, 20), 0); err != nil {
		t.Fatal(err)
	}
	cursor, err := readMessage(serverConnection)
	if err != nil || cursor.typeID != messageWindowCursor ||
		!slices.Equal(cursor.payload, []byte{byte(CursorPointingHand), 0, 0, 0}) {
		t.Fatalf("cursor message = %#v, %v", cursor, err)
	}
	cancel()
	select {
	case err := <-done:
		if err != nil {
			t.Fatal(err)
		}
	case <-time.After(time.Second):
		t.Fatal("cursor application did not stop")
	}
}
