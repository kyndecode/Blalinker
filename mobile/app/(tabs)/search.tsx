import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
export default function SearchScreen() {
  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <View style={s.center}>
        <Text style={s.title}>Search</Text>
      </View>
    </SafeAreaView>
  );
}
const s = StyleSheet.create({ container:{flex:1,backgroundColor:'#f9fafb'}, center:{flex:1,alignItems:'center',justifyContent:'center'}, title:{fontSize:22,fontWeight:'700',color:'#374151'} });
