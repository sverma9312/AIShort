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

    act(() => {
      jest.advanceTimersByTime(2500);
    });

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});


