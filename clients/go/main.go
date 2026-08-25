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
	playing := true
	dialogOpen := false
	host := &mgfx.ComponentHost{}
	modal := &mgfx.Modal{}
	toggle := &mgfx.Button{
		Style: mgfx.ButtonStyle{
			Normal: mgfx.ShapeStyle{Fill: mgfx.RGBA(0.02, 0.06, 0.16, 0.72),
				Border: mgfx.RGBA(0.55, 0.9, 1, 0.45), BorderWidth: 1, CornerRadius: 12},
			Hovered: mgfx.ShapeStyle{Fill: mgfx.RGBA(0.08, 0.28, 0.48, 0.86),
				Border: mgfx.RGBA(0.65, 1, 0.9, 0.9), BorderWidth: 2, CornerRadius: 12},
			Focused: mgfx.ShapeStyle{Fill: mgfx.RGBA(0.05, 0.16, 0.36, 0.86),
				Border: mgfx.RGBA(0.82, 0.72, 1, 1), BorderWidth: 3, CornerRadius: 12},
			Pressed: mgfx.ShapeStyle{Fill: mgfx.RGBA(0.35, 0.16, 0.72, 0.92),
				Border: mgfx.RGBA(0.85, 0.7, 1, 1), BorderWidth: 2, CornerRadius: 12},
			Padding: mgfx.UniformInsets(6),
		},
		OnClick: func() {
			playing = !playing
			dialogOpen = !playing
		},
	}
	modal.OnDismiss = func() { dialogOpen, playing = false, true }
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
		label := mgfx.Panel{
			Padding: mgfx.SymmetricInsets(18, 4),
			Style: mgfx.ShapeStyle{Fill: mgfx.RGBA(0.015, 0.025, 0.08, 0.34),
				Border: mgfx.RGBA(0.72, 0.94, 1, 0.30), BorderWidth: 1, CornerRadius: 14},
			Child: mgfx.Label{Value: "Hello from Go over MGFX", Advance: labelWidth,
				Style: mgfx.TextStyle{Size: 34, Color: mgfx.RGB(0.72, 0.94, 1),
					Weight: mgfx.SemiBold}},
		}
		toggleIcon := mgfx.PaintComponent{Preferred: mgfx.Size{Width: 40, Height: 40},
			Draw: func(canvas *mgfx.Canvas, bounds mgfx.Rect) {
				indicator := bounds.Centered(mgfx.Size{Width: 28, Height: 28})
				color := mgfx.RGB(0.45, 1, 0.72)
				if !playing {
					color = mgfx.RGB(1, 0.65, 0.25)
				}
				canvas.Circle(indicator, mgfx.ShapeStyle{Fill: mgfx.RGBA(0.01, 0.03, 0.08, 0.8),
					Border: color, BorderWidth: 3})
				if playing {
					for _, x := range []float32{indicator.X + 8, indicator.X + 16} {
						canvas.RoundedRect(mgfx.Rect{X: x, Y: indicator.Y + 7, Width: 4, Height: 14},
							mgfx.ShapeStyle{Fill: color, CornerRadius: 2})
					}
				} else {
					canvas.Arc(indicator.Inset(mgfx.UniformInsets(6)), mgfx.ArcStyle{
						StartAngle: -55, SweepAngle: 290, Thickness: 4, RoundCaps: true, Color: color})
				}
			}}
		toggle.Child = mgfx.Overlay{Children: []mgfx.Component{
			toggleIcon,
			mgfx.Align{Horizontal: mgfx.AlignEnd, Vertical: mgfx.AlignStart,
				Child: mgfx.PaintComponent{Preferred: mgfx.Size{Width: 10, Height: 10},
					Draw: func(canvas *mgfx.Canvas, bounds mgfx.Rect) {
						canvas.Circle(bounds, mgfx.ShapeStyle{Fill: mgfx.RGB(0.95, 0.42, 1),
							Border: mgfx.RGB(0.75, 1, 0.92), BorderWidth: 1})
					}}},
		}}
		components := mgfx.ComponentStack{Axis: mgfx.Horizontal, Gap: 18,
			Padding: mgfx.SymmetricInsets(18, 14), Children: []mgfx.StackChild{
				{Track: mgfx.Fixed(68), Child: mgfx.Align{Horizontal: mgfx.AlignCenter,
					Vertical: mgfx.AlignCenter, Child: toggle}},
				{Track: mgfx.Flex(1), Child: mgfx.Offset{X: textOffset,
					Child: mgfx.Align{Horizontal: mgfx.AlignCenter, Vertical: mgfx.AlignCenter,
						Child: label}}},
				{Track: mgfx.Fixed(68), Child: mgfx.Align{Horizontal: mgfx.AlignCenter,
					Vertical: mgfx.AlignCenter, Child: mgfx.PaintComponent{
						Preferred: mgfx.Size{Width: 68, Height: 68},
						Draw: func(canvas *mgfx.Canvas, bounds mgfx.Rect) {
							canvas.GradientArc(bounds, mgfx.GradientArcStyle{
								StartAngle: arcAngle, SweepAngle: 285, Thickness: 8, RoundCaps: true,
								Start: mgfx.RGB(0.55, 1, 0.76), End: mgfx.RGB(0.82, 0.42, 1),
							})
						},
					}}},
			}}
		var root mgfx.Component = components
		if dialogOpen {
			modal.Backdrop = mgfx.ShapeStyle{Fill: mgfx.RGBA(0.005, 0.01, 0.035, 0.78),
				CornerRadius: 18}
			modal.Child = mgfx.Align{Horizontal: mgfx.AlignCenter, Vertical: mgfx.AlignCenter,
				Child: mgfx.Panel{Padding: mgfx.UniformInsets(12),
					Style: mgfx.ShapeStyle{Fill: mgfx.RGBA(0.035, 0.06, 0.15, 0.98),
						Border: mgfx.RGB(0.72, 0.62, 1), BorderWidth: 2, CornerRadius: 16},
					Child: mgfx.PaintComponent{Preferred: mgfx.Size{Width: 260, Height: 62},
						Draw: func(canvas *mgfx.Canvas, bounds mgfx.Rect) {
							canvas.Text("Animation paused - click to resume", mgfx.TextStyle{
								X: bounds.X + bounds.Width/2, Y: bounds.Y + 6, Size: 18,
								Color: mgfx.RGB(0.78, 0.95, 1), Weight: mgfx.Medium,
								Anchor: mgfx.AnchorMiddle})
							canvas.DiagonalPattern(mgfx.Rect{X: bounds.X + 20, Y: bounds.Y + 42,
								Width: bounds.Width - 40, Height: 8}, mgfx.DiagonalPatternStyle{
								Color: mgfx.RGBA(0.75, 0.55, 1, 0.85), StripeWidth: 5, Gap: 5})
						}}}}
			root = mgfx.Overlay{Children: []mgfx.Component{components, modal}}
		}
		host.Paint(canvas, banner, root)
	}
	app.PointerMove = host.PointerMove
	app.PointerDown = host.PointerDown
	app.PointerUp = host.PointerUp
	app.Cursor = host.CursorAt
	app.KeyDown = host.KeyDown
	app.KeyUp = host.KeyUp
	app.AnimationActive = func() bool { return playing }
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
