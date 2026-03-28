import { View, Text, StyleSheet } from 'react-native';
export default function verifyotp() {
  return <View style={s.c}><Text style={s.t}>verify-otp</Text></View>;
}
const s = StyleSheet.create({ c:{flex:1,alignItems:'center',justifyContent:'center',backgroundColor:'#f9fafb'}, t:{fontSize:22,fontWeight:'700'} });
