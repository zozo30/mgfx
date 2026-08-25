package mgfx

import (
	"context"
	"encoding/binary"
	"errors"
	"fmt"
	"io"
	"math"
	"net"
	"os"
	"time"
	"unicode/utf8"
)

type Window struct {
	Title                       string
	Width, Height               uint32
	MinimumWidth, MinimumHeight uint32
	Resizable                   bool
}

type DrawFunc func(canvas *Canvas)

type Point struct{ X, Y float32 }

type Key uint16

const (
	KeyUnknown Key = iota
	KeyTab
	KeyEnter
	KeySpace
	KeyEscape
	KeyArrowLeft
	KeyArrowRight
	KeyArrowUp
	KeyArrowDown
	KeyBackspace
	KeyCopy
	KeyCut
	KeyPaste
	KeySelectAll
	KeyPageUp
	KeyPageDown
	KeyHome
	KeyEnd
	KeyDelete
)

type KeyModifiers uint16

const (
	ModifierShift KeyModifiers = 1 << iota
	ModifierControl
	ModifierAlt
	ModifierCommand
)

type KeyEvent struct {
	Key       Key
	Modifiers KeyModifiers
	Repeat    bool
}

type ScrollEvent struct {
	Position       Point
	DeltaX, DeltaY float32
}

// Application adds typed input callbacks to a client-owned window. When a
// callback runs, MGFX automatically redraws with the latest application state.
type Application struct {
	Window Window
	// Prepare runs after connecting but before the window opens. It is the safe
	// place to synchronously load resources or ask the server for text metrics.
	Prepare     func(context.Context, *Client) error
	Draw        DrawFunc
	PointerDown func(Point)
	PointerMove func(Point)
	PointerUp   func(Point)
	KeyDown     func(KeyEvent)
	KeyUp       func(KeyEvent)
	Scroll      func(ScrollEvent)
	TextInput   func(string)
	Animation   func(time.Duration)
}

type Client struct {
	connection net.Conn
	sequence   uint32
}

// TextMeasureStyle describes the native font used to shape a measured run.
// LetterSpacing and the returned advance are expressed in logical pixels.
type TextMeasureStyle struct {
	Size          float32
	Family        FontFamily
	Weight        FontWeight
	Italic        bool
	LetterSpacing float32
}

// MeasureText asks the graphics server's native text shaper for the exact
// horizontal advance of text. Call it from Application.Prepare, before Serve.
func (client *Client) MeasureText(ctx context.Context, text string, style TextMeasureStyle) (float32, error) {
	if text == "" || len(text) > 65536 || !utf8.ValidString(text) {
		return 0, errors.New("text measurement requires 1 through 65536 valid UTF-8 bytes")
	}
	if style.Size <= 0 || !finite(style.Size, style.LetterSpacing) ||
		style.Family > RoundedFont || style.Weight > SemiBold {
		return 0, errors.New("text measurement style is outside supported bounds")
	}
	spacing := style.LetterSpacing / style.Size
	if spacing < -10 || spacing > 10 {
		return 0, errors.New("text letter spacing must be within -10 through 10 em")
	}
	headerSize := 4
	if spacing != 0 {
		headerSize = 8
	}
	payload := make([]byte, headerSize+len(text))
	payload[0] = byte(style.Family)
	payload[1] = byte(style.Weight)
	if style.Italic {
		payload[2] = 1
	}
	if spacing != 0 {
		payload[3] = 1
		binary.LittleEndian.PutUint32(payload[4:8], math.Float32bits(spacing))
	}
	copy(payload[headerSize:], text)
	sequence := client.sequence
	client.sequence++
	if err := writeMessage(client.connection, messageTextMeasure, payload, sequence); err != nil {
		return 0, err
	}
	stopContextDeadline := context.AfterFunc(ctx, func() { _ = client.connection.SetReadDeadline(time.Now()) })
	defer func() {
		stopContextDeadline()
		_ = client.connection.SetReadDeadline(time.Time{})
	}()
	for {
		incoming, err := readMessage(client.connection)
		if err != nil {
			if ctx.Err() != nil {
				return 0, ctx.Err()
			}
			return 0, err
		}
		if incoming.typeID == messageServerHello || incoming.typeID == messageServerCapabilities ||
			incoming.typeID == messageServerCapabilityWord {
			continue
		}
		if incoming.typeID != messageTextMetrics || incoming.sequence != sequence || len(incoming.payload) != 4 {
			return 0, fmt.Errorf("unexpected response while measuring native text: type=%d sequence=%d bytes=%d",
				incoming.typeID, incoming.sequence, len(incoming.payload))
		}
		advance := math.Float32frombits(binary.LittleEndian.Uint32(incoming.payload))
		if !finite(advance) || advance < 0 {
			return 0, errors.New("server returned an invalid text advance")
		}
		return advance * style.Size, nil
	}
}

