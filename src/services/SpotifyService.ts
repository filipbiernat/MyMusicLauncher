/**
 * SpotifyService — Controls Spotify playback via App Remote SDK
 *
 * Since we're using a native Expo module approach, this service wraps
 * the Spotify App Remote SDK interactions. For the initial version,
 * we use Android Intents as a reliable fallback mechanism to control
 * Spotify, which doesn't require the full App Remote SDK dependency.
 *
 * This approach uses:
 * 1. Spotify content URIs with Android Intents for playback
 * 2. Spotify Web API for shuffle control (when token available)
 */

import { Linking, Platform } from 'react-native';
import { EventLog } from './EventLog';
import { Storage } from '../config/storage';

class SpotifyServiceClass {
  private isConnected = false;

  /**
   * Start playing a Spotify playlist by opening it via URI intent.
   * This will open Spotify app and start playback automatically.
   */
  async playPlaylist(playlistUri: string): Promise<boolean> {
    try {
      EventLog.info(`Uruchamiam playlistę: ${playlistUri}`);

      // Spotify URIs can be opened directly via Linking on Android
      // Format: spotify:playlist:XXXXX
      const canOpen = await Linking.canOpenURL(playlistUri);

      if (canOpen) {
        await Linking.openURL(playlistUri);
        this.isConnected = true;
        EventLog.success('Playlista uruchomiona w Spotify');
        return true;
      } else {
        // Try with https format
        const playlistId = playlistUri.replace('spotify:playlist:', '');
        const webUrl = `https://open.spotify.com/playlist/${playlistId}`;
        await Linking.openURL(webUrl);
        this.isConnected = true;
        EventLog.success('Playlista uruchomiona (via link)');
        return true;
      }
    } catch (error) {
      EventLog.error(`Błąd uruchamiania playlisty: ${error}`);
      return false;
    }
  }

  /**
   * Enable shuffle mode via Spotify Web API.
   * Requires a valid access token with user-modify-playback-state scope.
   */
  async setShuffle(enabled: boolean): Promise<boolean> {
    try {
      const config = await Storage.getConfig();
      const token = config.spotifyToken;

      if (!token) {
        EventLog.warning('Brak tokenu Spotify — shuffle może nie działać');
        return false;
      }

      const response = await fetch(
        `https://api.spotify.com/v1/me/player/shuffle?state=${enabled}`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (response.ok || response.status === 204) {
        EventLog.success(`Tryb losowy: ${enabled ? 'WŁĄCZONY' : 'WYŁĄCZONY'}`);
        return true;
      } else if (response.status === 401) {
        EventLog.warning('Token Spotify wygasł — wymagane ponowne logowanie');
        return false;
      } else {
        const body = await response.text();
        EventLog.error(`Shuffle API error (${response.status}): ${body}`);
        return false;
      }
    } catch (error) {
      EventLog.error(`Błąd ustawiania shuffle: ${error}`);
      return false;
    }
  }

  /**
   * Start playback with shuffle in one call.
   * Uses Spotify Web API to start a specific playlist context with shuffle enabled.
   */
  async playPlaylistWithShuffle(playlistUri: string): Promise<boolean> {
    try {
      const config = await Storage.getConfig();
      const token = config.spotifyToken;

      if (token) {
        // Try Web API approach first — gives us shuffle + play in controlled manner
        const shuffleResult = await this.setShuffleViaApi(token, true);
        const playResult = await this.playViaApi(token, playlistUri);

        if (playResult) {
          EventLog.success('Playlista uruchomiona z shuffle (Web API)');
          this.isConnected = true;
          return true;
        }
      }

      // Fallback: Open via Intent (no shuffle guarantee)
      EventLog.info('Fallback: uruchamiam przez Intent...');
      const result = await this.playPlaylist(playlistUri);
      if (result && token) {
        // Try to set shuffle after playback starts
        setTimeout(() => this.setShuffle(true), 2000);
      }
      return result;
    } catch (error) {
      EventLog.error(`Błąd playPlaylistWithShuffle: ${error}`);
      return false;
    }
  }

  private async playViaApi(token: string, contextUri: string): Promise<boolean> {
    try {
      const response = await fetch('https://api.spotify.com/v1/me/player/play', {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          context_uri: contextUri,
        }),
      });

      return response.ok || response.status === 204;
    } catch {
      return false;
    }
  }

  private async setShuffleViaApi(token: string, state: boolean): Promise<boolean> {
    try {
      const response = await fetch(
        `https://api.spotify.com/v1/me/player/shuffle?state=${state}`,
        {
          method: 'PUT',
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      return response.ok || response.status === 204;
    } catch {
      return false;
    }
  }

  /**
   * Pause current playback via Spotify Web API.
   */
  async pause(): Promise<boolean> {
    try {
      const config = await Storage.getConfig();
      const token = config.spotifyToken;

      if (!token) {
        EventLog.warning('Brak tokenu — nie mogę zapauzować');
        return false;
      }

      const response = await fetch('https://api.spotify.com/v1/me/player/pause', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok || response.status === 204) {
        EventLog.info('Spotify zapauzowane');
        return true;
      }
      return false;
    } catch (error) {
      EventLog.error(`Błąd pauzowania: ${error}`);
      return false;
    }
  }

  getConnectionStatus(): boolean {
    return this.isConnected;
  }
}

export const SpotifyService = new SpotifyServiceClass();
