import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useState } from 'react';
import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { api } from '../../services/api';

export default function LoginScreen() {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword]     = useState('');
  const [loading, setLoading]        = useState(false);

  const handleLogin = async () => {
    if (!identifier || !password) { Alert.alert('Erreur', 'Remplissez tous les champs'); return; }
    setLoading(true);
    const isPhone = /^\+[1-9]\d{7,14}$/.test(identifier);
    try {
      const res = await api.post('/auth/login', { [isPhone ? 'phone' : 'email']: identifier, password });
      if (res.data.mfaRequired) {
        await SecureStore.setItemAsync('mfa_temp_token', res.data.tempToken);
        router.push(`/(auth)/verify-otp?phone=${encodeURIComponent(identifier)}`);
      } else {
        await SecureStore.setItemAsync('access_token', res.data.accessToken);
        await SecureStore.setItemAsync('refresh_token', res.data.refreshToken);
        router.replace('/(tabs)/');
      }
    } catch (err: any) {
      Alert.alert('Erreur', err?.response?.data?.error || 'Identifiants incorrects');
    } finally { setLoading(false); }
  };

  return (
    <View style={s.container}>
      <Text style={s.logo}>🔧</Text>
      <Text style={s.title}>BLA</Text>
      <Text style={s.subtitle}>Connexion</Text>
      <TextInput style={s.input} placeholder="+221 77 000 00 00 ou email" value={identifier} onChangeText={setIdentifier} autoCapitalize="none" keyboardType="email-address" />
      <TextInput style={s.input} placeholder="Mot de passe" value={password} onChangeText={setPassword} secureTextEntry />
      <TouchableOpacity style={[s.btn, loading && s.btnDisabled]} onPress={handleLogin} disabled={loading} accessibilityLabel="Se connecter">
        <Text style={s.btnText}>{loading ? 'Connexion...' : 'Se connecter'}</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => router.push('/(auth)/register')}>
        <Text style={s.link}>Pas encore de compte ? S'inscrire</Text>
      </TouchableOpacity>
    </View>
  );
}
const s = StyleSheet.create({
  container:  { flex: 1, backgroundColor: '#f9fafb', padding: 24, justifyContent: 'center' },
  logo:       { fontSize: 56, textAlign: 'center', marginBottom: 8 },
  title:      { fontSize: 32, fontWeight: '800', textAlign: 'center', color: '#16a34a', marginBottom: 4 },
  subtitle:   { fontSize: 16, textAlign: 'center', color: '#6b7280', marginBottom: 32 },
  input:      { backgroundColor: '#fff', borderWidth: 1, borderColor: '#d1d5db', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 15, marginBottom: 12 },
  btn:        { backgroundColor: '#16a34a', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  btnDisabled:{ opacity: 0.6 },
  btnText:    { color: '#fff', fontWeight: '700', fontSize: 16 },
  link:       { textAlign: 'center', color: '#16a34a', marginTop: 16, fontSize: 14 },
});
