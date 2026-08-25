# MGFX Go client

The dependency-free `mgfx` package hides MGIP framing, Unix-socket parsing,
window lifecycle, frame sequencing, resize handling, and normalized graphics
coordinates behind a small logical-pixel API.

```go
window := mgfx.Window{Title: "Hello", Width: 720, Height: 320,
    MinimumWidth: 480, MinimumHeight: 220, Resizable: true}

err := mgfx.Run(ctx, window, func(canvas *mgfx.Canvas) {
    canvas.Clear(mgfx.RGB(0.025, 0.035, 0.065))
    canvas.Text("Hello from Go", mgfx.TextStyle{
        X: 40, Y: 120, Size: 34,
        Color: mgfx.RGB(0.72, 0.94, 1), Weight: mgfx.SemiBold,
    })
})
```

`Dial`, `OpenWindow`, and `Serve` are also public for applications that need
explicit lifecycle control. `RunAt` supports a non-default Unix socket.

For interactive programs, `Application` provides typed pointer, keyboard,
scroll, and UTF-8 text callbacks. Callback state changes are redrawn
automatically, and frames are coalesced while Metal is presenting:

```go
app := mgfx.Application{Window: window, Draw: draw}
app.PointerDown = func(point mgfx.Point) { selected = point }
app.TextInput = func(text string) { value += text }
err := app.Run(ctx)
```

Animation uses the graphics server's native display-link clock rather than a
client timer. Setting `Animation` opts into ticks; the package requests and
correlates each frame automatically:

```go
app.Animation = func(now time.Duration) {
    phase = float32(now.Seconds())
}
```

Shapes use the same logical-pixel coordinate system. Both fill and border are
lowered to one semantic server command:

```go
canvas.RoundedRect(mgfx.Rect{X: 24, Y: 24, Width: 220, Height: 96},
    mgfx.ShapeStyle{Fill: mgfx.RGB(0.08, 0.16, 0.28),
        Border: mgfx.RGB(0.3, 0.7, 1), BorderWidth: 2, CornerRadius: 16})
canvas.Circle(mgfx.Rect{X: 270, Y: 32, Width: 72, Height: 72},
    mgfx.ShapeStyle{Fill: mgfx.RGB(0.2, 0.85, 0.55)})
```

Start `MGFXServer`, then run:

```sh
cd clients/go
go run .
```

Run the byte-level protocol tests with:

```sh
go test ./...
```
