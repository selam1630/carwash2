import 'package:flutter/material.dart';
import 'screens/login_screen.dart';
import 'screens/registration_screen.dart';
import 'screens/otp_verification_screen.dart';
import 'screens/subscription_screen.dart';

class App extends StatelessWidget {
  const App({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Car Wash Mobile',
      theme: ThemeData(primarySwatch: Colors.blue),
      home: const LoginScreen(),
      routes: {
        '/register': (_) => const RegistrationScreen(),
        '/otp': (ctx) {
          final args = ModalRoute.of(ctx)!.settings.arguments as Map<String, dynamic>?;
          final phone = args != null ? args['phone'] as String? : null;
          return OtpVerificationScreen(phone: phone ?? '');
        }
        ,
        '/subscriptions': (_) => const SubscriptionScreen(),
      },
    );
  }
}
