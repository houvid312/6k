"use strict";
var _a, _b;
Object.defineProperty(exports, "__esModule", { value: true });
exports.supabase = void 0;
var supabase_js_1 = require("@supabase/supabase-js");
var react_native_1 = require("react-native");
var async_storage_1 = require("@react-native-async-storage/async-storage");
var supabaseUrl = (_a = process.env.EXPO_PUBLIC_SUPABASE_URL) !== null && _a !== void 0 ? _a : '';
var supabaseAnonKey = (_b = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY) !== null && _b !== void 0 ? _b : '';
// Use localStorage on web, AsyncStorage on native
var storage = react_native_1.Platform.OS === 'web' ? undefined : async_storage_1.default;
exports.supabase = (0, supabase_js_1.createClient)(supabaseUrl, supabaseAnonKey, {
    auth: {
        storage: storage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
    },
});
