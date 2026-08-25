package main

import (
	"context"
	"fmt"
	"os"
	"os/signal"

	"github.com/zozo30/mgfx/clients/go/mgfx"
)

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt)
	defer stop()

	window := mgfx.Window{
		Title: "MGFX Go Client", Width: 720, Height: 320,
		MinimumWidth: 480, MinimumHeight: 220, Resizable: true,
	}
	err := mgfx.Run(ctx, window, func(canvas *mgfx.Canvas) {
		canvas.Clear(mgfx.RGB(0.025, 0.035, 0.065))
		canvas.Text("Hello from Go over MGFX", mgfx.TextStyle{
			X: 40, Y: canvas.Size.Height/2 - 20, Size: 34,
			Color: mgfx.RGB(0.72, 0.94, 1), Weight: mgfx.SemiBold,
		})
	})
	if err != nil {
		fmt.Fprintln(os.Stderr, "MGFX Go client:", err)
		os.Exit(1)
	}
}
