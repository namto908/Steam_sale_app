import { Text, View } from "react-native";

export default function ProfileTab() {
  return (
    <View
      style={{
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: "#2C2C2E",
      }}
    >
      <Text style={{ fontSize: 24, fontWeight: 'bold', color: '#FFFFFF' }}>Hồ sơ</Text>
      <Text style={{ fontSize: 16, marginTop: 20, color: '#CCCCCC' }}>
        Sẽ phát triển sau đừng hỏi nhiều
      </Text>
    </View>
  );
}