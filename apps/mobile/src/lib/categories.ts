import { CATEGORIES, type Category } from '@aishort/shared';

export const CATEGORY_LABELS: Record<Category, string> = {
  models: 'Models',
  research: 'Research',
  products: 'Products',
  business: 'Business',
  policy: 'Policy',
  'open-source': 'Open source',
};

export const ALL_CATEGORIES: readonly Category[] = CATEGORIES;
