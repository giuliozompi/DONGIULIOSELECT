import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FavoriteButton } from './FavoriteButton';

interface ProductGalleryProps {
  images: string[];
  productId?: string;
}

export default function ProductGallery({ images, productId }: ProductGalleryProps) {
  const [currentIndex, setCurrentIndex] = useState(0);

  // Auto slideshow for multiple images
  useEffect(() => {
    if (images.length <= 1) return;
    
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev === images.length - 1 ? 0 : prev + 1));
    }, 5000); // 5 seconds
    
    return () => clearInterval(interval);
  }, [images.length]);

  const goToPrevious = () => {
    setCurrentIndex((prev) => (prev === 0 ? images.length - 1 : prev - 1));
  };

  const goToNext = () => {
    setCurrentIndex((prev) => (prev === images.length - 1 ? 0 : prev + 1));
  };

  return (
    <div className="relative w-full aspect-square bg-muted overflow-hidden" data-testid="gallery-product">
      {images.map((img, index) => (
        <img
          key={index}
          src={img}
          alt={`Фото ${index + 1}`}
          className={`w-full h-full object-cover absolute inset-0 transition-opacity duration-1000 ${
            index === currentIndex ? 'opacity-100' : 'opacity-0'
          }`}
          data-testid={`img-gallery-${index}`}
        />
      ))}
      
      {productId && (
        <div className="absolute top-4 right-4 z-10">
          <FavoriteButton productId={productId} />
        </div>
      )}
      
      {images.length > 1 && (
        <>
          <Button
            size="icon"
            variant="secondary"
            className="absolute left-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full"
            onClick={goToPrevious}
            data-testid="button-gallery-prev"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="secondary"
            className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full"
            onClick={goToNext}
            data-testid="button-gallery-next"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
            {images.map((_, index) => (
              <button
                key={index}
                className={`w-2 h-2 rounded-full transition-all ${
                  index === currentIndex
                    ? 'bg-white w-6'
                    : 'bg-white/50'
                }`}
                onClick={() => setCurrentIndex(index)}
                data-testid={`button-indicator-${index}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
