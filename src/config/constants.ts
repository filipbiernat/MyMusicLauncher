// Spotify configuration
// Replace with your own Client ID from https://developer.spotify.com/dashboard
export const SPOTIFY_CLIENT_ID = '3e7fe9e2434648d989eb64c4d9f0f4c6';
export const SPOTIFY_REDIRECT_URI = 'mymusiclauncher://spotify-callback';

// Default playlist URI — replace with your own
// Find it in Spotify: ... → Share → Copy link to playlist
// Format: spotify:playlist:XXXXXXXXXXXXXXXXXX
export const DEFAULT_PLAYLIST_URI = 'spotify:playlist:7I6VkTQ0Hjomh4USXsoGw7';

// Notification channel
export const NOTIFICATION_CHANNEL_ID = 'car-music-service';
export const NOTIFICATION_CHANNEL_NAME = 'Car Music Service';

// Event names from native Bluetooth module
export const BT_EVENTS = {
  CONNECTED: 'onBluetoothConnected',
  DISCONNECTED: 'onBluetoothDisconnected',
  CAR_MODE_ENTERED: 'onCarModeEntered',
  CAR_MODE_EXITED: 'onCarModeExited',
} as const;
