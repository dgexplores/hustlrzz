import '../models/user.dart';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'dart:convert';
import '../config/api_config.dart';
import '../utils/friendly_errors.dart';
import 'package:supabase_flutter/supabase_flutter.dart' hide User;

class UserService extends ChangeNotifier {
  static final UserService _instance = UserService._internal();
  factory UserService() => _instance;
  UserService._internal();

  User? _currentUser;
  User? get currentUser => _currentUser;

  // get current user access token
  Future<String?> _getIdToken() async {
    try {
      final session = Supabase.instance.client.auth.currentSession;
      return session?.accessToken;
    } catch (e) {
      debugPrint('Failed to get access token: $e');
      return null;
    }
  }

  // Get user profile
  Future<User> getUserProfile() async {
    try {
      final token = await _getIdToken();
      if (token == null) {
        throw Exception('No authentication token available');
      }

      debugPrint('Calling GET /user API...');
      
      final response = await http.get(
        Uri.parse('${ApiConfig.baseUrl}${ApiConfig.userEndpoint}'),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer $token',
        },
      );

      if (response.statusCode == 200) {
        final data = json.decode(response.body);
        final user = User.fromJson(data['data']);
        _currentUser = user;
        debugPrint('✅ Real API: User profile loaded successfully');
        notifyListeners();
        return user;
      } else {
        throw Exception('API returned ${response.statusCode}: ${response.body}');
      }
    } catch (e) {
      debugPrint('❌ Failed to load user profile: $e');
      throw friendlyError(e);
    }
  }

  // Update user profile
  Future<User> updateUserProfile(Map<String, dynamic> profileData) async {
    try {
      final token = await _getIdToken();
      if (token == null) {
        throw Exception('No authentication token available');
      }

      debugPrint('Calling PUT /user API...');
      
      final response = await http.put(
        Uri.parse('${ApiConfig.baseUrl}${ApiConfig.userEndpoint}'),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer $token',
        },
        body: json.encode(profileData),
      );

      if (response.statusCode == 200) {
        final data = json.decode(response.body);
        _currentUser = User.fromJson(data['data']);
        debugPrint('✅ Real API: User profile updated successfully');
        notifyListeners();
        return _currentUser!;
      } else {
        throw Exception('API returned ${response.statusCode}: ${response.body}');
      }
    } catch (e) {
      debugPrint('❌ Failed to update user profile: $e');
      throw friendlyError(e);
    }
  }

  // Upload user avatar
  Future<String> uploadAvatar(String imagePath) async {
    try {
      final token = await _getIdToken();
      if (token == null) {
        throw Exception('No authentication token available');
      }

      debugPrint('Calling POST /user/avatar API...');
      
      var request = http.MultipartRequest(
        'POST',
        Uri.parse('${ApiConfig.baseUrl}${ApiConfig.userAvatarEndpoint}'),
      );
      
      request.headers['Authorization'] = 'Bearer $token';
      request.files.add(await http.MultipartFile.fromPath('avatar', imagePath));

      final streamedResponse = await request.send();
      final response = await http.Response.fromStream(streamedResponse);

      if (response.statusCode == 200) {
        final data = json.decode(response.body);
        final avatarUrl = data['data']['avatarUrl'];
        if (_currentUser != null) {
          _currentUser = _currentUser!.copyWith(
            photoURL: avatarUrl,
          );
        }
        debugPrint('✅ Real API: Avatar uploaded successfully');
        notifyListeners();
        return avatarUrl;
      } else {
        throw Exception('API returned ${response.statusCode}: ${response.body}');
      }
    } catch (e) {
      debugPrint('❌ Failed to upload avatar: $e');
      throw friendlyError(e);
    }
  }
} 