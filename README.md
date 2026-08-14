# termshot

`termshot` takes a screenshot on macOS and writes it to a PNG file.

It can capture the whole display, one window, or a command you want to show
running in a real terminal. Use it to produce clean evidence images for pull
requests, issues, and docs.

## Requirements

- macOS.
- [Bun](https://bun.sh) to install and run the tool.
- Screen Recording permission for your terminal, under `System Settings` then
  `Privacy & Security`.
- [Ghostty](https://ghostty.org) if you want to use `--run`.
- [CleanShot](https://cleanshot.com) if you want to use `--annotate`.
- [rclone](https://rclone.org) if you want to use `--publish`.

## Install

```sh
bun install
bun link
```

`bun link` puts a global `termshot` command in `~/.bun/bin`. Add that folder to
your `PATH`:

```sh
echo 'export PATH="$HOME/.bun/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

## Configure

There is no config file. Every setting is a flag.

For `--publish` you need an `rclone` remote of your own. Create one with
`rclone config`, then pass the remote and folder as the destination, for
example `myremote:shots/`.

## Daily use

```sh
termshot                                  # whole display
termshot -o shot.png                      # write to a chosen path
termshot -w                               # pick a window by hand
termshot --list                           # list windows: id, layer, owner, title
termshot --window 5651                    # capture one window by its numeric id
termshot --window Ghostty                 # capture one window by title or app name
termshot --run "ls -la"                   # run a command in a fresh terminal, capture it
termshot --run "htop" --cols 160 --rows 45   # use a bigger terminal grid
termshot --box 10,60,620,330 --marker 700,240  # draw a box and a dot on the PNG
termshot --annotate                       # open the result in CleanShot
termshot --copy                           # copy the PNG to the clipboard
termshot --stdout > shot.png              # write PNG bytes to stdout
termshot --publish myremote:shots/        # upload and print an embed line
```

The default output path is `~/termshot/<timestamp>.png`.

## Options

| Flag | What it does | Default |
|------|--------------|---------|
| `-o, --output <path>` | Output PNG path | `~/termshot/<timestamp>.png` |
| `--stdout` | Write PNG bytes to stdout | off |
| `-w, --window-pick` | Pick a window by hand | off |
| `--window <id\|name>` | Capture one window: a number matches the window id, text matches the title then the app name | none |
| `--run <command>` | Run the command in a fresh Ghostty window and capture it | none |
| `--settle <ms>` | Wait after the `--run` window appears, before capturing | `500` |
| `--cols <n>` | Width of the `--run` window in terminal columns | `120` |
| `--rows <n>` | Height of the `--run` window in terminal rows | `30` |
| `--box <x,y,w,h[,color]>` | Draw a rectangle on the PNG; repeatable | red, 4px stroke |
| `--marker <x,y[,color]>` | Draw a filled dot on the PNG; repeatable | red, 12px radius |
| `--list` | List on-screen windows | none |
| `--annotate` | Open the PNG in CleanShot | off |
| `--copy` | Copy the PNG to the clipboard | off |
| `--publish <dest>` | Upload the PNG to an `rclone` remote folder, make it public, print an embed line | none |
| `--publish-size <px>` | Long edge width for the embed | `2560` |
| `--publish-label <text>` | Alt text for the embed | file name |
| `-h, --help` | Show help | |
| `-v, --version` | Show version | |

Colors are `red`, `green`, `blue`, `yellow`, `orange`, `purple`, `black`,
`white`, or a hex value like `#RRGGBB`. Box and marker coordinates are pixels
in the output image, measured from the top left corner.

`--run` does not combine with `--window` or `-w`. `--annotate` and `--copy` do
not combine with `--stdout`.

## How `--run` stays clean

A `--run` capture shows the command output and nothing else. Four defaults make
that true.

- The window opens with no titlebar, so the internal window handle never shows.
- A short settle and a screen clear remove the shell login banner.
- The terminal is told not to wait for a keypress, so no `Process exited`
  banner appears.
- The rows under the output are erased and the cursor is hidden.

`termshot` closes the window and the process it started once the capture is
written, whether the capture worked or not.

If you run a tiling window manager, it may force the `--run` window to a size
you did not ask for. Add a rule that floats windows titled `termshot-*`.

## Development

```sh
bun test
bun run src/cli.ts --help
```

## Notes

- Success prints one line on stderr: `termshot: wrote <path> (<n> bytes)`.
- stdout stays empty unless you use `--stdout` or `--list`.
- Only macOS is supported. Other platforms exit with a clear message.

## License

MIT. See `LICENSE`.
