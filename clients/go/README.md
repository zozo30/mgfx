# MGFX Go client

This dependency-free client exercises the language-neutral MGIP/MGFX binary
protocol directly from Go. It asks the persistent graphics server to create a
window, then submits a clear plus one native `DrawText` command whenever the
window is resized.

Start `MGFXServer`, then run:

```sh
cd clients/go
go run .
```

An alternate Unix socket path may be supplied as the first argument:

```sh
go run . /tmp/mgfx-501.sock
```

Run the byte-level protocol tests with:

```sh
go test ./...
```
