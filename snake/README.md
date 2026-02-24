# Screen Snaker

A fullscreen-friendly snake screensaver-style web page where the snake is controlled by a Hamiltonian cycle algorithm with an early-game engaged mode.

## Features

- 20x20 game board
- Autonomous snake movement with a Hamiltonian safety path
- Engaged early-game movement that actively targets nearby food until a length threshold
- Live top-right control panel (windowed mode):
  - Apple count selector (1-5 simultaneous apples) without restarting the game
  - Theme selector (Neon / Sunset / Monochrome) without restarting the game
- Fast, smooth animation with interpolated movement
- Pause-on-mouse-move behavior
- Fullscreen controls: press `f` to enter fullscreen, press `Esc` to exit
- Clean display with no stats overlay

## Run locally

Because this project is static, you can serve it with any web server.

### Option 1: Python

```bash
python3 -m http.server 4173
```

Then open `http://localhost:4173`.

### Option 2: VS Code Live Server

Open the project and start Live Server.
