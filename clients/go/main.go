package main

import (
	"encoding/binary"
	"errors"
	"fmt"
	"io"
	"math"
	"net"
	"os"
	"os/signal"
	"syscall"
	"time"
)

const (
	protocolVersion   = 1
	messageHeaderSize = 16
	frameHeaderSize   = 16
	commandHeaderSize = 8
	maximumPayload    = 64 * 1024 * 1024
)

type messageType uint16

const (
	messageFrame          messageType = 1
	messageResize         messageType = 2
	messageClose          messageType = 4
	messageWindowTitle    messageType = 11
	messageWindowConfig   messageType = 12
	messageWindowState    messageType = 13
	messageServerHello    messageType = 14
	messageFramePresented messageType = 15
	messageWindowCursor   messageType = 18
)

type message struct {
	typeID   messageType
	sequence uint32
	payload  []byte
}

func putFloat32(target []byte, value float32) {
	binary.LittleEndian.PutUint32(target, math.Float32bits(value))
}

func encodeMessage(typeID messageType, payload []byte, sequence uint32) ([]byte, error) {
	if len(payload) > maximumPayload {
		return nil, fmt.Errorf("MGIP payload exceeds %d bytes", maximumPayload)
	}
	encoded := make([]byte, messageHeaderSize+len(payload))
	copy(encoded[0:4], "MGIP")
	binary.LittleEndian.PutUint16(encoded[4:6], protocolVersion)
	binary.LittleEndian.PutUint16(encoded[6:8], uint16(typeID))
	binary.LittleEndian.PutUint32(encoded[8:12], uint32(len(payload)))
	binary.LittleEndian.PutUint32(encoded[12:16], sequence)
	copy(encoded[messageHeaderSize:], payload)
	return encoded, nil
}

func writeMessage(writer io.Writer, typeID messageType, payload []byte, sequence uint32) error {
	encoded, err := encodeMessage(typeID, payload, sequence)
	if err != nil {
		return err
	}
	for len(encoded) > 0 {
		written, err := writer.Write(encoded)
		if err != nil {
			return err
		}
		if written == 0 {
			return io.ErrShortWrite
		}
		encoded = encoded[written:]
	}
	return nil
}

func readMessage(reader io.Reader) (message, error) {
	header := make([]byte, messageHeaderSize)
	if _, err := io.ReadFull(reader, header); err != nil {
		return message{}, err
	}
	if string(header[0:4]) != "MGIP" {
		return message{}, errors.New("invalid MGIP magic")
	}
	if version := binary.LittleEndian.Uint16(header[4:6]); version != protocolVersion {
		return message{}, fmt.Errorf("unsupported MGIP version %d", version)
	}
	size := binary.LittleEndian.Uint32(header[8:12])
	if size > maximumPayload {
		return message{}, fmt.Errorf("MGIP payload exceeds %d bytes", maximumPayload)
	}
	payload := make([]byte, size)
	if _, err := io.ReadFull(reader, payload); err != nil {
		return message{}, err
	}
	return message{
		typeID:   messageType(binary.LittleEndian.Uint16(header[6:8])),
		sequence: binary.LittleEndian.Uint32(header[12:16]),
		payload:  payload,
	}, nil
}

type frameEncoder struct {
	commands [][]byte
}

func (encoder *frameEncoder) command(opcode uint16, payload []byte) {
	command := make([]byte, commandHeaderSize+len(payload))
	binary.LittleEndian.PutUint16(command[0:2], opcode)
	binary.LittleEndian.PutUint32(command[4:8], uint32(len(payload)))
	copy(command[commandHeaderSize:], payload)
	encoder.commands = append(encoder.commands, command)
}

func (encoder *frameEncoder) clear(red, green, blue, alpha float32) {
	payload := make([]byte, 16)
	for index, value := range []float32{red, green, blue, alpha} {
		putFloat32(payload[index*4:], value)
	}
	encoder.command(1, payload)
}

func (encoder *frameEncoder) systemText(value string, left, top, size float32) error {
	text := []byte(value)
	if len(text) == 0 || len(text) > 65536 {
		return errors.New("text must contain 1 through 65536 UTF-8 bytes")
	}
	for _, character := range text {
		if character == 0 {
			return errors.New("text cannot contain NUL bytes")
		}
	}
	payload := make([]byte, 32+len(text))
	payload[0] = 0 // portable system font
	payload[1] = 3 // semibold
	payload[2] = 0 // regular style
	payload[3] = 0 // base text command, no extensions
	values := []float32{left, top, size, 0.72, 0.94, 1.0, 1.0}
	for index, value := range values {
		putFloat32(payload[4+index*4:], value)
	}
	copy(payload[32:], text)
	encoder.command(8, payload)
	return nil
}

