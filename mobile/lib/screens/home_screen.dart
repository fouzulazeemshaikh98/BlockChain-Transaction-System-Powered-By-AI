import 'package:flutter/material.dart';

import '../services/auth_service.dart';
import '../services/transfer_service.dart';
import 'history_screen.dart';
import 'login_screen.dart';
import 'transfer_screen.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key, required this.auth, required this.transfers});

  final AuthService auth;
  final TransferService transfers;

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  int _tab = 0;

  Future<void> _logout() async {
    await widget.auth.logout();
    if (!mounted) return;
    Navigator.of(context).pushReplacement(
      MaterialPageRoute(builder: (_) => LoginScreen(auth: widget.auth, transfers: widget.transfers)),
    );
  }

  @override
  Widget build(BuildContext context) {
    final pages = [
      TransferScreen(transfers: widget.transfers),
      HistoryScreen(transfers: widget.transfers),
    ];
    return Scaffold(
      appBar: AppBar(
        title: Text(_tab == 0 ? 'New Transfer' : 'Settlement History'),
        actions: [IconButton(onPressed: _logout, icon: const Icon(Icons.logout), tooltip: 'Sign out')],
      ),
      body: pages[_tab],
      bottomNavigationBar: NavigationBar(
        selectedIndex: _tab,
        onDestinationSelected: (i) => setState(() => _tab = i),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.send_outlined), label: 'Transfer'),
          NavigationDestination(icon: Icon(Icons.history), label: 'History'),
        ],
      ),
    );
  }
}