func DefaultSocketPath() string { return fmt.Sprintf("/tmp/mgfx-%d.sock", os.Geteuid()) }

func Dial(ctx context.Context, socketPath string) (*Client, error) {
	if socketPath == "" {
		socketPath = DefaultSocketPath()
	}
	deadline := time.Now().Add(3 * time.Second)
	var last error
	for time.Now().Before(deadline) {
		connection, err := (&net.Dialer{}).DialContext(ctx, "unix", socketPath)
		if err == nil {
			return &Client{connection: connection, sequence: 1}, nil
		}
		last = err
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-time.After(50 * time.Millisecond):
		}
	}
	return nil, fmt.Errorf("could not connect to %s: %w", socketPath, last)
}

func (client *Client) Close() error {
	if client.connection == nil {
		return nil
	}
	_ = writeMessage(client.connection, messageClose, nil, 0)
	return client.connection.Close()
}

func (client *Client) OpenWindow(window Window) error {
	if window.Title == "" || window.Width == 0 || window.Height == 0 ||
		window.MinimumWidth > window.Width || window.MinimumHeight > window.Height {
		return errors.New("window requires a title, nonzero size, and minimum size within its initial size")
	}
	config := make([]byte, 16)
	for index, value := range []uint32{window.Width, window.Height,
		window.MinimumWidth, window.MinimumHeight} {
		binary.LittleEndian.PutUint32(config[index*4:], value)
	}
	resizable := byte(0)
	if window.Resizable {
		resizable = 1
	}
	for _, outgoing := range []struct {
		typeID  messageType
		payload []byte
	}{
		{messageWindowTitle, []byte(window.Title)},
		{messageWindowConfig, config},
		{messageWindowState, []byte{0, resizable, 0, 0}},
		{messageWindowCursor, []byte{0, 0, 0, 0}},
	} {
		if err := writeMessage(client.connection, outgoing.typeID, outgoing.payload, 0); err != nil {
			return err
		}
	}
	return nil
}

func (client *Client) Serve(ctx context.Context, draw DrawFunc) error {
	return client.ServeApplication(ctx, Application{Draw: draw})
}

func decodePoint(payload []byte) (Point, error) {
	if len(payload) != 8 {
		return Point{}, errors.New("invalid pointer payload")
	}
	return Point{X: math.Float32frombits(binary.LittleEndian.Uint32(payload[0:4])),
		Y: math.Float32frombits(binary.LittleEndian.Uint32(payload[4:8]))}, nil
}

func decodeKey(payload []byte) (KeyEvent, error) {
	if len(payload) != 8 {
		return KeyEvent{}, errors.New("invalid key payload")
	}
	key := Key(binary.LittleEndian.Uint16(payload[0:2]))
	modifiers := KeyModifiers(binary.LittleEndian.Uint16(payload[2:4]))
	if key > KeyDelete || modifiers > ModifierShift|ModifierControl|ModifierAlt|ModifierCommand {
		return KeyEvent{}, errors.New("key payload is outside supported bounds")
	}
	return KeyEvent{Key: key, Modifiers: modifiers,
		Repeat: binary.LittleEndian.Uint32(payload[4:8]) != 0}, nil
}

func decodeScroll(payload []byte) (ScrollEvent, error) {
	if len(payload) != 16 {
		return ScrollEvent{}, errors.New("invalid scroll payload")
	}
	position, _ := decodePoint(payload[0:8])
	return ScrollEvent{Position: position,
		DeltaX: math.Float32frombits(binary.LittleEndian.Uint32(payload[8:12])),
		DeltaY: math.Float32frombits(binary.LittleEndian.Uint32(payload[12:16]))}, nil
}

