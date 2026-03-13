import 'package:flutter/material.dart';

class AppTheme {
  // Requested brand palette
  static const Color navyBlue = Color(0xFF03045E);
  static const Color deepBlue = Color(0xFF023E8A);
  static const Color oceanBlue = Color(0xFF0077B6);
  static const Color ceruleanBlue = Color(0xFF0096C7);
  static const Color brightBlue = Color(0xFF00B4D8);
  static const Color skyBlue = Color(0xFF48CAE4);
  static const Color paleBlue = Color(0xFF90E0EF);
  static const Color lightCyan = Color(0xFFADE8F4);
  static const Color veryLightBlue = Color(0xFFCAF0F8);

  // Backward-compatible aliases used across existing screens
  static const Color brandNavy = navyBlue;
  static const Color brandCyan = brightBlue;
  static const Color brandLight = veryLightBlue;
  static const Color brandText = navyBlue;

  static ThemeData get light {
    final scheme = ColorScheme.fromSeed(
      seedColor: brightBlue,
      brightness: Brightness.light,
      primary: navyBlue,
      secondary: ceruleanBlue,
      surface: Colors.white,
      background: veryLightBlue,
    );

    return ThemeData(
      useMaterial3: true,
      colorScheme: scheme,
      scaffoldBackgroundColor: veryLightBlue,
      appBarTheme: const AppBarTheme(
        backgroundColor: navyBlue,
        foregroundColor: Colors.white,
        centerTitle: true,
        elevation: 0,
      ),
      textTheme: const TextTheme(
        headlineSmall: TextStyle(
          color: navyBlue,
          fontWeight: FontWeight.w700,
          letterSpacing: 0.2,
        ),
        titleLarge: TextStyle(
          color: navyBlue,
          fontWeight: FontWeight.w700,
        ),
        titleMedium: TextStyle(
          color: deepBlue,
          fontWeight: FontWeight.w600,
        ),
        bodyLarge: TextStyle(color: navyBlue),
        bodyMedium: TextStyle(color: deepBlue),
      ),
      dividerColor: skyBlue.withOpacity(0.35),
      cardTheme: CardTheme(
        color: Colors.white,
        elevation: 2,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: const Color(0xFFF7FDFF),
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: paleBlue),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: paleBlue),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: oceanBlue, width: 1.6),
        ),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: deepBlue,
          foregroundColor: Colors.white,
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
          elevation: 2,
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          foregroundColor: oceanBlue,
        ),
      ),
      chipTheme: ChipThemeData(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
        side: const BorderSide(color: paleBlue),
        backgroundColor: Colors.white,
        selectedColor: skyBlue.withOpacity(0.25),
        labelStyle: const TextStyle(color: brandText),
      ),
      snackBarTheme: SnackBarThemeData(
        backgroundColor: deepBlue,
        contentTextStyle: const TextStyle(color: Colors.white),
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
    );
  }

  static ThemeData get dark {
    const darkBg = Color(0xFF010229);
    const darkCard = Color(0xFF03204E);

    final scheme = ColorScheme.fromSeed(
      seedColor: brightBlue,
      brightness: Brightness.dark,
      primary: skyBlue,
      secondary: brightBlue,
      surface: darkCard,
      background: darkBg,
    );

    return ThemeData(
      useMaterial3: true,
      colorScheme: scheme,
      scaffoldBackgroundColor: darkBg,
      appBarTheme: const AppBarTheme(
        backgroundColor: Color(0xFF02123B),
        foregroundColor: Colors.white,
        centerTitle: true,
        elevation: 0,
      ),
      cardTheme: CardTheme(
        color: darkCard,
        elevation: 1,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: const Color(0xFF042F72),
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: ceruleanBlue),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: ceruleanBlue),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: skyBlue, width: 1.6),
        ),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: brightBlue,
          foregroundColor: navyBlue,
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          foregroundColor: skyBlue,
        ),
      ),
      snackBarTheme: SnackBarThemeData(
        backgroundColor: const Color(0xFF03326A),
        contentTextStyle: const TextStyle(color: Colors.white),
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
    );
  }
}
