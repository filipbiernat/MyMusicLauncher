import * as SecureStore from 'expo-secure-store';

const KEYS = {
  CAR_DEVICE_ADDRESS: 'car_device_address',
  CAR_DEVICE_NAME: 'car_device_name',
  PLAYLIST_URI: 'playlist_uri',
  PLAYLIST_NAME: 'playlist_name',
  SPOTIFY_TOKEN: 'spotify_token',
  SHUFFLE_ENABLED: 'shuffle_enabled',
  SERVICE_ENABLED: 'service_enabled',
  SPOTIFY_CLIENT_ID: 'spotify_client_id',
} as const;

export type AppConfig = {
  carDeviceAddress: string | null;
  carDeviceName: string | null;
  playlistUri: string | null;
  playlistName: string | null;
  spotifyToken: string | null;
  shuffleEnabled: boolean;
  serviceEnabled: boolean;
  spotifyClientId: string | null;
};

async function get(key: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

async function set(key: string, value: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(key, value);
  } catch (e) {
    console.error(`[Storage] Failed to set ${key}:`, e);
  }
}

async function remove(key: string): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(key);
  } catch (e) {
    console.error(`[Storage] Failed to remove ${key}:`, e);
  }
}

export const Storage = {
  async getConfig(): Promise<AppConfig> {
    const [
      carDeviceAddress,
      carDeviceName,
      playlistUri,
      playlistName,
      spotifyToken,
      shuffleEnabled,
      serviceEnabled,
      spotifyClientId,
    ] = await Promise.all([
      get(KEYS.CAR_DEVICE_ADDRESS),
      get(KEYS.CAR_DEVICE_NAME),
      get(KEYS.PLAYLIST_URI),
      get(KEYS.PLAYLIST_NAME),
      get(KEYS.SPOTIFY_TOKEN),
      get(KEYS.SHUFFLE_ENABLED),
      get(KEYS.SERVICE_ENABLED),
      get(KEYS.SPOTIFY_CLIENT_ID),
    ]);

    return {
      carDeviceAddress,
      carDeviceName,
      playlistUri,
      playlistName,
      spotifyToken,
      shuffleEnabled: shuffleEnabled !== 'false', // default true
      serviceEnabled: serviceEnabled === 'true',
      spotifyClientId,
    };
  },

  async setCarDevice(address: string, name: string): Promise<void> {
    await Promise.all([
      set(KEYS.CAR_DEVICE_ADDRESS, address),
      set(KEYS.CAR_DEVICE_NAME, name),
    ]);
  },

  async setPlaylist(uri: string, name: string): Promise<void> {
    await Promise.all([
      set(KEYS.PLAYLIST_URI, uri),
      set(KEYS.PLAYLIST_NAME, name),
    ]);
  },

  async setSpotifyToken(token: string): Promise<void> {
    await set(KEYS.SPOTIFY_TOKEN, token);
  },

  async setShuffleEnabled(enabled: boolean): Promise<void> {
    await set(KEYS.SHUFFLE_ENABLED, String(enabled));
  },

  async setServiceEnabled(enabled: boolean): Promise<void> {
    await set(KEYS.SERVICE_ENABLED, String(enabled));
  },

  async setSpotifyClientId(clientId: string): Promise<void> {
    await set(KEYS.SPOTIFY_CLIENT_ID, clientId);
  },

  async clearAll(): Promise<void> {
    await Promise.all(
      Object.values(KEYS).map((key) => remove(key))
    );
  },
};
