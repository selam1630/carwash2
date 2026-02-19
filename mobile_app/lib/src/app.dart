import 'package:flutter/material.dart';
import 'screens/registration_screen.dart';
import 'screens/otp_verification_screen.dart';
import 'screens/subscription_screen.dart';
import 'screens/payments_complete_screen.dart';
import 'screens/request_wash_screen.dart';
import 'screens/washer_requests_screen.dart';
import 'screens/sales_owner_registration_screen.dart';
import 'screens/splash_screen.dart';
import 'screens/login_screen.dart';
import 'theme/app_theme.dart';

class App extends StatelessWidget {
  const App({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Car Wash Mobile',
      theme: AppTheme.light,
      home: const SplashScreen(),
      routes: {
        '/register': (_) => const RegistrationScreen(),
        '/login': (_) => const LoginScreen(),
        '/otp': (ctx) {
          final args =
              ModalRoute.of(ctx)!.settings.arguments as Map<String, dynamic>?;
          final phone = args != null ? args['phone'] as String? : null;
          final fromRegistration =
              args != null ? args['fromRegistration'] == true : false;
          return OtpVerificationScreen(
            phone: phone ?? '',
            fromRegistration: fromRegistration,
          );
        },
        '/subscriptions': (_) => const SubscriptionScreen(),
        '/request-wash': (_) => const RequestWashScreen(),
        '/washer/requests': (_) => const WasherRequestsScreen(),
        '/sales/register-owners': (_) => const SalesOwnerRegistrationScreen(),
        '/payments/complete': (ctx) {
          final args =
              ModalRoute.of(ctx)!.settings.arguments as Map<String, dynamic>?;
          final txRef = args != null ? args['tx_ref'] as String? : null;
          final planId = args != null ? args['planId'] as String? : null;
          if (txRef == null || planId == null) {
            return const Scaffold(
                body: Center(child: Text('Missing payment info')));
          }
          return PaymentsCompleteScreen(txRef: txRef, planId: planId);
        },
      },
    );
  }
}
