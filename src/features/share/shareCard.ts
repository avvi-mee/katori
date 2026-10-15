import type { RefObject } from 'react';
import type { View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

// shortcut: web share/download. Phase 4 native builds use expo-sharing with the captured file.
/** Capture a view as PNG and share it (Web Share with files), falling back to a download. */
export async function shareCard(
  ref: RefObject<View | null>,
  filename: string,
  text: string,
): Promise<'shared' | 'downloaded'> {
  const dataUri = await captureRef(ref, { format: 'png', quality: 1, result: 'data-uri' });
  const blob = await (await fetch(dataUri)).blob();
  const file = new File([blob], filename, { type: 'image/png' });
  if (typeof navigator !== 'undefined' && navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], text });
    return 'shared';
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  return 'downloaded';
}