func (client *Client) ServeApplication(ctx context.Context, application Application) error {
	if application.Draw == nil {
		return errors.New("draw callback is required")
	}
	stopContextClose := context.AfterFunc(ctx, func() { _ = client.connection.Close() })
	defer stopContextClose()
	var size Size
	var inFlight uint32
	pending := false
	var animationSequence uint32 = 1
	var pendingAnimation uint32
	submit := func() error {
		if size.Width <= 0 || size.Height <= 0 {
			return nil
		}
		if inFlight != 0 {
			pending = true
			return nil
		}
		canvas := newCanvas(size)
		application.Draw(canvas)
		frame, err := canvas.finish()
		if err != nil {
			return err
		}
		sequence := client.sequence
		if err := writeMessage(client.connection, messageFrame, frame, sequence); err != nil {
			return err
		}
		client.sequence++
		inFlight = sequence
		pending = false
		return nil
	}
	requestAnimation := func() error {
		if application.Animation == nil || pendingAnimation != 0 {
			return nil
		}
		sequence := animationSequence
		if err := writeMessage(client.connection, messageRequestAnimationFrame, nil, sequence); err != nil {
			return err
		}
		animationSequence++
		pendingAnimation = sequence
		return nil
	}
	for {
		incoming, err := readMessage(client.connection)
		if err != nil {
			if ctx.Err() != nil || errors.Is(err, io.EOF) || errors.Is(err, net.ErrClosed) {
				return nil
			}
			return err
		}
		switch incoming.typeID {
		case messageResize:
			if len(incoming.payload) != 8 {
				return errors.New("invalid Resize payload")
			}
			size = Size{
				Width:  float32(binary.LittleEndian.Uint32(incoming.payload[0:4])),
				Height: float32(binary.LittleEndian.Uint32(incoming.payload[4:8])),
			}
			if err := submit(); err != nil {
				return err
			}
			if err := requestAnimation(); err != nil {
				return err
			}
		case messageFramePresented:
			if incoming.sequence == inFlight {
				inFlight = 0
				if pending {
					if err := submit(); err != nil {
						return err
					}
				}
			}
		case messagePointerDown, messagePointerMove, messagePointerUp:
			point, err := decodePoint(incoming.payload)
			if err != nil {
				return err
			}
			callback := application.PointerDown
			if incoming.typeID == messagePointerMove {
				callback = application.PointerMove
			}
			if incoming.typeID == messagePointerUp {
				callback = application.PointerUp
			}
			if callback != nil {
				callback(point)
				if err := submit(); err != nil {
					return err
				}
			}
		case messageKeyDown, messageKeyUp:
			event, err := decodeKey(incoming.payload)
			if err != nil {
				return err
			}
			callback := application.KeyDown
			if incoming.typeID == messageKeyUp {
				callback = application.KeyUp
			}
			if callback != nil {
				callback(event)
				if err := submit(); err != nil {
					return err
				}
			}
		case messageScroll:
			event, err := decodeScroll(incoming.payload)
			if err != nil {
				return err
			}
			if application.Scroll != nil {
				application.Scroll(event)
				if err := submit(); err != nil {
					return err
				}
			}
		case messageTextInput:
			if !utf8.Valid(incoming.payload) {
				return errors.New("text input is not valid UTF-8")
			}
			if application.TextInput != nil {
				application.TextInput(string(incoming.payload))
				if err := submit(); err != nil {
					return err
				}
			}
		case messageAnimationFrame:
			if len(incoming.payload) != 8 {
				return errors.New("invalid AnimationFrame payload")
			}
			if application.Animation != nil && incoming.sequence == pendingAnimation {
				pendingAnimation = 0
				application.Animation(time.Duration(binary.LittleEndian.Uint64(incoming.payload)))
				if err := submit(); err != nil {
					return err
				}
				if err := requestAnimation(); err != nil {
					return err
				}
			}
		case messageClose:
			return nil
		case messageServerHello:
			// Transport acknowledgements remain internal to the package.
		}
	}
}

func Run(ctx context.Context, window Window, draw DrawFunc) error {
	return RunAt(ctx, DefaultSocketPath(), window, draw)
}

func RunAt(ctx context.Context, socketPath string, window Window, draw DrawFunc) error {
	return Application{Window: window, Draw: draw}.RunAt(ctx, socketPath)
}

func (application Application) Run(ctx context.Context) error {
	return application.RunAt(ctx, DefaultSocketPath())
}

func (application Application) RunAt(ctx context.Context, socketPath string) error {
	client, err := Dial(ctx, socketPath)
	if err != nil {
		return err
	}
	defer client.Close()
	if application.Prepare != nil {
		if err := application.Prepare(ctx, client); err != nil {
			return err
		}
	}
	if err := client.OpenWindow(application.Window); err != nil {
		return err
	}
	return client.ServeApplication(ctx, application)
}
