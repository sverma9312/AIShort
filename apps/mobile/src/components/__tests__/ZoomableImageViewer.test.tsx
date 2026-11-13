import { render } from '@testing-library/react-native';
import { ZoomableImageViewer } from '../ZoomableImageViewer';

describe('ZoomableImageViewer', () => {
  it('renders image successfully', async () => {
    const { getByTestId } = await render(
      <ZoomableImageViewer imageUrl="https://example.com/image.png" />
    );
    expect(getByTestId('zoomable-image-container')).toBeTruthy();
  });
});

