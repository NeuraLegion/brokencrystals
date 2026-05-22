import { Product } from '../model/product.entity';

export const RECOMMENDATIONS_SORT_FIELD_MAP: Record<string, keyof Product> = {
  views_count: 'viewsCount',
  created_at: 'createdAt',
  name: 'name'
};

export const RECOMMENDATIONS_ALLOWED_SORT_FIELDS = new Set(
  Object.keys(RECOMMENDATIONS_SORT_FIELD_MAP)
);

export const RECOMMENDATIONS_ALLOWED_DIRECTIONS = new Set(['asc', 'desc']);
