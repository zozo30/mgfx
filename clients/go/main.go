package main

import (
	"context"
	"fmt"
	"math"
	"os"
	"os/signal"
	"time"

	"github.com/zozo30/mgfx/clients/go/mgfx"
)

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt)
	defer stop()

	window := mgfx.Window{
		Title: "MGFX Go Client", Width: 720, Height: 320,
		MinimumWidth: 480, MinimumHeight: 220, Resizable: true,
	}
	textOffset := float32(0)
	app := mgfx.Application{Window: window}
	app.Draw = func(canvas *mgfx.Canvas) {
		canvas.Clear(mgfx.RGB(0.025, 0.035, 0.065))
		canvas.Text("Hello from Go over MGFX", mgfx.TextStyle{
			X: 40 + textOffset, Y: canvas.Size.Height/2 - 20, Size: 34,
			Color: mgfx.RGB(0.72, 0.94, 1), Weight: mgfx.SemiBold,
		})
	}
	app.Animation = func(now time.Duration) {
		textOffset = float32(math.Sin(now.Seconds()*1.8) * 16)
	}
	err := app.Run(ctx)
	if err != nil {
		fmt.Fprintln(os.Stderr, "MGFX Go client:", err)
		os.Exit(1)
	}
}
