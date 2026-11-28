import { act, render } from '@testing-library/react-native';
import { Toast } from '../Toast';

describe('Toast', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders nothing when message is null', async () => {
    const { queryByTestId } = await render(<Toast message={null} onDismiss={jest.fn()} />);
    expect(queryByTestId('toast')).toBeNull();
  });

  it('renders message and calls onDismiss after duration', async () => {
    const onDismiss = jest.fn();
    const { getByTestId, getByText } = await render(
      <Toast message="Up to date" onDismiss={onDismiss} durationMs={2000} />,
    );

    expect(getByTestId('toast')).toBeTruthy();
    expect(getByText('Up to date')).toBeTruthy();

    await act(() => {
      jest.advanceTimersByTime(2500);
    });

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('does not reset timer or restart animation when re-rendered with a new onDismiss reference', async () => {
    const onDismiss1 = jest.fn();
    const onDismiss2 = jest.fn();
    const { rerender } = await render(
      <Toast message="Up to date" onDismiss={onDismiss1} durationMs={2000} />,
    );

    // Advance 1500ms (500ms left before dismiss)
    await act(() => {
      jest.advanceTimersByTime(1500);
    });
    expect(onDismiss1).not.toHaveBeenCalled();

    // Re-render (simulating parent re-render on card swipe with a new inline function)
    await rerender(<Toast message="Up to date" onDismiss={onDismiss2} durationMs={2000} />);

    // Advance remaining 600ms (total 2100ms > original 2000ms duration)
    await act(() => {
      jest.advanceTimersByTime(600);
    });

    // It should have dismissed after the original duration expired, without resetting
    expect(onDismiss2).toHaveBeenCalledTimes(1);
  });
});
