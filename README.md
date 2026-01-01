# .mirrord

A high-performance Android device mirroring application built with Electron, powered by the **scrcpy** protocol. Designed for developers and power users who demand speed, style, and advanced control.

## Key Features

### High Performance Mirroring

- **scrcpy Integration**: Leverages the industry-standard scrcpy protocol for the lowest possible latency.
- **60 FPS Support**: Smooth, real-time interaction by default.
- **Multiple Decoders**: Choose between **WebCodec (Hardware/Software)** for battery efficiency or **JMuxer** for compatibility.

### Smart Connectivity

- **Auto-Wireless**: Plug your device via USB once, and .mirrord will automatically set up TCP/IP and promote it to a wireless connection.
- **Manual Wireless**: Connect to any device on your network via IP address and port.
- **Persistent Settings**: Your ADB paths and device preferences are saved automatically across sessions.

### Advanced Configuration

- **Manual ADB Path**: Specify a custom ADB executable with a built-in **Real-time Validator** and shake-feedback for errors.
- **Auto-Discovery**: Automatically searches common SDK paths on macOS, Linux, and Windows.
- **Startup Guide**: If ADB is missing, a setup modal automatically guides you through configuration.

### Productivity Tools

- **Bidirectional Clipboard**: Copy text on your Mac and paste it on Android (and vice versa) instantly.
- **Soft Keyboard Control**: Toggle the Android virtual keyboard ON or OFF permanently to keep your screen clear of obstructions.
- **Game Mode**: Map your physical keys (WASD, Space, etc.) to on-screen touch points for gaming or testing.

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) (Recommended package manager)
- Node.js & NPM
- Android Device with **USB Debugging** enabled.

### Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   bun install
   ```
3. Build the assets:
   ```bash
   bun run build:renderer
   bun run build:css
   ```
4. Launch the application:
   ```bash
   bun start
   ```

## 🛠️ Technology Stack

- **Frontend**: HTML5, Tailwind CSS, TypeScript.
- **Backend**: Electron, Node.js.
- **Protocol**: scrcpy-server (Java) & ADB (Android Debug Bridge).

---

_.mirrord - Bringing your Android screen to your desktop with zero friction._
