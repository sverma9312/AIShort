import { Image } from 'expo-image';
import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  PanResponder,
  StyleSheet,
  View,
  type LayoutChangeEvent,
} from 'react-native';

interface ZoomableImageViewerProps {
  imageUrl: string;
}

function getDistance(
  t0: { pageX: number; pageY: number },
  t1: { pageX: number; pageY: number }
): number {
  const dx = t1.pageX - t0.pageX;
  const dy = t1.pageY - t0.pageY;
  return Math.sqrt(dx * dx + dy * dy);
}

export function ZoomableImageViewer({ imageUrl }: ZoomableImageViewerProps) {
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

  const pan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const scale = useRef(new Animated.Value(1)).current;

  const currentScale = useRef(1);
  const lastScale = useRef(1);
  const currentPan = useRef({ x: 0, y: 0 });
  const lastPan = useRef({ x: 0, y: 0 });
  const initialDistance = useRef(0);
  const prevTouchCount = useRef(0);
  const lastTapTime = useRef(0);

  const resetZoom = (animated = true) => {
    if (animated) {
      Animated.parallel([
        Animated.spring(scale, {
          toValue: 1,
          useNativeDriver: true,
          friction: 7,
          tension: 40,
        }),
        Animated.spring(pan, {
          toValue: { x: 0, y: 0 },
          useNativeDriver: true,
          friction: 7,
          tension: 40,
        }),
      ]).start(() => {
        currentScale.current = 1;
        lastScale.current = 1;
        currentPan.current = { x: 0, y: 0 };
        lastPan.current = { x: 0, y: 0 };
      });
    } else {
      scale.setValue(1);
      pan.setValue({ x: 0, y: 0 });
      currentScale.current = 1;
      lastScale.current = 1;
      currentPan.current = { x: 0, y: 0 };
      lastPan.current = { x: 0, y: 0 };
    }
  };

  const handleDoubleTap = () => {
    if (currentScale.current > 1.2) {
      resetZoom(true);
    } else {
      Animated.parallel([
        Animated.spring(scale, {
          toValue: 2.5,
          useNativeDriver: true,
          friction: 7,
          tension: 40,
        }),
        Animated.spring(pan, {
          toValue: { x: 0, y: 0 },
          useNativeDriver: true,
          friction: 7,
          tension: 40,
        }),
      ]).start(() => {
        currentScale.current = 2.5;
        lastScale.current = 2.5;
        currentPan.current = { x: 0, y: 0 };
        lastPan.current = { x: 0, y: 0 };
      });
    }
  };

  useEffect(() => {
    resetZoom(false);
  }, [imageUrl]);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setContainerSize({ width, height });
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return gestureState.numberActiveTouches === 2 || currentScale.current > 1.05;
      },
      onPanResponderGrant: (evt) => {
        const touches = evt.nativeEvent.touches;
        prevTouchCount.current = touches.length;

        if (touches.length >= 2 && touches[0] && touches[1]) {
          initialDistance.current = getDistance(touches[0], touches[1]);
          lastScale.current = currentScale.current;
        } else if (touches.length === 1) {
          const now = Date.now();
          if (now - lastTapTime.current < 300) {
            handleDoubleTap();
            lastTapTime.current = 0;
            return;
          }
          lastTapTime.current = now;
          lastPan.current = { ...currentPan.current };
        }
      },
      onPanResponderMove: (evt, gestureState) => {
        const touches = evt.nativeEvent.touches;

        if (touches.length >= 2 && touches[0] && touches[1]) {
          const dist = getDistance(touches[0], touches[1]);

          if (prevTouchCount.current !== 2) {
            initialDistance.current = dist;
            lastScale.current = currentScale.current;
            prevTouchCount.current = 2;
            return;
          }

          if (initialDistance.current > 0) {
            const rawScale = (dist / initialDistance.current) * lastScale.current;
            const clampedScale = Math.min(Math.max(rawScale, 0.75), 5);
            scale.setValue(clampedScale);
            currentScale.current = clampedScale;
          }
        } else if (touches.length === 1) {
          if (prevTouchCount.current === 2) {
            lastPan.current = { ...currentPan.current };
            prevTouchCount.current = 1;
            return;
          }
          prevTouchCount.current = 1;

          if (currentScale.current > 1.05) {
            const newX = lastPan.current.x + gestureState.dx;
            const newY = lastPan.current.y + gestureState.dy;

            const maxPanX = Math.max(0, (containerSize.width * (currentScale.current - 1)) / 2);
            const maxPanY = Math.max(0, (containerSize.height * (currentScale.current - 1)) / 2);

            const boundedX = Math.min(Math.max(newX, -maxPanX - 40), maxPanX + 40);
            const boundedY = Math.min(Math.max(newY, -maxPanY - 40), maxPanY + 40);

            pan.setValue({ x: boundedX, y: boundedY });
            currentPan.current = { x: boundedX, y: boundedY };
          }
        }
      },
      onPanResponderRelease: () => {
        prevTouchCount.current = 0;
        initialDistance.current = 0;

        if (currentScale.current < 1) {
          resetZoom(true);
        } else if (currentScale.current > 4) {
          Animated.spring(scale, {
            toValue: 4,
            useNativeDriver: true,
            friction: 7,
          }).start(() => {
            currentScale.current = 4;
            lastScale.current = 4;
          });
        } else {
          lastScale.current = currentScale.current;

          const maxPanX = Math.max(0, (containerSize.width * (currentScale.current - 1)) / 2);
          const maxPanY = Math.max(0, (containerSize.height * (currentScale.current - 1)) / 2);

          const targetX = Math.min(Math.max(currentPan.current.x, -maxPanX), maxPanX);
          const targetY = Math.min(Math.max(currentPan.current.y, -maxPanY), maxPanY);

          if (targetX !== currentPan.current.x || targetY !== currentPan.current.y) {
            Animated.spring(pan, {
              toValue: { x: targetX, y: targetY },
              useNativeDriver: true,
              friction: 7,
            }).start(() => {
              lastPan.current = { x: targetX, y: targetY };
              currentPan.current = { x: targetX, y: targetY };
            });
          } else {
            lastPan.current = { ...currentPan.current };
          }
        }
      },
      onPanResponderTerminate: () => {
        prevTouchCount.current = 0;
        initialDistance.current = 0;
      },
    })
  ).current;

  return (
    <View
      testID="zoomable-image-container"
      style={styles.container}
      onLayout={onLayout}
      {...panResponder.panHandlers}
    >
      <Animated.View
        style={[
          styles.imageWrapper,
          {
            transform: [
              { translateX: pan.x },
              { translateY: pan.y },
              { scale },
            ],
          },
        ]}
      >
        <Image
          source={{ uri: imageUrl }}
          style={styles.image}
          contentFit="contain"
          transition={200}
          accessibilityIgnoresInvertColors
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  imageWrapper: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    width: '100%',
    height: '100%',
  },
});
