import React from 'react';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react-native';
import { FeedbackModal } from '../FeedbackModal';
import { Linking } from 'react-native';
import { config } from '@/lib/config';

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 40, bottom: 20, left: 0, right: 0 }),
}));

describe('FeedbackModal', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    global.fetch = originalFetch;
  });

  it('submits feedback directly in-app without opening mail app and renders success state', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, id: 'fb_123', delivered: true }),
    });
    global.fetch = mockFetch;
    const linkingSpy = jest.spyOn(Linking, 'openURL').mockResolvedValue(true as never);

    const { getByTestId } = await render(<FeedbackModal visible={true} onClose={jest.fn()} />);

    const subjectInput = getByTestId('feedback-subject-input');
    const messageInput = getByTestId('feedback-message-input');
    const emailInput = getByTestId('feedback-email-input');

    await act(async () => {
      subjectInput.props.onChangeText('Feature Idea');
      messageInput.props.onChangeText('Make dark mode default');
      emailInput.props.onChangeText('user@example.com');
    });

    const submitBtn = getByTestId('feedback-submit-button');
    fireEvent.press(submitBtn);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    const [calledUrl, calledOptions] = mockFetch.mock.calls[0];
    expect(calledUrl).toBe(config.feedbackApiUrl);
    expect(calledOptions.method).toBe('POST');
    const body = JSON.parse(calledOptions.body);
    expect(body.subject).toBe('Feature Idea');
    expect(body.message).toBe('Make dark mode default');
    expect(body.userEmail).toBe('user@example.com');
    expect(body.appName).toBe('AIShort');

    // External email apps should never be opened
    expect(linkingSpy).not.toHaveBeenCalled();
    // In-app success screen rendered
    expect(getByTestId('feedback-modal-success')).toBeTruthy();
  });

  it('displays error banner if API returns failure and allows voluntary mail fallback', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: 'Service temporarily unavailable' }),
    });
    global.fetch = mockFetch;
    const linkingSpy = jest.spyOn(Linking, 'openURL').mockResolvedValue(true as never);

    const { getByTestId } = await render(<FeedbackModal visible={true} onClose={jest.fn()} />);

    const subjectInput = getByTestId('feedback-subject-input');
    const messageInput = getByTestId('feedback-message-input');

    await act(async () => {
      subjectInput.props.onChangeText('App crash');
      messageInput.props.onChangeText('Crash on startup');
    });

    const submitBtn = getByTestId('feedback-submit-button');
    fireEvent.press(submitBtn);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(getByTestId('feedback-error-banner')).toBeTruthy();
    });

    const fallbackBtn = getByTestId('feedback-mail-fallback');
    fireEvent.press(fallbackBtn);
    expect(linkingSpy).toHaveBeenCalledTimes(1);
  });
});
