import 'package:flutter/material.dart';
import 'screens/login_screen.dart';
import 'screens/registration_screen.dart';
import 'screens/otp_verification_screen.dart';
import 'screens/subscription_screen.dart';
import 'screens/payments_complete_screen.dart';
import 'screens/request_wash_screen.dart';
import 'screens/washer_requests_screen.dart';

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
