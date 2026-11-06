import 'package:flutter/material.dart';

import '../models.dart';
import '../services/transfer_service.dart';

class HistoryScreen extends StatefulWidget {
  const HistoryScreen({super.key, required this.transfers});

  final TransferService transfers;

  @override
  State<HistoryScreen> createState() => _HistoryScreenState();
}

class _HistoryScreenState extends State<HistoryScreen> {
  late Future<List<TransferSummary>> _future;

  @override
  void initState() {
    super.initState();
    _future = widget.transfers.fetchHistory();
  }

  Future<void> _refresh() async {
    final f = widget.transfers.fetchHistory();
    setState(() => _future = f);
    await f;
  }

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      onRefresh: _refresh,
      child: FutureBuilder<List<TransferSummary>>(
        future: _future,
        builder: (context, snap) {
          if (snap.connectionState != ConnectionState.done) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snap.hasError) {
            return ListView(children: [Padding(padding: const EdgeInsets.all(24), child: Text('${snap.error}'))]);
          }
          final items = snap.data!;
          if (items.isEmpty) {
            return ListView(children: const [Padding(padding: EdgeInsets.all(24), child: Text('No transfers yet.'))]);
          }
          return ListView.separated(
            itemCount: items.length,
            separatorBuilder: (_, __) => const Divider(height: 1),
            itemBuilder: (context, i) {
              final t = items[i];
              final blocked = t.riskScore > 40;
              return ListTile(
                leading: CircleAvatar(
                  backgroundColor: blocked ? Colors.red.shade50 : Colors.green.shade50,
                  child: Text('${t.riskScore}',
                      style: TextStyle(color: blocked ? Colors.red.shade700 : Colors.green.shade700, fontSize: 13)),
                ),
                title: Text('${t.receiver} - ${t.amount.toStringAsFixed(2)} mUSDC'),
                subtitle: Text('${t.status} - ${t.createdUtc.toLocal().toString().substring(0, 16)}'
                    '${t.txHash != null ? '\n${t.txHash!.substring(0, 18)}...' : ''}'),
                isThreeLine: t.txHash != null,
              );
            },
          );
        },
      ),
    );
  }
}
