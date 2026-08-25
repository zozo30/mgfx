package mgfx

import (
	"encoding/binary"
	"errors"
	"math"
)

const (
	frameHeaderSize   = 16
	commandHeaderSize = 8
)

// Size is the drawable size in logical window pixels.
type Size struct{ Width, Height float32 }

// Color is a non-premultiplied RGBA color with components from zero through one.
type Color struct{ Red, Green, Blue, Alpha float32 }

func RGB(red, green, blue float32) Color         { return Color{red, green, blue, 1} }
func RGBA(red, green, blue, alpha float32) Color { return Color{red, green, blue, alpha} }

type FontFamily uint8

const (
	SystemFont FontFamily = iota
	MonospaceFont
	SerifFont
	RoundedFont
)

type FontWeight uint8

const (
	Regular  FontWeight = 0
	Bold     FontWeight = 1
	Medium   FontWeight = 2
	SemiBold FontWeight = 3
)

type TextStyle struct {
	X, Y   float32
	Size   float32
	Color  Color
	Family FontFamily
	Weight FontWeight
	Italic bool
}

// Canvas records one backend-neutral MGFX display list. Public coordinates are
// logical pixels; normalization for the graphics protocol remains internal.
type Canvas struct {
	Size     Size
	commands [][]byte
	err      error
}

func newCanvas(size Size) *Canvas { return &Canvas{Size: size} }
func putFloat32(target []byte, value float32) {
	binary.LittleEndian.PutUint32(target, math.Float32bits(value))
}

func (canvas *Canvas) command(opcode uint16, payload []byte) {
	if canvas.err != nil {
		return
	}
	command := make([]byte, commandHeaderSize+len(payload))
	binary.LittleEndian.PutUint16(command[0:2], opcode)
	binary.LittleEndian.PutUint32(command[4:8], uint32(len(payload)))
	copy(command[commandHeaderSize:], payload)
	canvas.commands = append(canvas.commands, command)
}

func validColor(color Color) bool {
	for _, value := range []float32{color.Red, color.Green, color.Blue, color.Alpha} {
		if math.IsNaN(float64(value)) || math.IsInf(float64(value), 0) || value < 0 || value > 1 {
			return false
		}
	}
	return true
}

func (canvas *Canvas) Clear(color Color) {
	if !validColor(color) {
		canvas.err = errors.New("clear color components must be finite values from zero through one")
		return
	}
	payload := make([]byte, 16)
	for index, value := range []float32{color.Red, color.Green, color.Blue, color.Alpha} {
		putFloat32(payload[index*4:], value)
	}
	canvas.command(1, payload)
}

func (canvas *Canvas) Text(value string, style TextStyle) {
	text := []byte(value)
	if len(text) == 0 || len(text) > 65536 || style.Size <= 0 ||
		canvas.Size.Width <= 0 || canvas.Size.Height <= 0 || !validColor(style.Color) ||
		style.Family > RoundedFont || style.Weight > SemiBold {
		canvas.err = errors.New("text contains invalid content, geometry, color, or font style")
		return
	}
	for _, character := range text {
		if character == 0 {
			canvas.err = errors.New("text cannot contain NUL bytes")
			return
		}
	}
	payload := make([]byte, 32+len(text))
	payload[0], payload[1] = byte(style.Family), byte(style.Weight)
	if style.Italic {
		payload[2] = 1
	}
	values := []float32{style.X/canvas.Size.Width*2 - 1,
		1 - style.Y/canvas.Size.Height*2, style.Size / canvas.Size.Height * 2,
		style.Color.Red, style.Color.Green, style.Color.Blue, style.Color.Alpha}
	for index, number := range values {
		if math.IsNaN(float64(number)) || math.IsInf(float64(number), 0) {
			canvas.err = errors.New("text geometry must be finite")
			return
		}
		putFloat32(payload[4+index*4:], number)
	}
	copy(payload[32:], text)
	canvas.command(8, payload)
}

func (canvas *Canvas) finish() ([]byte, error) {
	if canvas.err != nil {
		return nil, canvas.err
	}
	canvas.command(3, nil)
	total := frameHeaderSize
	for _, command := range canvas.commands {
		total += len(command)
	}
	frame := make([]byte, total)
	copy(frame[0:4], "MGFX")
	binary.LittleEndian.PutUint16(frame[4:6], protocolVersion)
	binary.LittleEndian.PutUint32(frame[8:12], uint32(total))
	binary.LittleEndian.PutUint32(frame[12:16], uint32(len(canvas.commands)))
	offset := frameHeaderSize
	for _, command := range canvas.commands {
		copy(frame[offset:], command)
		offset += len(command)
	}
	return frame, nil
}
