# Cosmic Orb Catcher

A production-ready 3D web game built with Babylon.js featuring camera-based gesture control.

## 🎮 Game

Control a floating platform to catch cosmic orbs while avoiding hazards. Use hand gestures or keyboard/mouse as fallback.

## 🕹️ Controls

| Input | Action |
|-------|--------|
| ✋ Hand position | Move platform |
| 🤏 Pinch gesture | Activate shield |
| WASD / Arrows | Move (fallback) |
| Space / Click | Shield (fallback) |
| P / Escape | Pause |
| R | Restart |

## 🏗️ Architecture

```
Camera → CVEngine → FeatureProcessor → InputMapper → GameController → Renderer
```

- **CameraManager**: Webcam lifecycle and permissions
- **CVEngine**: MediaPipe Hands gesture detection
- **FeatureProcessor**: Signal smoothing and normalization
- **InputMapper**: Input abstraction (CV + keyboard/mouse)
- **GameController**: State machine and game logic (input-agnostic)
- **Renderer**: Babylon.js visuals

## 🚀 Running

```bash
# Start local server
npx serve .

# Open http://localhost:3000
```

## 📁 Structure

```
├── index.html
├── css/
│   └── styles.css
└── js/
    ├── main.js
    ├── CameraManager.js
    ├── CVEngine.js
    ├── FeatureProcessor.js
    ├── InputMapper.js
    ├── GameController.js
    └── Renderer.js
```