import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Animated,
  Alert,
  Dimensions,
} from 'react-native';
import { Storage } from '../config/storage';
import { SPOTIFY_CLIENT_ID, DEFAULT_PLAYLIST_URI } from '../config/constants';
import { SpotifyAuth } from '../services/SpotifyAuth';
import { DeviceSelector } from '../components/DeviceSelector';
import type { PairedDevice } from '../../modules/bluetooth-detector';

const { width } = Dimensions.get('window');

type Props = {
  onComplete: () => void;
};

type Step = 'welcome' | 'spotify_client' | 'spotify_login' | 'bluetooth' | 'playlist' | 'done';

const STEPS: Step[] = ['welcome', 'spotify_client', 'spotify_login', 'bluetooth', 'playlist', 'done'];

export function SetupScreen({ onComplete }: Props) {
  const [currentStep, setCurrentStep] = useState<Step>('welcome');
  const [clientId, setClientId] = useState(
    SPOTIFY_CLIENT_ID && SPOTIFY_CLIENT_ID !== 'YOUR_SPOTIFY_CLIENT_ID'
      ? SPOTIFY_CLIENT_ID
      : ''
  );
  const [playlistInput, setPlaylistInput] = useState(
    DEFAULT_PLAYLIST_URI || ''
  );
  const [selectedDevice, setSelectedDevice] = useState<PairedDevice | null>(null);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  const currentIndex = STEPS.indexOf(currentStep);
  const progress = (currentIndex / (STEPS.length - 1)) * 100;

  const goToStep = (step: Step) => {
    Animated.sequence([
      Animated.timing(fadeAnim, { toValue: 0, duration: 150, useNativeDriver: true }),
      Animated.timing(fadeAnim, { toValue: 1, duration: 150, useNativeDriver: true }),
    ]).start();

    setTimeout(() => setCurrentStep(step), 150);
  };

  const handleSaveClientId = async () => {
    const id = clientId.trim();
    if (!id || id.length < 10) {
      Alert.alert('Błąd', 'Podaj prawidłowy Client ID z Spotify Developer Dashboard.');
      return;
    }
    await Storage.setSpotifyClientId(id);
    goToStep('spotify_login');
  };

  const handleSpotifyLogin = async () => {
    await SpotifyAuth.login(clientId.trim());
    // After redirect, we'll handle the callback
    goToStep('bluetooth');
  };

  const handleDeviceSelect = async (device: PairedDevice) => {
    setSelectedDevice(device);
    await Storage.setCarDevice(device.address, device.name);
  };

  const handleSavePlaylist = async () => {
    let uri = playlistInput.trim();
    if (!uri) {
      Alert.alert('Błąd', 'Podaj URI lub link do playlisty Spotify.');
      return;
    }

    // Convert link to URI
    if (uri.includes('open.spotify.com/playlist/')) {
      const match = uri.match(/playlist\/([a-zA-Z0-9]+)/);
      if (match) {
        uri = `spotify:playlist:${match[1]}`;
      }
    }

    if (!uri.startsWith('spotify:playlist:')) {
      Alert.alert('Nieprawidłowy format', 'Oczekuję formatu spotify:playlist:XXXXX lub linku.');
      return;
    }

    await Storage.setPlaylist(uri, uri);
    await Storage.setShuffleEnabled(true);
    goToStep('done');
  };

  const renderStep = () => {
    switch (currentStep) {
      case 'welcome':
        return (
          <View style={styles.stepContent}>
            <Text style={styles.emoji}>🚗🎵</Text>
            <Text style={styles.stepTitle}>Witaj w MyMusicLauncher!</Text>
            <Text style={styles.stepDescription}>
              Ta aplikacja automatycznie uruchomi Twoją ulubioną playlistę Spotify,
              gdy telefon połączy się z systemem audio Twojego samochodu.
            </Text>
            <Text style={styles.stepDescription}>
              Potrzebujesz tylko 3 rzeczy:
            </Text>
            <View style={styles.checklist}>
              <Text style={styles.checkItem}>🔑 Konto Spotify Premium</Text>
              <Text style={styles.checkItem}>📱 Aplikacja Spotify na telefonie</Text>
              <Text style={styles.checkItem}>🔗 Sparowane urządzenie BT samochodu</Text>
            </View>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => goToStep('spotify_client')}
              activeOpacity={0.8}
            >
              <Text style={styles.primaryButtonText}>Rozpocznij konfigurację →</Text>
            </TouchableOpacity>
          </View>
        );

      case 'spotify_client':
        return (
          <View style={styles.stepContent}>
            <Text style={styles.emoji}>🔑</Text>
            <Text style={styles.stepTitle}>Spotify Client ID</Text>
            <Text style={styles.stepDescription}>
              1. Otwórz developer.spotify.com/dashboard{'\n'}
              2. Utwórz nową aplikację{'\n'}
              3. W "Redirect URI" wpisz:{'\n'}
              {'   '}mymusiclauncher://spotify-callback{'\n'}
              4. Skopiuj Client ID i wklej poniżej
            </Text>
            <TextInput
              style={styles.textInput}
              value={clientId}
              onChangeText={setClientId}
              placeholder="Wklej Client ID..."
              placeholderTextColor="#555"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={handleSaveClientId}
              activeOpacity={0.8}
            >
              <Text style={styles.primaryButtonText}>Zapisz i kontynuuj →</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.skipButton}
              onPress={() => goToStep('spotify_login')}
            >
              <Text style={styles.skipButtonText}>Pomiń (ustawię później)</Text>
            </TouchableOpacity>
          </View>
        );

      case 'spotify_login':
        return (
          <View style={styles.stepContent}>
            <Text style={styles.emoji}>🟢</Text>
            <Text style={styles.stepTitle}>Logowanie Spotify</Text>
            <Text style={styles.stepDescription}>
              Zaloguj się do Spotify, aby aplikacja mogła sterować odtwarzaniem.
              Wymagane konto Premium.
            </Text>
            <TouchableOpacity
              style={[styles.primaryButton, styles.spotifyButton]}
              onPress={handleSpotifyLogin}
              activeOpacity={0.8}
            >
              <Text style={styles.primaryButtonText}>Zaloguj się do Spotify</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.skipButton}
              onPress={() => goToStep('bluetooth')}
            >
              <Text style={styles.skipButtonText}>Pomiń (będę używać Intent)</Text>
            </TouchableOpacity>
          </View>
        );

      case 'bluetooth':
        return (
          <View style={styles.stepContent}>
            <Text style={styles.emoji}>📡</Text>
            <Text style={styles.stepTitle}>Wybierz samochód</Text>
            <Text style={styles.stepDescription}>
              Wybierz urządzenie Bluetooth Twojego samochodu z listy sparowanych urządzeń.
            </Text>
            <DeviceSelector
              selectedAddress={selectedDevice?.address || null}
              onSelect={handleDeviceSelect}
            />
            {selectedDevice && (
              <TouchableOpacity
                style={styles.primaryButton}
                onPress={() => goToStep('playlist')}
                activeOpacity={0.8}
              >
                <Text style={styles.primaryButtonText}>
                  Wybrano: {selectedDevice.name} →
                </Text>
              </TouchableOpacity>
            )}
          </View>
        );

      case 'playlist':
        return (
          <View style={styles.stepContent}>
            <Text style={styles.emoji}>🎵</Text>
            <Text style={styles.stepTitle}>Twoja playlista</Text>
            <Text style={styles.stepDescription}>
              Wklej link do playlisty Spotify lub jej URI.{'\n'}
              W Spotify: ... → Udostępnij → Kopiuj link
            </Text>
            <TextInput
              style={styles.textInput}
              value={playlistInput}
              onChangeText={setPlaylistInput}
              placeholder="https://open.spotify.com/playlist/... lub spotify:playlist:..."
              placeholderTextColor="#555"
              autoCapitalize="none"
              autoCorrect={false}
              multiline
            />
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={handleSavePlaylist}
              activeOpacity={0.8}
            >
              <Text style={styles.primaryButtonText}>Zapisz playlistę →</Text>
            </TouchableOpacity>
          </View>
        );

      case 'done':
        return (
          <View style={styles.stepContent}>
            <Text style={styles.emoji}>🎉</Text>
            <Text style={styles.stepTitle}>Gotowe!</Text>
            <Text style={styles.stepDescription}>
              Konfiguracja zakończona. Teraz wystarczy uruchomić usługę
              i czekać aż telefon połączy się z samochodem.
            </Text>
            <View style={styles.checklist}>
              <Text style={styles.checkItem}>
                ✅ {selectedDevice ? selectedDevice.name : 'Urządzenie BT'} — ustawiony
              </Text>
              <Text style={styles.checkItem}>✅ Playlista — ustawiona</Text>
              <Text style={styles.checkItem}>✅ Shuffle — włączony</Text>
            </View>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={onComplete}
              activeOpacity={0.8}
            >
              <Text style={styles.primaryButtonText}>Przejdź do aplikacji 🚀</Text>
            </TouchableOpacity>
          </View>
        );
    }
  };

  return (
    <View style={styles.container}>
      {/* Progress bar */}
      <View style={styles.progressContainer}>
        <View style={[styles.progressBar, { width: `${progress}%` }]} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <Animated.View style={{ opacity: fadeAnim }}>
          {renderStep()}
        </Animated.View>
      </ScrollView>

      {/* Step indicator */}
      <View style={styles.stepIndicator}>
        {STEPS.map((step, index) => (
          <View
            key={step}
            style={[
              styles.dot,
              index <= currentIndex && styles.dotActive,
            ]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121218',
  },
  progressContainer: {
    height: 3,
    backgroundColor: '#2A2A3E',
    marginTop: 50,
  },
  progressBar: {
    height: 3,
    backgroundColor: '#1DB954',
    borderRadius: 2,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 24,
    paddingTop: 40,
    flexGrow: 1,
  },
  stepContent: {
    flex: 1,
  },
  emoji: {
    fontSize: 56,
    textAlign: 'center',
    marginBottom: 20,
  },
  stepTitle: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 16,
    letterSpacing: -0.5,
  },
  stepDescription: {
    color: '#A0A0B8',
    fontSize: 15,
    lineHeight: 24,
    textAlign: 'center',
    marginBottom: 16,
  },
  checklist: {
    backgroundColor: '#1E1E2E',
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
  },
  checkItem: {
    color: '#D0D0E0',
    fontSize: 15,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#2A2A3E',
  },
  textInput: {
    backgroundColor: '#1E1E2E',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: '#FFFFFF',
    fontSize: 15,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#2A2A3E',
  },
  primaryButton: {
    backgroundColor: '#1DB954',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 12,
    shadowColor: '#1DB954',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  spotifyButton: {
    backgroundColor: '#1DB954',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
  skipButton: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  skipButtonText: {
    color: '#78909C',
    fontSize: 14,
  },
  stepIndicator: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingBottom: 30,
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#2A2A3E',
  },
  dotActive: {
    backgroundColor: '#1DB954',
  },
});
