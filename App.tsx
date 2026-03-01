import React from 'react';
import {
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from 'react-native';

function App(): React.JSX.Element {
  const isDarkMode = useColorScheme() === 'dark';

  const backgroundStyle = {
    backgroundColor: isDarkMode ? '#1a1a1a' : '#f5f5f5',
    flex: 1,
  };

  return (
    <SafeAreaView style={backgroundStyle}>
      <StatusBar
        barStyle={isDarkMode ? 'light-content' : 'dark-content'}
        backgroundColor={backgroundStyle.backgroundColor}
      />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        style={backgroundStyle}>
        <View style={styles.container}>
          <Text style={[styles.title, isDarkMode && styles.textLight]}>
            membran
          </Text>
          <Text style={[styles.subtitle, isDarkMode && styles.textLight]}>
            layer I
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
    gap: 12,
  },
  title: {
    fontSize: 48,
    fontWeight: '200',
    letterSpacing: 8,
    color: '#111',
  },
  subtitle: {
    fontSize: 14,
    fontWeight: '400',
    letterSpacing: 4,
    color: '#888',
    textTransform: 'uppercase',
  },
  textLight: {
    color: '#eee',
  },
});

export default App;
