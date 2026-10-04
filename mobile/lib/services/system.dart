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
