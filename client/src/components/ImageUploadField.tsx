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
  multiple?: boolean;
  maxFiles?: number;
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
  multiple = false,
  maxFiles = 5,
  className = '',
  'data-testid': testId,
}: ImageUploadFieldProps) {
  const [uploading, setUploading] = useState(false);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);

  useEffect(() => {
    if (value) {
      const paths = value.split(',').map(p => p.trim()).filter(Boolean);
      const urls = paths.map(p => getAbsoluteImageUrl(p) || p);
      setPreviewUrls(urls);
    } else {
      setPreviewUrls([]);
    }
  }, [value]);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;

    // Verifica limite file multipli
    if (multiple) {
      const currentPaths = value ? value.split(',').map(p => p.trim()).filter(Boolean) : [];
      if (currentPaths.length + files.length > maxFiles) {
        onUploadError?.(`Massimo ${maxFiles} immagini permesse`);
        return;
      }
    }

    const maxBytes = maxSizeMB * 1024 * 1024;
    const uploadedPaths: string[] = [];

    try {
      setUploading(true);
      onUploadStart?.();

      for (const file of files) {
        // Validazione dimensione
        if (file.size > maxBytes) {
          onUploadError?.(`${file.name}: troppo grande. Max ${maxSizeMB}MB`);
          continue;
        }

        // Validazione tipo
        if (!file.type.startsWith('image/')) {
          onUploadError?.(`${file.name}: solo immagini permesse`);
          continue;
        }

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
        uploadedPaths.push(data.path);
      }

      // Aggiorna valore
      if (uploadedPaths.length > 0) {
        if (multiple) {
          const currentPaths = value ? value.split(',').map(p => p.trim()).filter(Boolean) : [];
          const newPaths = [...currentPaths, ...uploadedPaths];
          onChange(newPaths.join(', '));
        } else {
          onChange(uploadedPaths[0]);
        }
        onUploadComplete?.(uploadedPaths.join(', '));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Errore upload';
      onUploadError?.(message);
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  };

  const handleRemove = (index: number) => {
    if (!value) return;
    const paths = value.split(',').map(p => p.trim()).filter(Boolean);
    paths.splice(index, 1);
    onChange(paths.length > 0 ? paths.join(', ') : null);
  };

  const handleClear = () => {
    onChange(null);
    setPreviewUrls([]);
  };

  return (
    <div className={`space-y-3 ${className}`}>
      <div className="flex items-center gap-2">
        <Input
          type="file"
          accept="image/*"
          multiple={multiple}
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
              {uploading ? 'Загрузка...' : multiple ? 'Выбрать файлы' : 'Выбрать файл'}
            </span>
          </Button>
        </label>
        {previewUrls.length > 0 && !multiple && (
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

      {previewUrls.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {previewUrls.map((url, idx) => (
            <div key={idx} className="relative inline-block">
              <img
                src={url}
                alt={`Preview ${idx + 1}`}
                className={`object-cover rounded-md border-2 ${multiple ? 'w-20 h-20' : 'w-32 h-32'}`}
                data-testid={`${testId}-preview-${idx}`}
              />
              <Button
                type="button"
                variant="destructive"
                size="icon"
                className={`absolute -top-2 -right-2 rounded-full ${multiple ? 'h-5 w-5' : 'h-6 w-6'}`}
                onClick={() => multiple ? handleRemove(idx) : handleClear()}
                disabled={uploading}
                data-testid={`${testId}-remove-${idx}`}
              >
                <X className={multiple ? 'h-3 w-3' : 'h-4 w-4'} />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
