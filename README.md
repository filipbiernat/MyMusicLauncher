# 🚗🎵 MyMusicLauncher

An Android app that automatically plays your favorite Spotify playlist when your phone connects to your car's Bluetooth audio system.

## Features

- **Automatic Bluetooth Detection** — Listens for your car's Bluetooth connection in the background
- **Spotify Playback Control** — Starts your chosen playlist via Spotify Web API with Intent fallback
- **Shuffle Mode** — Automatically enables shuffle when playback starts
- **Background Service** — Runs as a persistent foreground service with a notification
- **Android Auto Support** — Also detects Android Auto car mode entry
- **Setup Wizard** — Step-by-step first-time configuration
- **Dark UI** — Spotify-inspired green-on-black design

## How It Works

```
Phone connects to car Bluetooth
        ↓
BroadcastReceiver detects ACL_CONNECTED
        ↓
Checks if device matches saved car MAC address
        ↓
Connects to Spotify → Plays playlist → Enables shuffle
        ↓
On disconnect → Pauses playback
```

## Tech Stack

| Layer | Technology |
|:---|:---|
| Framework | Expo SDK 57 + React Native |
| Spotify | Spotify Web API + Android Intents |
| Bluetooth | Custom Expo Module (Kotlin BroadcastReceiver) |
| Notifications | expo-notifications (foreground service) |
| Storage | expo-secure-store |
| Auth | OAuth2 PKCE (no client secret exposed) |

## Prerequisites

- Android phone with **Spotify app** installed
- **Spotify Premium** account (required for playback control)
- Car with Bluetooth audio system (paired with phone)
- Spotify Developer App with Client ID ([create one here](https://developer.spotify.com/dashboard))

## Project Structure

```
MyMusicLauncher/
├── modules/
│   └── bluetooth-detector/          # Native Kotlin Expo module
│       ├── android/src/main/java/
│       │   └── BluetoothDetectorModule.kt   # BroadcastReceiver
│       ├── index.ts                 # TypeScript bridge
│       └── expo-module.config.json
├── plugins/
│   └── withBluetoothDetector.js     # Config plugin (permissions)
├── src/
│   ├── components/
│   │   ├── StatusCard.tsx           # Service status indicators
│   │   ├── DeviceSelector.tsx       # Paired BT device picker
│   │   └── EventLogView.tsx         # Real-time event log
│   ├── screens/
│   │   ├── SetupScreen.tsx          # First-run wizard (6 steps)
│   │   └── SettingsScreen.tsx       # Main control panel
│   ├── services/
│   │   ├── SpotifyService.ts        # Playback control
│   │   ├── SpotifyAuth.ts           # OAuth2 PKCE flow
│   │   ├── CarMusicOrchestrator.ts  # BT→Spotify coordinator
│   │   ├── BackgroundService.ts     # Foreground notification
│   │   └── EventLog.ts             # In-memory event logger
│   └── config/
│       ├── constants.ts             # App configuration
│       └── storage.ts               # SecureStore wrapper
├── App.tsx                          # Entry point + deep link handler
└── app.json                         # Expo config + permissions
```

## Setup & Build

### 1. Install dependencies

```bash
npm install
```

### 2. Configure Spotify

1. Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Create a new app
3. Set **Redirect URI** to: `mymusiclauncher://spotify-callback`
4. Select **Web API** and **Android** as APIs
5. Add Android package: `com.mymusiclauncher.app`
6. Copy your **Client ID** into `src/config/constants.ts`

### 3. Build the APK

```bash
npx expo prebuild --clean --platform android
cd android && ./gradlew assembleDebug
```

The APK will be at: `android/app/build/outputs/apk/debug/app-debug.apk`

### 4. Install on device

```bash
adb install android/app/build/outputs/apk/debug/app-debug.apk
```

Or transfer the APK to your phone and open it.

### 5. In-app configuration

1. Enter your Spotify Client ID
2. Log in to Spotify
3. Select your car's Bluetooth device from paired devices
4. Paste your playlist link
5. Start the service

## Permissions

The app requires the following Android permissions:

| Permission | Purpose |
|:---|:---|
| `BLUETOOTH` / `BLUETOOTH_ADMIN` | Legacy Bluetooth access |
| `BLUETOOTH_CONNECT` / `BLUETOOTH_SCAN` | Android 12+ Bluetooth |
| `FOREGROUND_SERVICE` | Background service |
| `POST_NOTIFICATIONS` | Service notification |
| `INTERNET` | Spotify API communication |

## Development

> **Note:** This app requires a **Development Build** — it cannot run in standard Expo Go due to custom native modules.

```bash
# Type check
npx tsc --noEmit

# Prebuild native project
npx expo prebuild --clean --platform android

# Run on connected device
npx expo run:android
```

## License

MIT
