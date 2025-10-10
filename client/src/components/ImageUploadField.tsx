import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Upload, X } from 'lucide-react';
import { getAbsoluteImageUrl } from '@/lib/imageUtils';

interface ImageUploadFieldProps {
  value: string | null;
  onChange: (value: string | null) => void;
  onUploadStart?: () => void;
  onUploadComplete?: (path: string) => void;
  onUploadError?: (error: string) => void;
  maxSizeMB?: number;
  className?: string;
  'data-testid'?: string;
}

export function ImageUploadField({
  value,
  onChange,
  onUploadStart,
  onUploadComplete,
  onUploadError,
  maxSizeMB = 5,
  className = '',
  'data-testid': testId,
}: ImageUploadFieldProps) {
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (value) {
      setPreviewUrl(getAbsoluteImageUrl(value) || value);
    } else {
      setPreviewUrl(null);
    }
  }, [value]);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validazione dimensione
    const maxBytes = maxSizeMB * 1024 * 1024;
    if (file.size > maxBytes) {
      onUploadError?.(`File troppo grande. Max ${maxSizeMB}MB`);
      return;
    }

    // Validazione tipo
    if (!file.type.startsWith('image/')) {
      onUploadError?.('Solo immagini permesse');
      return;
    }

    try {
      setUploading(true);
      onUploadStart?.();

      // Crea FormData
      const formData = new FormData();
      formData.append('image', file);

      // Upload al server
      const response = await fetch('/api/admin/uploads/image', {
        method: 'POST',
        body: formData,
        credentials: 'include',
        headers: {
          'x-telegram-init-data': localStorage.getItem('telegram-init-data') || '',
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Upload fallito');
      }

      const data = await response.json();
      onChange(data.path);
      onUploadComplete?.(data.path);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Errore upload';
      onUploadError?.(message);
    } finally {
      setUploading(false);
      // Reset input
      event.target.value = '';
    }
  };

  const handleClear = () => {
    onChange(null);
    setPreviewUrl(null);
  };

  return (
    <div className={`space-y-3 ${className}`}>
      <div className="flex items-center gap-2">
        <Input
          type="file"
          accept="image/*"
          onChange={handleFileSelect}
          disabled={uploading}
          className="hidden"
          id={`image-upload-${testId || 'field'}`}
          data-testid={`${testId}-input`}
        />
        <label htmlFor={`image-upload-${testId || 'field'}`} className="flex-1">
          <Button
            type="button"
            variant="outline"
            disabled={uploading}
            className="w-full"
            asChild
          >
            <span>
              <Upload className="w-4 h-4 mr-2" />
              {uploading ? 'Загрузка...' : 'Выбрать файл'}
            </span>
          </Button>
        </label>
        {previewUrl && (
          <Button
            type="button"
            variant="destructive"
            size="icon"
            onClick={handleClear}
            disabled={uploading}
            data-testid={`${testId}-clear`}
          >
            <X className="w-4 h-4" />
          </Button>
        )}
      </div>

      {previewUrl && (
        <div className="relative inline-block">
          <img
            src={previewUrl}
            alt="Preview"
            className="w-32 h-32 object-cover rounded-md border-2"
            data-testid={`${testId}-preview`}
          />
        </div>
      )}
    </div>
  );
}
