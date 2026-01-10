<p align="center"><img src="./resources/mirrd-bannner.png?raw=tru"/></p>


<p align="center">
  <a href="https://github.com/lyswhut/lx-music-desktop/releases"><img src="https://img.shields.io/github/release/yodeput/mirrord" alt="Release version"></a>
  <a href="https://github.com/yodeput/mirrord/actions/workflows/release.yml"><img src="https://github.com/yodeput/mirrord/workflows/Build/badge.svg" alt="Build status"></a>
  <a href="https://electronjs.org/releases/stable"><img src="https://img.shields.io/github/package-json/dependency-version/yodeput/mirrord/dev/electron/master" alt="Electron version"></a>
  <img src="https://img.shields.io/github/package-json/dependency-version/yodeput/mirrord/dev/react/master" alt="React version">
</p>

<!-- [![GitHub release][1]][2]
[![Build status][3]][4]
[![GitHub Releases Download][5]][6]
[![dev branch][7]][8]
[![GitHub license][9]][10] -->

<!-- [1]: https://img.shields.io/github/release/yodeput/mirrord
[2]: https://github.com/yodeput/mirrord/releases
[3]: https://ci.appveyor.com/api/projects/status/flrsqd5ymp8fnte5?svg=true
[4]: https://ci.appveyor.com/project/yodeput/mirrord
[5]: https://img.shields.io/github/downloads/yodeput/mirrord/latest/total
[5]: https://img.shields.io/github/downloads/yodeput/mirrord/total
[6]: https://github.com/yodeput/mirrord/releases
[7]: https://img.shields.io/github/package-json/v/yodeput/mirrord/dev
[8]: https://github.com/yodeput/mirrord/tree/dev
[9]: https://img.shields.io/github/license/yodeput/mirrord
[10]: https://github.com/yodeput/mirrord/blob/master/LICENSE -->

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

### Screenshot

<table>
  <tr>
    <td>
    <p style="text-align: center;">
      <img src="./resources/screenshot/ss-1.png?raw=true" alt="Main Screen" width="600"/>
       </p>
    </td>
    <td>
   <p style="text-align: center;">
      <img src="./resources/screenshot/ss-2.png?raw=true" alt="Device Screen" width="600"/>
       </p>
    </td>
  </tr>
  <tr>
    <td>
     Main Screen
    </td>
    <td>
      Device Screen
    </td>
  </tr>
</table>

## Roadmap / TODO

- [X] Check for updates
- [X] Screenshot
- [X] Audio routing from source
- [X] Video Recording

## Getting Started

### Prerequisites

- [yarn](https://yarnpkg.com) (Recommended package manager)
- Node.js & NPM
- Android Device with **USB Debugging** enabled.

### Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   yarn install
   ```
3. Build the assets:
   ```bash
   yarn run build
   ```
4. Launch the application:
   ```bash
   yarn dev
   ```

## 🛠️ Technology Stack

- **Frontend**: React, TypeScript.
- **Backend**: Electron, Node.js.
- **Protocol**: scrcpy-server (Java) & ADB (Android Debug Bridge).

---

_.mirrord - Bringing your Android screen to your desktop with zero friction._
