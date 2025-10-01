import ProductGallery from '../ProductGallery';

export default function ProductGalleryExample() {
  const images = [
    'https://images.unsplash.com/photo-1589881133595-39464f7aa2e4?w=800&h=800&fit=crop',
    'https://images.unsplash.com/photo-1452195100486-9cc805987862?w=800&h=800&fit=crop',
    'https://images.unsplash.com/photo-1486297678162-eb2a19b0a32d?w=800&h=800&fit=crop',
  ];

  return <ProductGallery images={images} />;
}
