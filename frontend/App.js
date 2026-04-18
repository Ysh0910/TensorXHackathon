/**
 * AI Gold Assessment System – Stage 1 Frontend
 * React Native + Expo SDK 50+
 *
 * Workflow:
 *  1. Request Camera + Microphone permissions on mount.
 *  2. "Capture Image"  → opens camera, takes a high-res photo.
 *  3. "Hold-to-Record" → records audio while button is pressed, stops on release.
 *  4. "Submit"         → packages both files into FormData and POSTs to FastAPI.
 */

import React, { useState, useRef, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  SafeAreaView,
  StatusBar,
  Platform,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Audio } from 'expo-av';

// ---------------------------------------------------------------------------
// Configuration – change this to your machine's LAN IP when testing on device
// ---------------------------------------------------------------------------
const BACKEND_URL = 'http://192.168.1.3:8000';

// ---------------------------------------------------------------------------
// Design tokens (Fintech: Dark Navy + Gold/Amber)
// ---------------------------------------------------------------------------
const COLORS = {
  background:    '#0D1B2A',
  surface:       '#1A2B3C',
  border:        '#243447',
  gold:          '#F5A623',
  goldDark:      '#C47D0E',
  goldDisabled:  '#7A5210',
  textPrimary:   '#FFFFFF',
  textSecondary: '#8FA3B1',
  success:       '#2ECC71',
  danger:        '#E74C3C',
};

