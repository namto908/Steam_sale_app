import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import React, { useCallback, useMemo } from 'react';
import { Dimensions, Text, TouchableOpacity, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming
} from 'react-native-reanimated';



// Pre-define styles for better performance
const containerStyle = {
  backgroundColor:  '#1C1C1E', // Dark background like in the image
  paddingTop: 16,
  paddingBottom: 16,
  paddingHorizontal: 16,
  height: 80,
  position: 'absolute' as const,
  bottom: 16, // Add margin from bottom
  left: 16,
  right: 16,
  flexDirection: 'row' as const,
  justifyContent: 'space-around' as const,
  alignItems: 'center' as const,
  borderRadius: 30, // Large border radius like in the image
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.3,
  shadowRadius: 8,
  elevation: 10,
};

const ovalStyle = {
  position: 'absolute' as const,
  backgroundColor: '#5A7BFF', // Lighter blue for active state
  borderRadius: 22,
  width: 80,
  height: 50,
  top: 16,
  left: 16,
};

// Memoized styles for tab items
const tabItemContainerStyle = {
  flex: 1,
  alignItems: 'center' as const,
  height: 90, // Đảm bảo chiếm toàn bộ chiều cao của tab bar
  justifyContent: 'center' as const,
  paddingHorizontal: 5, // Thêm padding để mở rộng vùng chạm
};

const tabItemInnerStyle = {
  flexDirection: 'row' as const,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
  paddingHorizontal: 10,
  paddingVertical: 6,
  minHeight: 50,
};

const tabLabelStyle = {
  color: 'white',
  marginLeft: 6,
  fontSize: 12,
  fontWeight: '600' as const,
};

// Move tabs configuration outside component to avoid recreation
const tabsConfig = [
  { name: 'index', icon: 'home', iconOutline: 'home-outline', label: 'Home' },
  { name: 'search', icon: 'search', iconOutline: 'search-outline', label: 'Search' },
  { name: 'profile', icon: 'person', iconOutline: 'person-outline', label: 'Profile' },
] as const;

const CustomTabBar = React.memo(({ state, descriptors, navigation }: any) => {
  // Memoize dimensions and calculations to avoid recalculating on every render
  const { screenWidth, ovalWidth, tabSpacing, startOffset } = useMemo(() => {
    const width = Dimensions.get('window').width;
    const oval = 80;
    const containerPadding = 64; // Updated: 32px margin on each side (16px container margin + 16px padding)
    const availableWidth = width - containerPadding;
    const spacing = availableWidth / 3; // Space for each tab
    const offset = (spacing - oval) / 2; // Offset để oval center trong tab
    
    return {
      screenWidth: width,
      ovalWidth: oval,
      tabSpacing: spacing,
      startOffset: offset
    };
  }, []);
  
  const translateX = useSharedValue(startOffset);
  
  React.useEffect(() => {
    translateX.value = withTiming(startOffset + (state.index * tabSpacing), { 
      duration: 200, // Giảm duration xuống để responsive hơn
      easing: Easing.out(Easing.quad) // Sử dụng easing nhẹ hơn
    });
  }, [state.index, startOffset, tabSpacing, translateX]);

  const slidingStyle = useAnimatedStyle(() => {
    'worklet';
    return {
      transform: [{ translateX: translateX.value }],
    };
  }, [translateX]);

  // Memoized press handler
  const createPressHandler = useCallback((tabName: string, tabIndex: number) => () => {
    const event = navigation.emit({
      type: 'tabPress',
      target: state.routes[tabIndex].key,
      canPreventDefault: true,
    });

    if (state.index !== tabIndex && !event.defaultPrevented) {
      navigation.navigate(tabName);
    }
  }, [navigation, state.routes, state.index]);



  return (
    <View style={containerStyle}>
      {/* Sliding Oval Background */}
      <Animated.View
        style={[ovalStyle, slidingStyle]}
      />

      {/* Tab Items */}
      {tabsConfig.map((tab, index) => {
        const isFocused = state.index === index;
        const onPress = createPressHandler(tab.name, index);

        return (
          <TouchableOpacity
            key={tab.name} 
            style={tabItemContainerStyle}
            onPress={onPress}
            activeOpacity={0.7}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <View
              style={[
                tabItemInnerStyle,
                { minWidth: ovalWidth }
              ]}
            >
              <Ionicons
                name={isFocused ? tab.icon as any : tab.iconOutline as any}
                size={24}
                color={isFocused ? 'white' : 'rgba(255, 255, 255, 0.6)'}
              />
              {isFocused && (
                <Text
                  style={tabLabelStyle}
                  numberOfLines={1}
                >
                  {tab.label}
                </Text>
              )}
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
});

export default function TabLayout() {
  return (
    <Tabs
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{
        headerStyle: {
          backgroundColor: '#1C1C1E',
        },
        headerTintColor: '#FFFFFF',
      }}>
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="search" options={{ title: 'Search' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
    </Tabs>
  );
}