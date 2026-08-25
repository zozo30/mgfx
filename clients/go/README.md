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

Text remains server-shaped. Anchoring, baselines, pixel tracking, and decoration
are semantic style fields rather than client-generated glyph geometry:

```go
canvas.Text("CENTERED", mgfx.TextStyle{X: bounds.X + bounds.Width/2,
    Y: 80, Size: 24, Color: white, Anchor: mgfx.AnchorMiddle,
    LetterSpacing: 1.2, Decoration: mgfx.Underline})
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

Nested canvas state uses scoped callbacks, so clips and opacity cannot leak into
later component draws:

```go
canvas.Clip(contentBounds, func(canvas *mgfx.Canvas) {
    canvas.Opacity(0.7, drawOverlay)
})
```

Exact native text measurement is available during `Application.Prepare`; the
result is returned in logical pixels at the requested font size:

```go
app.Prepare = func(ctx context.Context, client *mgfx.Client) error {
    width, err = client.MeasureText(ctx, "Native label", mgfx.TextMeasureStyle{
        Size: 22, Family: mgfx.RoundedFont, Weight: mgfx.SemiBold})
    return err
}
```

Rows and columns mix fixed minimums with flexible tracks. Padding, gaps, and
centering remain independent of the rendering backend:

```go
columns, err := (mgfx.StackLayout{Axis: mgfx.Horizontal, Gap: 12,
    Padding: mgfx.UniformInsets(16)}).Arrange(
    card, mgfx.Fixed(48), mgfx.Flex(1), mgfx.Fixed(48))
labelBounds := columns[1].Centered(mgfx.Size{Width: width + 24, Height: 40})
```

Reusable components add measurement and painting without taking ownership of
application state. Labels, panels, alignment, offsets, and component stacks
compose as ordinary Go values:

```go
label := mgfx.Panel{Padding: mgfx.SymmetricInsets(14, 6),
    Style: panelStyle,
    Child: mgfx.Label{Value: "Measured", Advance: width, Style: textStyle}}
root := mgfx.ComponentStack{Axis: mgfx.Horizontal,
    Children: []mgfx.StackChild{
        {Track: mgfx.Flex(1), Child: mgfx.Align{
            Horizontal: mgfx.AlignCenter, Vertical: mgfx.AlignCenter,
            Child: label}},
    }}
mgfx.PaintComponentTree(canvas, bounds, root)
```

`ComponentHost` uses that same measured geometry for hit-testing. A persistent
`Button` provides hover, pressed, and click behavior and plugs directly into the
application callbacks:

```go
host := &mgfx.ComponentHost{}
button := &mgfx.Button{Style: buttonStyle, Child: label,
    OnClick: func() { enabled = !enabled }}
app.Draw = func(canvas *mgfx.Canvas) { host.Paint(canvas, bounds, button) }
app.PointerMove, app.PointerDown, app.PointerUp =
    host.PointerMove, host.PointerDown, host.PointerUp
```

The same host supports keyboard access. Assign `host.KeyDown` and `host.KeyUp`
to the application to get Tab/Shift-Tab focus traversal and Enter/Space button
activation without a separate focus framework.

Assigning `host.CursorAt` to `Application.Cursor` also changes the native cursor
to a pointing hand over interactive components and restores the arrow outside.

Affine transforms also stay in logical pixels and are scoped. Scale defaults to
one when omitted, and rotation is expressed as clockwise degrees:

```go
canvas.Transform(mgfx.Transform{Rotation: 12,
    Origin: mgfx.Point{X: 120, Y: 80}}, drawCard)
```

Gradients and diagonal patterns remain one native command regardless of their
pixel area:

```go
canvas.LinearGradient(bounds, mgfx.LinearGradientStyle{
    Start: purple, End: blue, Direction: mgfx.GradientHorizontal,
    CornerRadius: 16})
canvas.DiagonalPattern(accent, mgfx.DiagonalPatternStyle{
    Color: lime, StripeWidth: 7, Gap: 6, Offset: phase})
```

Soft shadows and radial gradients are also native paints:

```go
canvas.Shadow(card, mgfx.ShadowStyle{Color: shadow,
    Blur: 24, Spread: 3, CornerRadius: 18})
canvas.RadialGradient(card, mgfx.RadialGradientStyle{
    Inner: cyan, Outer: navy,
    Center: mgfx.UnitPoint{X: 0.3, Y: 0.25}, CornerRadius: 18})
```

Progress rings use clockwise degrees at the API boundary and remain semantic
native arcs on the wire:

```go
canvas.GradientArc(gauge, mgfx.GradientArcStyle{
    StartAngle: -90, SweepAngle: 280, Thickness: 10, RoundCaps: true,
    Start: cyan, End: purple})
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
