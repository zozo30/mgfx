package mgfx

import (
	"context"
	"encoding/binary"
	"errors"
	"fmt"
	"io"
	"net"
	"os"
	"time"
)

type Window struct {
	Title                       string
	Width, Height               uint32
	MinimumWidth, MinimumHeight uint32
	Resizable                   bool
}

type DrawFunc func(canvas *Canvas)

type Client struct {
	connection net.Conn
	sequence   uint32
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
	if draw == nil {
		return errors.New("draw callback is required")
	}
	stopContextClose := context.AfterFunc(ctx, func() { _ = client.connection.Close() })
	defer stopContextClose()
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
			canvas := newCanvas(Size{
				Width:  float32(binary.LittleEndian.Uint32(incoming.payload[0:4])),
				Height: float32(binary.LittleEndian.Uint32(incoming.payload[4:8])),
			})
			draw(canvas)
			frame, err := canvas.finish()
			if err != nil {
				return err
			}
			if err := writeMessage(client.connection, messageFrame, frame, client.sequence); err != nil {
				return err
			}
			client.sequence++
		case messageClose:
			return nil
		case messageServerHello, messageFramePresented:
			// Transport acknowledgements remain internal to the package.
		}
	}
}

func Run(ctx context.Context, window Window, draw DrawFunc) error {
	return RunAt(ctx, DefaultSocketPath(), window, draw)
}

func RunAt(ctx context.Context, socketPath string, window Window, draw DrawFunc) error {
	client, err := Dial(ctx, socketPath)
	if err != nil {
		return err
	}
	defer client.Close()
	if err := client.OpenWindow(window); err != nil {
		return err
	}
	return client.Serve(ctx, draw)
}
