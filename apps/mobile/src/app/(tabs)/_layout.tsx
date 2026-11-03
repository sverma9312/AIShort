import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import type { ComponentProps, ReactNode } from 'react';
import { useEffect, useRef } from 'react';
import {
  Animated,
  type ColorValue,
  Pressable,
  type PressableProps,
  type StyleProp,
  StyleSheet,
  type ViewStyle,
} from 'react-native';
import { useTheme } from '@/lib/theme';

interface TabBarButtonProps extends Omit<PressableProps, 'children' | 'style'> {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
}

interface AnimatedTabIconProps {
  name: ComponentProps<typeof Ionicons>['name'];
  activeName: ComponentProps<typeof Ionicons>['name'];
  focused: boolean;
  color: ColorValue;
  size: number;
}

function AnimatedTabIcon({ name, activeName, focused, color, size }: AnimatedTabIconProps) {
  const theme = useTheme();
  const scale = useRef(new Animated.Value(focused ? 1 : 0.85)).current;
  const pillOpacity = useRef(new Animated.Value(focused ? 1 : 0)).current;

  useEffect(() => {
    if (focused) {
      Animated.parallel([
        Animated.spring(scale, {
          toValue: 1,
          friction: 4,
          tension: 140,
          useNativeDriver: true,
        }),
        Animated.timing(pillOpacity, {
          toValue: 1,
          duration: 180,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(scale, {
          toValue: 0.9,
          duration: 140,
          useNativeDriver: true,
        }),
        Animated.timing(pillOpacity, {
          toValue: 0,
          duration: 140,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [focused, scale, pillOpacity]);

  return (
    <Animated.View style={[styles.iconContainer, { transform: [{ scale }] }]}>
      <Animated.View
        style={[
          styles.highlightPill,
          {
            opacity: pillOpacity,
            backgroundColor: theme.dark ? 'rgba(99, 102, 241, 0.22)' : 'rgba(99, 102, 241, 0.12)',
          },
        ]}
      />
      <Ionicons name={focused ? activeName : name} color={color as string} size={size} />
    </Animated.View>
  );
}

function TabBarButton(props: TabBarButtonProps) {
  const pressScale = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(pressScale, {
      toValue: 0.9,
      speed: 40,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(pressScale, {
      toValue: 1,
      friction: 4,
      tension: 120,
      useNativeDriver: true,
    }).start();
  };

  const { style, children, onPressIn, onPressOut, ...rest } = props;

  return (
    <Pressable
      {...rest}
      onPressIn={(e) => {
        handlePressIn();
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        handlePressOut();
        onPressOut?.(e);
      }}
      style={[style, { flex: 1 }]}
    >
      <Animated.View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          transform: [{ scale: pressScale }],
        }}
      >
        {children}
      </Animated.View>
    </Pressable>
  );
}

export default function TabsLayout() {
  const theme = useTheme();
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: theme.accent,
        tabBarInactiveTintColor: theme.muted,
        tabBarStyle: {
          backgroundColor: theme.card,
          borderTopColor: theme.border,
          height: 58,
          paddingBottom: 6,
          paddingTop: 6,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
        },
        tabBarButton: (props) => <TabBarButton {...props} />,
        headerStyle: { backgroundColor: theme.card },
        headerTintColor: theme.text,
        sceneStyle: { backgroundColor: theme.background },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Feed',
          headerShown: false,
          tabBarIcon: ({ focused, color, size }) => (
            <AnimatedTabIcon
              name="flash-outline"
              activeName="flash"
              focused={focused}
              color={color}
              size={size}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="bookmarks"
        options={{
          title: 'Saved',
          tabBarIcon: ({ focused, color, size }) => (
            <AnimatedTabIcon
              name="bookmark-outline"
              activeName="bookmark"
              focused={focused}
              color={color}
              size={size}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ focused, color, size }) => (
            <AnimatedTabIcon
              name="settings-outline"
              activeName="settings"
              focused={focused}
              color={color}
              size={size}
            />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  iconContainer: {
    width: 48,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  highlightPill: {
    position: 'absolute',
    width: 46,
    height: 28,
    borderRadius: 14,
  },
});