// ---------------------------------------------------------------------------
// Audio recording configuration (high-quality WAV)
// ---------------------------------------------------------------------------
const RECORDING_OPTIONS = {
  android: {
    extension: '.wav',
    outputFormat: Audio.AndroidOutputFormat.DEFAULT,
    audioEncoder: Audio.AndroidAudioEncoder.DEFAULT,
    sampleRate: 44100,
    numberOfChannels: 1,
    bitRate: 128000,
  },
  ios: {
    extension: '.wav',
    audioQuality: Audio.IOSAudioQuality.HIGH,
    sampleRate: 44100,
    numberOfChannels: 1,
    bitRate: 128000,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: {},
};

// ---------------------------------------------------------------------------
// Small reusable components
// ---------------------------------------------------------------------------

/** Pill-shaped status badge */
const StatusBadge = ({ label, active }) => (
  <View style={[styles.badge, active ? styles.badgeActive : styles.badgeInactive]}>
    <Text style={styles.badgeText}>{active ? '✓ ' : '○ '}{label}</Text>
  </View>
);

/** Primary action button with disabled + loading states */
const GoldButton = ({ title, onPress, onPressIn, onPressOut, disabled, danger }) => (
  <TouchableOpacity
    style={[
      styles.button,
      danger        && styles.buttonDanger,
      disabled      && styles.buttonDisabled,
    ]}
    onPress={onPress}
    onPressIn={onPressIn}
    onPressOut={onPressOut}
    disabled={disabled}
    activeOpacity={0.75}
  >
    <Text style={[styles.buttonText, disabled && styles.buttonTextDisabled]}>
      {title}
    </Text>
  </TouchableOpacity>
);

// ---------------------------------------------------------------------------
// Main App
// ---------------------------------------------------------------------------
export default function App() {
  // --- Permissions ---
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [micGranted, setMicGranted]                 = useState(false);

  // --- Capture state ---
  const [capturedImage, setCapturedImage] = useState(null);   // { uri, ... }
  const [capturedAudio, setCapturedAudio] = useState(null);   // { uri }
  const [isRecording,   setIsRecording]   = useState(false);
  const [showCamera,    setShowCamera]    = useState(false);

  // --- Upload state ---
  const [isUploading, setIsUploading] = useState(false);

  // --- Refs ---
  const cameraRef   = useRef(null);
  const recordingRef = useRef(null);

  // -------------------------------------------------------------------------
  // Permission helpers
  // -------------------------------------------------------------------------
  const ensureMicPermission = useCallback(async () => {
    if (micGranted) return true;
    const { status } = await Audio.requestPermissionsAsync();
    if (status === 'granted') {
      setMicGranted(true);
      return true;
    }
    Alert.alert(
      'Microphone Permission Required',
      'Please enable microphone access in your device settings to use the tap test.',
    );
    return false;
  }, [micGranted]);

  const ensureCameraPermission = useCallback(async () => {
    if (cameraPermission?.granted) return true;
    const result = await requestCameraPermission();
    if (!result.granted) {
      Alert.alert(
        'Camera Permission Required',
        'Please enable camera access in your device settings to capture images.',
      );
      return false;
    }
    return true;
  }, [cameraPermission, requestCameraPermission]);

  // -------------------------------------------------------------------------
  // Camera capture
  // -------------------------------------------------------------------------
  const handleOpenCamera = useCallback(async () => {
    const ok = await ensureCameraPermission();
    if (ok) setShowCamera(true);
  }, [ensureCameraPermission]);

  const handleTakePhoto = useCallback(async () => {
    if (!cameraRef.current) return;
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 1,          // maximum quality
        skipProcessing: false,
      });
      setCapturedImage(photo);
      setShowCamera(false);
    } catch (err) {
      Alert.alert('Capture Error', 'Failed to take photo. Please try again.');
      console.error('[Camera]', err);
    }
  }, []);

  // -------------------------------------------------------------------------
  // Audio recording (hold-to-record)
  // -------------------------------------------------------------------------
  const handleRecordStart = useCallback(async () => {
    const ok = await ensureMicPermission();
    if (!ok) return;

    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording } = await Audio.Recording.createAsync(RECORDING_OPTIONS);
      recordingRef.current = recording;
      setIsRecording(true);
    } catch (err) {
      Alert.alert('Recording Error', 'Could not start audio recording.');
      console.error('[Audio]', err);
    }
  }, [ensureMicPermission]);

  const handleRecordStop = useCallback(async () => {
    if (!recordingRef.current) return;
    try {
      setIsRecording(false);
      await recordingRef.current.stopAndUnloadAsync();
      const uri = recordingRef.current.getURI();
      recordingRef.current = null;

      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });

      if (uri) {
        setCapturedAudio({ uri });
      }
    } catch (err) {
      Alert.alert('Recording Error', 'Could not stop audio recording.');
      console.error('[Audio]', err);
    }
  }, []);

  // -------------------------------------------------------------------------
  // Submit
  // -------------------------------------------------------------------------
  const handleSubmit = useCallback(async () => {
    if (!capturedImage || !capturedAudio) return;

    setIsUploading(true);
    try {
      const formData = new FormData();

      // Image file
      const imageFilename = capturedImage.uri.split('/').pop() || 'capture.jpg';
      const imageType     = imageFilename.endsWith('.png') ? 'image/png' : 'image/jpeg';
      formData.append('image', {
        uri:  capturedImage.uri,
        name: imageFilename,
        type: imageType,
      });

      // Audio file
      const audioFilename = capturedAudio.uri.split('/').pop() || 'tap_test.wav';
      formData.append('audio', {
        uri:  capturedAudio.uri,
        name: audioFilename,
        type: 'audio/wav',
      });

      const response = await fetch(`${BACKEND_URL}/start-assessment`, {
        method:  'POST',
        headers: { 'Accept': 'application/json' },
        body:    formData,
      });

      const data = await response.json();

      if (response.status === 201) {
        Alert.alert(
          '✅ Assessment Submitted',
          `Session ID:\n${data.session_id}`,
          [{ text: 'OK', onPress: resetState }],
        );
      } else {
        Alert.alert(
          'Submission Failed',
          data.detail || `Server returned status ${response.status}`,
        );
      }
    } catch (err) {
      Alert.alert(
        'Network Error',
        `Could not reach the server.\n\nCheck that BACKEND_URL is correct:\n${BACKEND_URL}`,
      );
      console.error('[Submit]', err);
    } finally {
      setIsUploading(false);
    }
  }, [capturedImage, capturedAudio]);

  const resetState = useCallback(() => {
    setCapturedImage(null);
    setCapturedAudio(null);
  }, []);

  // -------------------------------------------------------------------------
  // Render – Camera overlay
  // -------------------------------------------------------------------------
  if (showCamera) {
    return (
      <View style={styles.cameraContainer}>
        <StatusBar barStyle="light-content" />
        <CameraView
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          facing="back"
          pictureSize="highest"
        />
        <View style={styles.cameraControls}>
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={() => setShowCamera(false)}
          >
            <Text style={styles.cancelButtonText}>✕ Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.shutterButton} onPress={handleTakePhoto}>
            <View style={styles.shutterInner} />
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // -------------------------------------------------------------------------
  // Render – Main UI
  // -------------------------------------------------------------------------
  const canSubmit = !!capturedImage && !!capturedAudio && !isUploading;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />

      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>⬡ Gold Assessment</Text>
          <Text style={styles.headerSubtitle}>Stage 1 · Sensor Capture</Text>
        </View>

        {/* Status panel */}
        <View style={styles.statusPanel}>
          <Text style={styles.sectionLabel}>CAPTURE STATUS</Text>
          <View style={styles.badgeRow}>
            <StatusBadge label="Image"  active={!!capturedImage} />
            <StatusBadge label="Audio"  active={!!capturedAudio} />
          </View>
        </View>

        {/* Action buttons */}
        <View style={styles.actionsPanel}>
          <Text style={styles.sectionLabel}>ACTIONS</Text>

          <GoldButton
            title={capturedImage ? '📷 Retake Image' : '📷 Capture Image'}
            onPress={handleOpenCamera}
            disabled={isUploading}
          />

          <GoldButton
            title={
              isRecording
                ? '🔴 Recording… (Release to Stop)'
                : capturedAudio
                ? '🎙 Re-record Tap Test'
                : '🎙 Hold to Record Tap Test'
            }
            onPressIn={handleRecordStart}
            onPressOut={handleRecordStop}
            disabled={isUploading}
            danger={isRecording}
          />
        </View>

        {/* Submit */}
        <View style={styles.submitPanel}>
          {isUploading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={COLORS.gold} />
              <Text style={styles.loadingText}>Uploading assessment…</Text>
            </View>
          ) : (
            <GoldButton
              title="Submit Assessment →"
              onPress={handleSubmit}
              disabled={!canSubmit}
            />
          )}
          {(!capturedImage || !capturedAudio) && !isUploading && (
            <Text style={styles.hintText}>
              Capture both an image and audio to enable submission.
            </Text>
          )}
        </View>

        {/* Footer */}
        <Text style={styles.footer}>
          Connected to {BACKEND_URL}
        </Text>
      </View>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: Platform.OS === 'android' ? 16 : 8,
    paddingBottom: 16,
  },

  // Header
  header: {
    alignItems: 'center',
    marginBottom: 28,
    paddingTop: 8,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: '700',
    color: COLORS.gold,
    letterSpacing: 1.2,
  },
  headerSubtitle: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 4,
    letterSpacing: 0.8,
  },

  // Section label
  sectionLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textSecondary,
    letterSpacing: 1.5,
    marginBottom: 12,
  },

  // Status panel
  statusPanel: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 12,
  },
  badge: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  badgeActive: {
    backgroundColor: '#1A3A2A',
    borderWidth: 1,
    borderColor: COLORS.success,
  },
  badgeInactive: {
    backgroundColor: COLORS.border,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  badgeText: {
    color: COLORS.textPrimary,
    fontSize: 13,
    fontWeight: '500',
  },

  // Actions panel
  actionsPanel: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 12,
  },

  // Submit panel
  submitPanel: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 20,
  },

  // Buttons
  button: {
    backgroundColor: COLORS.gold,
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  buttonDanger: {
    backgroundColor: COLORS.danger,
  },
  buttonDisabled: {
    backgroundColor: COLORS.goldDisabled,
  },
  buttonText: {
    color: '#0D1B2A',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  buttonTextDisabled: {
    color: '#4A3A20',
  },

  // Loading
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 8,
    gap: 10,
  },
  loadingText: {
    color: COLORS.textSecondary,
    fontSize: 14,
  },

  // Hint
  hintText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    textAlign: 'center',
    marginTop: 10,
    lineHeight: 18,
  },

  // Footer
  footer: {
    textAlign: 'center',
    color: COLORS.border,
    fontSize: 11,
    marginTop: 'auto',
  },

  // Camera overlay
  cameraContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  cameraControls: {
    position: 'absolute',
    bottom: 48,
    left: 0,
    right: 0,
    alignItems: 'center',
    gap: 20,
  },
  shutterButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 4,
    borderColor: '#FFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FFF',
  },
  cancelButton: {
    position: 'absolute',
    left: 24,
    bottom: 0,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  cancelButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
