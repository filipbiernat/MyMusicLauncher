import React, { useState, useEffect, useCallback } from 'react';
import { StatusBar } from 'expo-status-bar';
import { View, StyleSheet, Linking } from 'react-native';
import { SetupScreen } from './src/screens/SetupScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { Storage } from './src/config/storage';
import { SpotifyAuth } from './src/services/SpotifyAuth';
import { SPOTIFY_REDIRECT_URI } from './src/config/constants';

export default function App() {
  const [isLoading, setIsLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(true);

  const checkSetupStatus = useCallback(async () => {
    try {
      const config = await Storage.getConfig();
      // Consider setup complete if we have at least a car device and playlist
      const isSetup = !!(config.carDeviceAddress && config.playlistUri);
      setNeedsSetup(!isSetup);
    } catch {
      setNeedsSetup(true);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    checkSetupStatus();
  }, [checkSetupStatus]);

  // Handle Spotify OAuth redirect
  useEffect(() => {
    const handleUrl = async (event: { url: string }) => {
      if (event.url.startsWith(SPOTIFY_REDIRECT_URI)) {
        const success = await SpotifyAuth.handleRedirect(event.url);
        if (success) {
          // Token stored, refresh UI
          checkSetupStatus();
        }
      }
    };

    // Handle deep link when app is already open
    const subscription = Linking.addEventListener('url', handleUrl);

    // Handle deep link when app is opened from cold start
    Linking.getInitialURL().then((url) => {
      if (url && url.startsWith(SPOTIFY_REDIRECT_URI)) {
        handleUrl({ url });
      }
    });

    return () => subscription.remove();
  }, [checkSetupStatus]);

  if (isLoading) {
    return <View style={styles.loading} />;
  }

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      {needsSetup ? (
        <SetupScreen onComplete={() => setNeedsSetup(false)} />
      ) : (
        <SettingsScreen onNeedsSetup={() => setNeedsSetup(true)} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121218',
  },
  loading: {
    flex: 1,
    backgroundColor: '#121218',
  },
});
