package mgfx

import (
	"encoding/binary"
	"errors"
	"fmt"
	"io"
)

const (
	protocolVersion   = 1
	messageHeaderSize = 16
	maximumPayload    = 64 * 1024 * 1024
)

type messageType uint16

const (
	messageFrame                 messageType = 1
	messageResize                messageType = 2
	messagePointerDown           messageType = 3
	messageClose                 messageType = 4
	messagePointerMove           messageType = 5
	messagePointerUp             messageType = 6
	messageKeyDown               messageType = 7
	messageKeyUp                 messageType = 8
	messageScroll                messageType = 9
	messageTextInput             messageType = 10
	messageWindowTitle           messageType = 11
	messageWindowConfig          messageType = 12
	messageWindowState           messageType = 13
	messageServerHello           messageType = 14
	messageFramePresented        messageType = 15
	messageRequestAnimationFrame messageType = 16
	messageAnimationFrame        messageType = 17
	messageWindowCursor          messageType = 18
)

type message struct {
	typeID   messageType
	sequence uint32
	payload  []byte
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
	return message{typeID: messageType(binary.LittleEndian.Uint16(header[6:8])),
		sequence: binary.LittleEndian.Uint32(header[12:16]), payload: payload}, nil
}
