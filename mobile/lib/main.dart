import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;

import 'screens/home_screen.dart';
import 'screens/login_screen.dart';
import 'services/auth_service.dart';
import 'services/transfer_service.dart';

void main() {
  final client = http.Client();
  final auth = AuthService(client);
  runApp(AiBlockApp(auth: auth, transfers: TransferService(client, auth)));
}

class AiBlockApp extends StatelessWidget {
  const AiBlockApp({super.key, required this.auth, required this.transfers});

  final AuthService auth;
  final TransferService transfers;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'AI Block System',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(colorSchemeSeed: const Color(0xFF1D4ED8), useMaterial3: true),
      home: FutureBuilder<String?>(
        future: auth.getJwt(),
        builder: (context, snap) {
          if (snap.connectionState != ConnectionState.done) {
            return const Scaffold(body: Center(child: CircularProgressIndicator()));
          }
          return snap.data == null
              ? LoginScreen(auth: auth, transfers: transfers)
              : HomeScreen(auth: auth, transfers: transfers);
        },
      ),
    );
  }
}
