/**
 * Video Trim Modal
 * Allows users to trim videos to 30 seconds when selecting from library.
 * If react-native-video-trim is not available, renders nothing and no-ops.
 */

import React, {useEffect, useRef} from 'react';
import {Alert, NativeEventEmitter, NativeModules} from 'react-native';

// Optional native module - may not be linked or available
let showEditor: ((path: string, config: object) => void) | null = null;
let closeEditor: (() => void) | null = null;
try {
  const videoTrim = require('react-native-video-trim');
  showEditor = videoTrim.showEditor;
  closeEditor = videoTrim.closeEditor;
} catch (_) {
  // react-native-video-trim not available
}

interface VideoTrimModalProps {
  visible: boolean;
  videoUri: string;
  onTrimComplete: (trimmedVideoUri: string) => void;
  onCancel: () => void;
  maxDuration?: number; // in milliseconds
}

const VideoTrimModal: React.FC<VideoTrimModalProps> = ({
  visible,
  videoUri,
  onTrimComplete,
  onCancel,
  maxDuration = 30000, // 30 seconds default
}) => {
  const hasShownEditor = useRef(false);

  useEffect(() => {
    if (!visible || !videoUri) {
      if (hasShownEditor.current && closeEditor) {
        closeEditor();
        hasShownEditor.current = false;
      }
      return;
    }

    if (!showEditor || !closeEditor) {
      onCancel();
      return;
    }

    // Prevent showing editor multiple times
    if (hasShownEditor.current) {
      return;
    }

    hasShownEditor.current = true;

    // Get the native module
    const VideoTrimModule = NativeModules.VideoTrim;
    if (!VideoTrimModule) {
      Alert.alert('Fejl', 'Video trimming modul ikke tilgængelig');
      onCancel();
      hasShownEditor.current = false;
      return;
    }

    // Set up event listeners
    const eventEmitter = new NativeEventEmitter(VideoTrimModule);
    
    const onFinishSubscription = eventEmitter.addListener('onFinishTrimming', (event: {
      outputPath: string;
      startTime: number;
      endTime: number;
      duration: number;
    }) => {
      if (event.outputPath) {
        onTrimComplete(event.outputPath);
        hasShownEditor.current = false;
      }
    });

    const onCancelSubscription = eventEmitter.addListener('onCancel', () => {
      onCancel();
      hasShownEditor.current = false;
    });

    const onHideSubscription = eventEmitter.addListener('onHide', () => {
      hasShownEditor.current = false;
    });

    const onErrorSubscription = eventEmitter.addListener('onError', (event: {
      message: string;
      errorCode: string;
    }) => {
      Alert.alert('Fejl', event.message || 'Kunne ikke trimme videoen');
      onCancel();
      hasShownEditor.current = false;
    });

    // Show the video editor
    try {
      showEditor!(videoUri, {
        maxDuration: maxDuration / 1000, // Convert to seconds
        minDuration: 1, // Minimum 1 second
        saveButtonText: 'Gem',
        cancelButtonText: 'Annuller',
        trimmingText: 'Trimmer video...',
        enableCancelDialog: true,
        cancelDialogTitle: 'Advarsel!',
        cancelDialogMessage: 'Er du sikker på at du vil annullere?',
        cancelDialogCancelText: 'Luk',
        cancelDialogConfirmText: 'Fortsæt',
        enableSaveDialog: false,
        closeWhenFinish: true,
        fullScreenModalIOS: true,
        saveToPhoto: false,
        type: 'video',
        outputExt: 'mp4',
      });
    } catch (error) {
      Alert.alert('Fejl', 'Kunne ikke åbne video editor');
      onCancel();
      hasShownEditor.current = false;
    }

    return () => {
      onFinishSubscription.remove();
      onCancelSubscription.remove();
      onHideSubscription.remove();
      onErrorSubscription.remove();
      if (hasShownEditor.current && closeEditor) {
        closeEditor();
        hasShownEditor.current = false;
      }
    };
  }, [visible, videoUri, maxDuration, onTrimComplete, onCancel]);

  // This component doesn't render anything - it uses native modal
  return null;
};

export default VideoTrimModal;
