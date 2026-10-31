import 'dart:io';

import 'package:flutter/services.dart';

const _channel = MethodChannel('carrotcam/system');

/// Opens Android's "Hotspot & tethering" screen so USB tethering can be turned
/// on. Returns false when no settings screen could be opened.
Future<bool> openTetherSettings() async {
  if (!Platform.isAndroid) return false;
  try {
    return await _channel.invokeMethod<bool>('openTetherSettings') ?? false;
  } catch (_) {
    return false;
  }
}

/// Keeps streaming when the screen turns off (Android foreground service with
/// a "CarrotCam is your webcam" notification). Call while the app is open.
Future<bool> startStreamService(String pcName) async {
  if (!Platform.isAndroid) return false;
  try {
    return await _channel.invokeMethod<bool>('startStreamService', {'pc': pcName}) ?? false;
  } catch (_) {
    return false;
  }
}

Future<void> stopStreamService() async {
  if (!Platform.isAndroid) return;
  try {
    await _channel.invokeMethod('stopStreamService');
  } catch (_) {}
}
