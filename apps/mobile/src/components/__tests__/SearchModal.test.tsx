import type { Card } from '@aishort/shared';
import { act, fireEvent, render } from '@testing-library/react-native';
import React from 'react';
import { SearchModal } from '../SearchModal';

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 40, bottom: 20, left: 0, right: 0 }),
}));

const mockCards: Card[] = [
  {
    id: 'c_chatgpt_1',
    headline: 'ChatGPT adds new canvas features for coding',
    summary: 'OpenAI rolled out canvas workspace in ChatGPT for collaborative coding.',
    category: 'products',
    importance: 9,
    sourceName: 'OpenAI Blog',
    sourceUrl: 'https://openai.com/blog/canvas',
    imageUrl: 'https://example.com/chatgpt.jpg',
    publishedAt: new Date(Date.now() - 3600 * 1000).toISOString(),
  },
  {
    id: 'c_claude_2',
    headline: 'Anthropic announces Claude 3.5 Sonnet computer use',
    summary: 'Claude can now interact with desktop applications via API.',
    category: 'models',
    importance: 8,
    sourceName: 'TechCrunch',
    sourceUrl: 'https://techcrunch.com/claude',
    imageUrl: null,
    publishedAt: new Date(Date.now() - 7200 * 1000).toISOString(),
  },
  {
    id: 'c_robotics_3',
    headline: 'Figure 02 humanoid robot enters production trials',
    summary: 'Autonomous humanoid robots operating on factory floors.',
    category: 'research',
    importance: 7,
    sourceName: 'Ars Technica',
    sourceUrl: 'https://arstechnica.com/robotics',
    imageUrl: null,
    publishedAt: new Date(Date.now() - 86400 * 1000).toISOString(),
  },
];

describe('SearchModal', () => {
  it('filters stories based on search query and selects card on press', async () => {
    const onSelectCard = jest.fn();
    const onClose = jest.fn();

    const { getByTestId, getByText, queryByText } = await render(
      <SearchModal
        visible={true}
        onClose={onClose}
        cards={mockCards}
        onSelectCard={onSelectCard}
      />,
    );

    const input = getByTestId('search-input');
    await act(async () => {
      input.props.onChangeText('chatgpt');
    });

    // Should match ChatGPT card
    expect(getByText(/1 result/i)).toBeTruthy();
    expect(getByTestId('search-result-c_chatgpt_1')).toBeTruthy();
    expect(queryByText(/Claude 3.5 Sonnet/i)).toBeNull();

    // Tap result
    const resultItem = getByTestId('search-result-c_chatgpt_1');
    fireEvent.press(resultItem);

    expect(onSelectCard).toHaveBeenCalledWith(mockCards[0]);
    expect(onClose).toHaveBeenCalled();
  });

  it('filters stories when tapping a suggested topic chip', async () => {
    const onSelectCard = jest.fn();
    const onClose = jest.fn();

    const { getByText, getByTestId } = await render(
      <SearchModal
        visible={true}
        onClose={onClose}
        cards={mockCards}
        onSelectCard={onSelectCard}
      />,
    );

    const roboticsChip = getByText('Robotics');
    await act(async () => {
      fireEvent.press(roboticsChip);
    });

    expect(getByTestId('search-result-c_robotics_3')).toBeTruthy();
    expect(getByText(/1 result/i)).toBeTruthy();
  });

  it('displays empty state when query matches no stories', async () => {
    const { getByTestId, getByText } = await render(
      <SearchModal visible={true} onClose={jest.fn()} cards={mockCards} onSelectCard={jest.fn()} />,
    );

    const input = getByTestId('search-input');
    await act(async () => {
      input.props.onChangeText('nonexistenttopic12345');
    });

    expect(getByText('No stories found')).toBeTruthy();
  });
});
