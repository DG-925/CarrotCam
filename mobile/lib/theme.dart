import 'package:flutter/material.dart';

/// CarrotCam colors: flat graphite surfaces with one orange accent, the same
/// palette as the PC app. No gradients, glows or idle animations (they cost
/// battery while the phone streams).
class CC {
  static const orange = Color(0xFFFF7A1A);
  static const orangeText = Color(0xFFFF8F40);
  static const green = Color(0xFF32D27C);
  static const red = Color(0xFFF0443A);

  // dark
  static const bg = Color(0xFF0E0E10);
  static const surface = Color(0xFF151518);
  static const surface2 = Color(0xFF1C1C20);
  static const surface3 = Color(0xFF26262C);
  static const border = Color(0xFF232328);
  static const border2 = Color(0xFF2F2F36);
  static const text = Color(0xFFF2F2F4);
  static const text2 = Color(0xFFC7C7CF);
  static const muted = Color(0xFF8C8C96);

  // light
  static const bgLight = Color(0xFFF6F6F8);
  static const surface2Light = Color(0xFFF2F2F5);
  static const surface3Light = Color(0xFFE5E5EA);
  static const borderLight = Color(0xFFE4E4E9);
  static const textLight = Color(0xFF18181B);
  static const mutedLight = Color(0xFF6E6E78);

  /// Translucent dark pill for controls over the camera picture.
  static const overlay = Color(0xB3080809);
  static const overlayBorder = Color(0x1FFFFFFF);
}

/// Theme-aware tokens for widgets that need more than the ColorScheme.
class Tokens {
  Tokens(this.dark);
  final bool dark;
  Color get surface => dark ? CC.surface : Colors.white;
  Color get surface2 => dark ? CC.surface2 : CC.surface2Light;
  Color get surface3 => dark ? CC.surface3 : CC.surface3Light;
  Color get border => dark ? CC.border : CC.borderLight;
  Color get text => dark ? CC.text : CC.textLight;
  Color get muted => dark ? CC.muted : CC.mutedLight;
  Color get accentSoft => CC.orange.withValues(alpha: dark ? 0.13 : 0.1);

  static Tokens of(BuildContext context) => Tokens(Theme.of(context).brightness == Brightness.dark);
}

