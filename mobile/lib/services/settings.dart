import 'dart:convert';
import 'dart:math';

import 'package:device_info_plus/device_info_plus.dart';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// A PC this phone has paired with.
class KnownPc {
  KnownPc({required this.id, required this.name, required this.hosts, required this.port, required this.token, this.lastUsed = 0});

  final String id;
  String name;
  List<String> hosts;
  int port;
  String token;
  int lastUsed;

  Map<String, dynamic> toJson() => {'id': id, 'name': name, 'hosts': hosts, 'port': port, 'token': token, 'lastUsed': lastUsed};

  factory KnownPc.fromJson(Map<String, dynamic> j) => KnownPc(
        id: j['id'] as String,
        name: (j['name'] ?? 'PC') as String,
        hosts: List<String>.from(j['hosts'] as List? ?? const []),
        port: (j['port'] ?? 47820) as int,
        token: (j['token'] ?? '') as String,
        lastUsed: (j['lastUsed'] ?? 0) as int,
      );
}

/// Persistent app settings.
class AppSettings extends ChangeNotifier {
  AppSettings._(this._prefs);

  static late AppSettings instance;
  final SharedPreferences _prefs;

  late String deviceId;
  late String deviceName;
  late String model;
  ThemeMode themeMode = ThemeMode.system;
  bool autoConnect = true;
  bool keepAwake = true;
  bool startFront = false;
  bool autoUpdate = true;
  bool stealthAfterConnect = false;
  final Map<String, KnownPc> pcs = {};

  static Future<AppSettings> load() async {
    final prefs = await SharedPreferences.getInstance();
    final s = AppSettings._(prefs);
    s.deviceId = prefs.getString('deviceId') ?? _newId();
    await prefs.setString('deviceId', s.deviceId);
    s.model = await _model();
    s.deviceName = prefs.getString('deviceName') ?? s.model;
    s.themeMode = ThemeMode.values[(prefs.getInt('theme') ?? 0).clamp(0, 2)];
    s.autoConnect = prefs.getBool('autoConnect') ?? true;
    s.keepAwake = prefs.getBool('keepAwake') ?? true;
    s.startFront = prefs.getBool('startFront') ?? false;
    s.autoUpdate = prefs.getBool('autoUpdate') ?? true;
    s.stealthAfterConnect = prefs.getBool('stealth') ?? false;
    try {
      final raw = prefs.getString('pcs');
      if (raw != null) {
        for (final e in (jsonDecode(raw) as List)) {
          final pc = KnownPc.fromJson(Map<String, dynamic>.from(e as Map));
          s.pcs[pc.id] = pc;
        }
      }
    } catch (_) {}
    instance = s;
    return s;
  }

  static String _newId() {
    final r = Random.secure();
    return List.generate(16, (_) => r.nextInt(256).toRadixString(16).padLeft(2, '0')).join();
  }

  static Future<String> _model() async {
    try {
      final info = DeviceInfoPlugin();
      final android = await info.androidInfo;
      final brand = android.manufacturer.isEmpty ? '' : '${android.manufacturer[0].toUpperCase()}${android.manufacturer.substring(1)} ';
      return '$brand${android.model}';
    } catch (_) {
      try {
        final ios = await DeviceInfoPlugin().iosInfo;
        return ios.name;
      } catch (_) {
        return 'Phone';
      }
    }
  }

  KnownPc? get lastPc {
    if (pcs.isEmpty) return null;
    final list = pcs.values.toList()..sort((a, b) => b.lastUsed.compareTo(a.lastUsed));
    return list.first;
  }

  Future<void> savePc(KnownPc pc) async {
    pcs[pc.id] = pc;
    await _prefs.setString('pcs', jsonEncode(pcs.values.map((p) => p.toJson()).toList()));
    notifyListeners();
  }

  Future<void> forgetPc(String id) async {
    pcs.remove(id);
    await _prefs.setString('pcs', jsonEncode(pcs.values.map((p) => p.toJson()).toList()));
    notifyListeners();
  }

  Future<void> setThemeMode(ThemeMode m) async {
    themeMode = m;
    await _prefs.setInt('theme', m.index);
    notifyListeners();
  }

  Future<void> setDeviceName(String v) async {
    deviceName = v.trim().isEmpty ? model : v.trim();
    await _prefs.setString('deviceName', deviceName);
    notifyListeners();
  }

  Future<void> setFlag(String key, bool v) async {
    switch (key) {
      case 'autoConnect':
        autoConnect = v;
      case 'keepAwake':
        keepAwake = v;
      case 'startFront':
        startFront = v;
      case 'autoUpdate':
        autoUpdate = v;
      case 'stealth':
        stealthAfterConnect = v;
    }
    await _prefs.setBool(key, v);
    notifyListeners();
  }
}
