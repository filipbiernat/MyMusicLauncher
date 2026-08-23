/**
 * SpotifyAuth — Handles Spotify OAuth2 PKCE authentication flow.
 *
 * Uses the Authorization Code with PKCE flow to obtain access tokens
 * without exposing a Client Secret (suitable for mobile apps).
 */

import { Linking } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { sha256 } from 'js-sha256';
import { SPOTIFY_CLIENT_ID, SPOTIFY_REDIRECT_URI } from '../config/constants';
import { Storage } from '../config/storage';
import { EventLog } from './EventLog';
import { BluetoothDetector } from '../../modules/bluetooth-detector';

// Spotify OAuth endpoints
const AUTH_ENDPOINT = 'https://accounts.spotify.com/authorize';
const TOKEN_ENDPOINT = 'https://accounts.spotify.com/api/token';

// Scopes required for playback control
const SCOPES = [
  'user-modify-playback-state',
  'user-read-playback-state',
  'user-read-currently-playing',
  'playlist-read-private',
  'playlist-read-collaborative',
].join(' ');

// PKCE helpers
function generateRandomString(length: number): string {
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return result;
}

function base64urlEncode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

class SpotifyAuthClass {
  private codeVerifier: string | null = null;

  /**
   * Initiate the Spotify login flow.
   * Opens the Spotify authorization page in the browser.
   */
  async login(clientId?: string): Promise<void> {
    try {
      const effectiveClientId = clientId || SPOTIFY_CLIENT_ID;

      if (effectiveClientId === 'YOUR_SPOTIFY_CLIENT_ID') {
        EventLog.error('Ustaw Client ID Spotify w ustawieniach!');
        return;
      }

      // Generate PKCE code verifier and challenge
      this.codeVerifier = generateRandomString(128);
      await SecureStore.setItemAsync('spotify_code_verifier', this.codeVerifier);

      const hashBuffer = sha256.arrayBuffer(this.codeVerifier);
      const codeChallenge = base64urlEncode(hashBuffer);

      const params = new URLSearchParams({
        client_id: effectiveClientId,
        response_type: 'code',
        redirect_uri: SPOTIFY_REDIRECT_URI,
        scope: SCOPES,
        code_challenge_method: 'S256',
        code_challenge: codeChallenge,
        show_dialog: 'true',
      });

      const authUrl = `${AUTH_ENDPOINT}?${params.toString()}`;
      EventLog.info('Otwieram stronę logowania Spotify...');
      await Linking.openURL(authUrl);
    } catch (error) {
      EventLog.error(`Błąd logowania Spotify: ${error}`);
    }
  }

  /**
   * Handle the redirect callback from Spotify OAuth.
   * Exchanges the authorization code for an access token.
   */
  async handleRedirect(url: string): Promise<boolean> {
    try {
      const parsedUrl = new URL(url);
      const code = parsedUrl.searchParams.get('code');
      const error = parsedUrl.searchParams.get('error');

      if (error) {
        EventLog.error(`Spotify auth error: ${error}`);
        return false;
      }

      if (!code) {
        EventLog.error('Brak kodu autoryzacyjnego w redirect');
        return false;
      }

      const codeVerifier = await SecureStore.getItemAsync('spotify_code_verifier');
      if (!codeVerifier) {
        EventLog.error('Brak code verifier — spróbuj zalogować się ponownie');
        return false;
      }

      const config = await Storage.getConfig();
      const clientId = config.spotifyClientId || SPOTIFY_CLIENT_ID;

      // Exchange code for token
      const response = await fetch(TOKEN_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: clientId,
          grant_type: 'authorization_code',
          code: code,
          redirect_uri: SPOTIFY_REDIRECT_URI,
          code_verifier: codeVerifier,
        }).toString(),
      });

      if (!response.ok) {
        const body = await response.text();
        EventLog.error(`Token exchange failed (${response.status}): ${body}`);
        return false;
      }

      const data = await response.json();
      await Storage.setSpotifyToken(data.access_token);

      if (data.refresh_token) {
        await SecureStore.setItemAsync('spotify_refresh_token', data.refresh_token);
      }

      try {
        BluetoothDetector.syncConfig({
          spotifyToken: data.access_token,
          spotifyRefreshToken: data.refresh_token || undefined,
          spotifyClientId: clientId,
        });
      } catch (e) {
        // Ignore in dev
      }

      EventLog.success('Zalogowano do Spotify!');
      return true;
    } catch (error) {
      EventLog.error(`Błąd wymiany tokenu: ${error}`);
      return false;
    }
  }

  /**
   * Refresh the access token using the stored refresh token.
   */
  async refreshToken(): Promise<boolean> {
    try {
      const refreshToken = await SecureStore.getItemAsync('spotify_refresh_token');
      if (!refreshToken) {
        EventLog.warning('Brak refresh token — wymagane ponowne logowanie');
        return false;
      }

      const config = await Storage.getConfig();
      const clientId = config.spotifyClientId || SPOTIFY_CLIENT_ID;

      const response = await fetch(TOKEN_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: clientId,
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
        }).toString(),
      });

      if (!response.ok) {
        EventLog.error('Nie udało się odświeżyć tokenu');
        return false;
      }

      const data = await response.json();
      await Storage.setSpotifyToken(data.access_token);

      if (data.refresh_token) {
        await SecureStore.setItemAsync('spotify_refresh_token', data.refresh_token);
      }

      try {
        BluetoothDetector.syncConfig({
          spotifyToken: data.access_token,
          spotifyRefreshToken: data.refresh_token || refreshToken,
          spotifyClientId: clientId,
        });
      } catch (e) {
        // Ignore in dev
      }

      EventLog.info('Token Spotify odświeżony');
      return true;
    } catch (error) {
      EventLog.error(`Błąd odświeżania tokenu: ${error}`);
      return false;
    }
  }

  /**
   * Check if we have a valid (non-expired) token.
   * If the token seems invalid, try to refresh it.
   */
  async ensureValidToken(): Promise<boolean> {
    const config = await Storage.getConfig();
    if (!config.spotifyToken) return false;

    // Test the token with a simple API call
    try {
      const response = await fetch('https://api.spotify.com/v1/me', {
        headers: { Authorization: `Bearer ${config.spotifyToken}` },
      });

      if (response.ok) return true;
      if (response.status === 401) {
        return await this.refreshToken();
      }
      return false;
    } catch {
      return false;
    }
  }
}

export const SpotifyAuth = new SpotifyAuthClass();
