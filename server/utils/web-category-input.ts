import { z } from 'zod';

const categoryFields = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  image: z.string().nullable().optional(),
  // Accept older clients, but only write the real database column: image.
  imageUrl: z.string().nullable().optional(),
  parentId: z.string().nullable().optional(),
  sortOrder: z.number().int().optional(),
  isVisible: z.boolean().optional(),
});

function normalizeImage<T extends { image?: string | null; imageUrl?: string | null }>(body: T) {
  const { imageUrl, ...fields } = body;
  return {
    ...fields,
    ...(body.image === undefined && imageUrl !== undefined ? { image: imageUrl } : {}),
  };
}

export const createWebCategorySchema = categoryFields.transform(normalizeImage);
export const updateWebCategorySchema = categoryFields.partial().transform(normalizeImage);
