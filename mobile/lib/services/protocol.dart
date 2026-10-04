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
];

const List<(String, String)> kPresets = [
  ('natural', '🌿 Natural'),
  ('studio', '✨ Studio Glow'),
  ('streamer', '🎮 Streamer'),
  ('cinematic', '🎬 Cinematic'),
  ('spotlight', '🔦 Spotlight'),
  ('meeting', '💼 Meeting'),
  ('retro', '📼 Retro'),
  ('noir', '🎩 Noir'),
];

const List<(String, String)> kReactions = [
  ('hearts', '❤️'),
  ('thumbs', '👍'),
  ('confetti', '🎊'),
  ('balloons', '🎈'),
  ('fireworks', '🎆'),
  ('rain', '🌧️'),
];
