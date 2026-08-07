import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('App title renders', (WidgetTester tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: Text('Hustlrzz interview preparation'),
        ),
      ),
    );

    expect(find.text('Hustlrzz interview preparation'), findsOneWidget);
  });
}
