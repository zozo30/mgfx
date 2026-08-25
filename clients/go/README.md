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

Start `MGFXServer`, then run:

```sh
cd clients/go
go run .
```

Run the byte-level protocol tests with:

```sh
go test ./...
```