func (encoder *frameEncoder) finish() []byte {
	encoder.command(3, nil)
	total := frameHeaderSize
	for _, command := range encoder.commands {
		total += len(command)
	}
	frame := make([]byte, total)
	copy(frame[0:4], "MGFX")
	binary.LittleEndian.PutUint16(frame[4:6], protocolVersion)
	binary.LittleEndian.PutUint32(frame[8:12], uint32(total))
	binary.LittleEndian.PutUint32(frame[12:16], uint32(len(encoder.commands)))
	offset := frameHeaderSize
	for _, command := range encoder.commands {
		copy(frame[offset:], command)
		offset += len(command)
	}
	return frame
}

func makeFrame(width, height uint32) ([]byte, error) {
	encoder := frameEncoder{}
	encoder.clear(0.025, 0.035, 0.065, 1)
	top := float32(height)/2 - 20
	if top < 32 {
		top = 32
	}
	if err := encoder.systemText("Hello from Go over MGFX", 40, top, 34); err != nil {
		return nil, err
	}
	return encoder.finish(), nil
}

func windowConfig(width, height, minimumWidth, minimumHeight uint32) []byte {
	payload := make([]byte, 16)
	for index, value := range []uint32{width, height, minimumWidth, minimumHeight} {
		binary.LittleEndian.PutUint32(payload[index*4:], value)
	}
	return payload
}

func connectWithRetry(path string) (net.Conn, error) {
	deadline := time.Now().Add(3 * time.Second)
	var last error
	for time.Now().Before(deadline) {
		connection, err := net.Dial("unix", path)
		if err == nil {
			return connection, nil
		}
		last = err
		time.Sleep(50 * time.Millisecond)
	}
	return nil, fmt.Errorf("could not connect to %s: %w", path, last)
}

func run(socketPath string) error {
	connection, err := connectWithRetry(socketPath)
	if err != nil {
		return err
	}
	defer connection.Close()

	for _, outgoing := range []struct {
		typeID  messageType
		payload []byte
	}{
		{messageWindowTitle, []byte("MGFX Go Client")},
		{messageWindowConfig, windowConfig(720, 320, 480, 220)},
		{messageWindowState, []byte{0, 1, 0, 0}},
		{messageWindowCursor, []byte{0, 0, 0, 0}},
	} {
		if err := writeMessage(connection, outgoing.typeID, outgoing.payload, 0); err != nil {
			return err
		}
	}

	interrupts := make(chan os.Signal, 1)
	signal.Notify(interrupts, os.Interrupt, syscall.SIGTERM)
	defer signal.Stop(interrupts)
	go func() {
		<-interrupts
		_ = writeMessage(connection, messageClose, nil, 0)
		_ = connection.Close()
	}()

	fmt.Printf("MGFX Go client connected to %s\n", socketPath)
	var frameSequence uint32 = 1
	announcedPresentation := false
	for {
		incoming, err := readMessage(connection)
		if err != nil {
			if errors.Is(err, io.EOF) || errors.Is(err, net.ErrClosed) {
				return nil
			}
			return err
		}
		switch incoming.typeID {
		case messageServerHello:
			fmt.Println("MGFX graphics server is ready")
		case messageResize:
			if len(incoming.payload) != 8 {
				return errors.New("invalid Resize payload")
			}
			width := binary.LittleEndian.Uint32(incoming.payload[0:4])
			height := binary.LittleEndian.Uint32(incoming.payload[4:8])
			frame, err := makeFrame(width, height)
			if err != nil {
				return err
			}
			if err := writeMessage(connection, messageFrame, frame, frameSequence); err != nil {
				return err
			}
			frameSequence++
		case messageFramePresented:
			if !announcedPresentation {
				fmt.Printf("MGFX frame %d presented by Metal\n", incoming.sequence)
				announcedPresentation = true
			}
		case messageClose:
			return nil
		}
	}
}

func main() {
	socketPath := fmt.Sprintf("/tmp/mgfx-%d.sock", os.Geteuid())
	if len(os.Args) > 1 {
		socketPath = os.Args[1]
	}
	if err := run(socketPath); err != nil {
		fmt.Fprintln(os.Stderr, "MGFX Go client:", err)
		os.Exit(1)
	}
}