ThemeData buildTheme(Brightness brightness) {
  final dark = brightness == Brightness.dark;
  final t = Tokens(dark);
  final bg = dark ? CC.bg : CC.bgLight;

  final scheme = ColorScheme.fromSeed(
    seedColor: CC.orange,
    brightness: brightness,
    primary: CC.orange,
    onPrimary: Colors.white,
    surface: t.surface,
    onSurface: t.text,
  ).copyWith(
    surfaceContainerHighest: t.surface2,
    surfaceContainerHigh: t.surface2,
    surfaceContainer: t.surface,
    surfaceContainerLow: t.surface,
    outline: t.muted,
    outlineVariant: t.border,
    secondaryContainer: t.accentSoft,
    onSecondaryContainer: dark ? CC.orangeText : const Color(0xFFD9600B),
  );

  final base = ThemeData(useMaterial3: true, colorScheme: scheme, brightness: brightness, splashFactory: InkRipple.splashFactory);
  final shape12 = RoundedRectangleBorder(borderRadius: BorderRadius.circular(12));
  return base.copyWith(
    scaffoldBackgroundColor: bg,
    canvasColor: bg,
    dividerColor: t.border,
    dividerTheme: DividerThemeData(color: t.border, space: 1, thickness: 1),
    textTheme: base.textTheme.apply(bodyColor: t.text, displayColor: t.text),
    appBarTheme: AppBarTheme(
      backgroundColor: bg,
      foregroundColor: t.text,
      elevation: 0,
      scrolledUnderElevation: 0,
      centerTitle: false,
      titleTextStyle: TextStyle(color: t.text, fontSize: 20, fontWeight: FontWeight.w700, letterSpacing: -0.2),
    ),
    cardTheme: CardThemeData(
      color: t.surface,
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14), side: BorderSide(color: t.border)),
    ),
    listTileTheme: ListTileThemeData(
      iconColor: CC.orange,
      subtitleTextStyle: TextStyle(color: t.muted, fontSize: 13),
      titleTextStyle: TextStyle(color: t.text, fontSize: 15, fontWeight: FontWeight.w600),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: CC.orange,
        foregroundColor: Colors.white,
        minimumSize: const Size(0, 50),
        elevation: 0,
        shape: shape12,
        textStyle: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: t.text,
        backgroundColor: t.surface2,
        minimumSize: const Size(0, 50),
        side: BorderSide(color: dark ? CC.border2 : const Color(0xFFD3D3DA)),
        shape: shape12,
        textStyle: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(foregroundColor: dark ? CC.orangeText : const Color(0xFFD9600B), textStyle: const TextStyle(fontWeight: FontWeight.w700)),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: t.surface2,
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: t.border)),
      enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: t.border)),
      focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: CC.orange, width: 2)),
    ),
    snackBarTheme: SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      backgroundColor: dark ? CC.surface3 : const Color(0xFF18181B),
      contentTextStyle: const TextStyle(color: Colors.white),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
    ),
    bottomSheetTheme: BottomSheetThemeData(
      backgroundColor: t.surface,
      surfaceTintColor: Colors.transparent,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      showDragHandle: true,
      dragHandleColor: dark ? CC.border2 : const Color(0xFFD3D3DA),
    ),
    dialogTheme: DialogThemeData(
      backgroundColor: t.surface,
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16), side: BorderSide(color: t.border)),
    ),
    sliderTheme: base.sliderTheme.copyWith(
      activeTrackColor: CC.orange,
      thumbColor: Colors.white,
      trackHeight: 4,
      inactiveTrackColor: dark ? Colors.white24 : Colors.black12,
      overlayColor: CC.orange.withValues(alpha: 0.15),
    ),
    switchTheme: SwitchThemeData(
      thumbColor: WidgetStateProperty.all(Colors.white),
      trackColor: WidgetStateProperty.resolveWith((s) => s.contains(WidgetState.selected) ? CC.orange : t.surface3),
      trackOutlineColor: WidgetStateProperty.all(Colors.transparent),
    ),
    segmentedButtonTheme: SegmentedButtonThemeData(
      style: SegmentedButton.styleFrom(
        backgroundColor: t.surface2,
        selectedBackgroundColor: t.surface3,
        selectedForegroundColor: t.text,
        foregroundColor: t.muted,
        side: BorderSide(color: t.border),
        shape: shape12,
        textStyle: const TextStyle(fontWeight: FontWeight.w700),
      ),
    ),
    chipTheme: base.chipTheme.copyWith(
      backgroundColor: t.surface2,
      side: BorderSide(color: t.border),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      labelStyle: TextStyle(color: t.text, fontWeight: FontWeight.w600),
    ),
    progressIndicatorTheme: const ProgressIndicatorThemeData(color: CC.orange),
  );
}

/// Small uppercase heading used above groups.
class SectionLabel extends StatelessWidget {
  const SectionLabel(this.text, {super.key, this.trailing, this.padding = const EdgeInsets.fromLTRB(4, 24, 4, 10)});
  final String text;
  final Widget? trailing;
  final EdgeInsets padding;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: padding,
      child: Row(children: [
        Text(text.toUpperCase(),
            style: TextStyle(color: Tokens.of(context).muted, fontWeight: FontWeight.w700, letterSpacing: 1, fontSize: 11.5)),
        if (trailing != null) ...[const SizedBox(width: 10), trailing!],
      ]),
    );
  }
}

/// Rounded square icon on a soft orange tile.
class IconTile extends StatelessWidget {
  const IconTile(this.icon, {super.key, this.size = 44, this.color});
  final IconData icon;
  final double size;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final c = color ?? CC.orange;
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(color: c.withValues(alpha: 0.13), borderRadius: BorderRadius.circular(size * 0.28)),
      child: Icon(icon, color: c, size: size * 0.5),
    );
  }
}

/// A status dot (no glow, no animation).
class Dot extends StatelessWidget {
  const Dot(this.color, {super.key, this.size = 8});
  final Color color;
  final double size;

  @override
  Widget build(BuildContext context) =>
      Container(width: size, height: size, decoration: BoxDecoration(color: color, shape: BoxShape.circle));
}
