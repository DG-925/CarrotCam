import 'package:flutter/material.dart';

// CarrotCam phone <-> PC protocol constants.
// Keep in sync with desktop/src/shared/protocol.ts.

const int kProtocolVersion = 1;
const int kDefaultPort = 47820;
const int kDiscoveryPort = 47821;
const String kDiscoveryProbe = 'CARROTCAM_DISCOVER';
const String kMdnsType = '_carrotcam._tcp';
const String kGithubRepo = 'DG-925/CarrotCam';

/// Parsed `carrotcam://pair?h=ip1,ip2&p=port&c=code&n=name&id=pcId` QR payload.
class PairInfo {
  PairInfo({required this.hosts, required this.port, this.code, required this.name, required this.id});

  final List<String> hosts;
  final int port;
  final String? code;
  final String name;
  final String id;

  static PairInfo? parse(String raw) {
    final uri = Uri.tryParse(raw.trim());
    if (uri == null || uri.scheme != 'carrotcam') return null;
    final q = uri.queryParameters;
    final hosts = (q['h'] ?? '').split(',').where((h) => h.isNotEmpty).toList();
    if (hosts.isEmpty) return null;
    return PairInfo(
      hosts: hosts,
      port: int.tryParse(q['p'] ?? '') ?? kDefaultPort,
      code: q['c'],
      name: q['n'] ?? 'PC',
      id: q['id'] ?? '',
    );
  }
}

/// Snapshot of the PC effects state used by the remote control panel.
class RemoteState {
  RemoteState({
    this.active = false,
    this.vcam = false,
    this.filter = 'original',
    this.background = 'none',
    this.autoFrame = false,
    this.spotlight = false,
    this.retouch = false,
    this.privacy = 'off',
    this.recording = false,
    this.scenes = const [],
    this.scene = 0,
  });

  final bool active;
  final bool vcam;
  final String filter;
  final String background;
  final bool autoFrame;
  final bool spotlight;
  final bool retouch;
  final String privacy;
  final bool recording;
  /// scene names on the PC (empty on older PC apps) and the active one
  final List<String> scenes;
  final int scene;

  factory RemoteState.fromJson(Map<String, dynamic> j) => RemoteState(
        active: j['active'] == true,
        vcam: j['vcam'] == true,
        filter: (j['filter'] ?? 'original') as String,
        background: (j['background'] ?? 'none') as String,
        autoFrame: j['autoFrame'] == true,
        spotlight: j['spotlight'] == true,
        retouch: j['retouch'] == true,
        privacy: (j['privacy'] ?? 'off') as String,
        recording: j['recording'] == true,
        scenes: (j['scenes'] as List?)?.map((e) => e.toString()).toList() ?? const [],
        scene: (j['scene'] as num?)?.toInt() ?? 0,
      );
}

const List<(String, String)> kFilters = [
  ('original', 'Original'),
  ('carrot', 'Carrot'),
  ('vivid', 'Vivid'),
  ('warm', 'Warm'),
  ('cool', 'Cool'),
  ('cinematic', 'Cinematic'),
  ('film', 'Film'),
  ('golden', 'Golden Hour'),
  ('portrait', 'Portrait'),
  ('arctic', 'Arctic'),
  ('neon', 'Neon'),
  ('pastel', 'Pastel'),
  ('vintage', 'Vintage'),
  ('dramatic', 'Dramatic'),
  ('rose', 'Rose'),
  ('matte', 'Matte'),
  ('cyber', 'Cyber'),
  ('noir', 'Noir'),
  ('mono', 'Mono'),
  ('sepia', 'Sepia'),
  ('kodak', 'Kodak Gold'),
  ('fuji', 'Fuji Green'),
  ('polaroid', 'Polaroid'),
  ('moody', 'Moody'),
  ('bright', 'Bright'),
  ('clean', 'Clean'),
  ('sunset', 'Sunset'),
  ('lavender', 'Lavender'),
  ('forest', 'Forest'),
  ('desert', 'Desert'),
  ('ocean', 'Ocean'),
  ('bleach', 'Bleach'),
  ('chrome', 'Chrome'),
  ('sakura', 'Sakura'),
  ('mint', 'Mint'),
  ('autumn', 'Autumn'),
  ('winter', 'Winter'),
  ('cocoa', 'Cocoa'),
  ('velvet', 'Velvet'),
  ('electric', 'Electric'),
  ('teal', 'Teal & Orange'),
  ('dreamy', 'Dreamy'),
  ('lofi', 'Lo-fi'),
];

const List<(String, String, IconData)> kPresets = [
  ('natural', 'Natural', Icons.eco_rounded),
  ('follow', 'Follow me', Icons.center_focus_strong_rounded),
  ('studio', 'Studio Glow', Icons.auto_awesome_rounded),
  ('streamer', 'Streamer', Icons.sports_esports_rounded),
  ('cinematic', 'Cinematic', Icons.movie_rounded),
  ('spotlight', 'Spotlight', Icons.flashlight_on_rounded),
  ('meeting', 'Meeting', Icons.work_rounded),
  ('retro', 'Retro', Icons.tv_rounded),
  ('noir', 'Noir', Icons.dark_mode_rounded),
];

const List<(String, String, IconData)> kReactions = [
  ('hearts', 'Hearts', Icons.favorite_rounded),
  ('thumbs', 'Thumbs up', Icons.thumb_up_rounded),
  ('confetti', 'Confetti', Icons.celebration_rounded),
  ('balloons', 'Balloons', Icons.bubble_chart_rounded),
  ('fireworks', 'Fireworks', Icons.auto_awesome_rounded),
  ('rain', 'Rain', Icons.water_drop_rounded),
];
