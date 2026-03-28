import { ScrollView, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

const CATEGORIES = [
  { slug: 'plomberie',    label: 'Plomberie',   emoji: '🔧' },
  { slug: 'electricite',  label: 'Électricité',  emoji: '⚡' },
  { slug: 'menuiserie',   label: 'Menuiserie',   emoji: '🪚' },
  { slug: 'climatisation',label: 'Clim',         emoji: '❄️' },
  { slug: 'peinture',     label: 'Peinture',     emoji: '🎨' },
  { slug: 'nettoyage',    label: 'Nettoyage',    emoji: '🧹' },
  { slug: 'informatique', label: 'Informatique', emoji: '💻' },
  { slug: 'jardinage',    label: 'Jardinage',    emoji: '🌿' },
];

export default function HomeScreen() {
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Hero */}
        <View style={styles.hero}>
          <Text style={styles.heroTitle}>Trouvez un prestataire</Text>
          <Text style={styles.heroSubtitle}>Plombiers, électriciens et plus, vérifiés et proches de vous</Text>
          <TouchableOpacity
            style={styles.searchBtn}
            onPress={() => router.push('/(tabs)/search')}
            accessibilityLabel="Rechercher un prestataire"
          >
            <Text style={styles.searchBtnText}>🔍  Chercher maintenant</Text>
          </TouchableOpacity>
        </View>

        {/* Catégories */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Nos services</Text>
          <View style={styles.grid}>
            {CATEGORIES.map((cat) => (
              <TouchableOpacity
                key={cat.slug}
                style={styles.catCard}
                onPress={() => router.push(`/(tabs)/search?category=${cat.slug}` as never)}
                accessibilityLabel={`Chercher un ${cat.label}`}
              >
                <Text style={styles.catEmoji}>{cat.emoji}</Text>
                <Text style={styles.catLabel}>{cat.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* CTA Prestataire */}
        <View style={styles.ctaBox}>
          <Text style={styles.ctaTitle}>Vous êtes prestataire ?</Text>
          <Text style={styles.ctaDesc}>Rejoignez BLA gratuitement</Text>
          <TouchableOpacity
            style={styles.ctaBtn}
            onPress={() => router.push('/(auth)/register?role=provider' as never)}
          >
            <Text style={styles.ctaBtnText}>Rejoindre BLA</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:  { flex: 1, backgroundColor: '#f9fafb' },
  scroll:     { paddingBottom: 24 },
  hero:       { backgroundColor: '#16a34a', padding: 24, paddingTop: 32 },
  heroTitle:  { fontSize: 26, fontWeight: '800', color: '#fff', marginBottom: 8 },
  heroSubtitle:{ fontSize: 14, color: '#bbf7d0', marginBottom: 16, lineHeight: 20 },
  searchBtn:  { backgroundColor: '#fff', borderRadius: 12, padding: 14, alignItems: 'center' },
  searchBtnText:{ fontSize: 16, fontWeight: '600', color: '#16a34a' },
  section:    { padding: 16 },
  sectionTitle:{ fontSize: 18, fontWeight: '700', color: '#111827', marginBottom: 12 },
  grid:       { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  catCard:    { width: '47%', backgroundColor: '#fff', borderRadius: 12, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: '#e5e7eb' },
  catEmoji:   { fontSize: 32, marginBottom: 6 },
  catLabel:   { fontSize: 13, fontWeight: '600', color: '#374151', textAlign: 'center' },
  ctaBox:     { margin: 16, backgroundColor: '#f0fdf4', borderRadius: 16, padding: 20, borderWidth: 1, borderColor: '#bbf7d0' },
  ctaTitle:   { fontSize: 18, fontWeight: '700', color: '#15803d', marginBottom: 4 },
  ctaDesc:    { fontSize: 13, color: '#166534', marginBottom: 14 },
  ctaBtn:     { backgroundColor: '#16a34a', borderRadius: 10, padding: 12, alignItems: 'center' },
  ctaBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
