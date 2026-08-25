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
	patternOffset := float32(0)
	arcAngle := float32(0)
	labelWidth := float32(360)
	app := mgfx.Application{Window: window}
	app.Prepare = func(ctx context.Context, client *mgfx.Client) error {
		measured, err := client.MeasureText(ctx, "Hello from Go over MGFX", mgfx.TextMeasureStyle{
			Size: 34, Weight: mgfx.SemiBold,
		})
		if err != nil {
			return err
		}
		labelWidth = measured
		return nil
	}
	app.Draw = func(canvas *mgfx.Canvas) {
		canvas.Clear(mgfx.RGB(0.025, 0.035, 0.065))
		banner := mgfx.Rect{X: 24, Y: canvas.Size.Height/2 - 60,
			Width: canvas.Size.Width - 48, Height: 120}
		columns, err := (mgfx.StackLayout{Axis: mgfx.Horizontal, Gap: 18,
			Padding: mgfx.SymmetricInsets(18, 14)}).Arrange(
			banner, mgfx.Fixed(68), mgfx.Flex(1), mgfx.Fixed(68))
		if err != nil {
			return
		}
		canvas.Shadow(banner, mgfx.ShadowStyle{
			Color: mgfx.RGBA(0.12, 0.46, 1, 0.42), Blur: 24, Spread: 2, CornerRadius: 18,
		})
		canvas.LinearGradient(banner, mgfx.LinearGradientStyle{
			Start: mgfx.RGB(0.30, 0.10, 0.82), End: mgfx.RGB(0.04, 0.55, 1),
			Direction: mgfx.GradientHorizontal, CornerRadius: 18,
		})
		canvas.DiagonalPattern(mgfx.Rect{X: banner.X + 12, Y: banner.Y + 94,
			Width: banner.Width - 24, Height: 12}, mgfx.DiagonalPatternStyle{
			Color: mgfx.RGBA(0.72, 1, 0.82, 0.72), StripeWidth: 6, Gap: 7,
			Offset: patternOffset,
		})
		labelBackground := columns[1].Centered(mgfx.Size{Width: labelWidth + 36, Height: 50})
		labelBackground.X += textOffset
		canvas.RoundedRect(labelBackground, mgfx.ShapeStyle{
			Fill:   mgfx.RGBA(0.015, 0.025, 0.08, 0.34),
			Border: mgfx.RGBA(0.72, 0.94, 1, 0.30), BorderWidth: 1, CornerRadius: 14,
		})
		canvas.Text("Hello from Go over MGFX", mgfx.TextStyle{
			X: columns[1].X + columns[1].Width/2 + textOffset,
			Y: canvas.Size.Height/2 - 20, Size: 34,
			Color: mgfx.RGB(0.72, 0.94, 1), Weight: mgfx.SemiBold,
			Anchor: mgfx.AnchorMiddle,
		})
		canvas.GradientArc(columns[2].Centered(mgfx.Size{Width: 68, Height: 68}), mgfx.GradientArcStyle{
			StartAngle: arcAngle, SweepAngle: 285, Thickness: 8, RoundCaps: true,
			Start: mgfx.RGB(0.55, 1, 0.76), End: mgfx.RGB(0.82, 0.42, 1),
		})
	}
	app.Animation = func(now time.Duration) {
		textOffset = float32(math.Sin(now.Seconds()*1.8) * 16)
		patternOffset = -float32(math.Mod(now.Seconds()*28, 13))
		arcAngle = float32(math.Mod(now.Seconds()*90, 360))
	}
	err := app.Run(ctx)
	if err != nil {
		fmt.Fprintln(os.Stderr, "MGFX Go client:", err)
		os.Exit(1)
	}
}
