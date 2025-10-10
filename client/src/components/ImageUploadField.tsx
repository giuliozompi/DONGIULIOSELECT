import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
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
  const [uploadProgress, setUploadProgress] = useState(0);
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
      setUploadProgress(1); // Inizia a 1% per mostrare subito la barra
      onUploadStart?.();

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        
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

        // Upload al server con progresso
        const data = await new Promise<{ path: string }>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          
          // Traccia progresso
          xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable) {
              const fileProgress = (e.loaded / e.total) * 100;
              const totalProgress = ((i + fileProgress / 100) / files.length) * 100;
              setUploadProgress(Math.min(99, Math.round(totalProgress))); // Max 99% durante upload
            } else {
              // Fallback per connessioni lente senza lengthComputable
              const estimatedProgress = ((i + 0.5) / files.length) * 100;
              setUploadProgress(Math.round(estimatedProgress));
            }
          });
          
          xhr.addEventListener('load', () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              try {
                const response = JSON.parse(xhr.responseText);
                // Mostra 100% SOLO dopo successo
                const completedProgress = ((i + 1) / files.length) * 100;
                setUploadProgress(Math.round(completedProgress));
                resolve(response);
              } catch (error) {
                reject(new Error('Risposta server non valida'));
              }
            } else {
              try {
                const error = JSON.parse(xhr.responseText);
                reject(new Error(error.error || 'Upload fallito'));
              } catch {
                reject(new Error(`Upload fallito: ${xhr.status}`));
              }
            }
          });
          
          xhr.addEventListener('error', () => {
            reject(new Error('Errore di rete'));
          });
          
          xhr.open('POST', '/api/admin/uploads/image');
          xhr.setRequestHeader('x-telegram-init-data', localStorage.getItem('telegram-init-data') || '');
          xhr.withCredentials = true;
          xhr.send(formData);
        });

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
      
      // Reset solo dopo successo completo
      setUploading(false);
      setUploadProgress(0);
      event.target.value = '';
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Errore upload';
      onUploadError?.(message);
      // In caso di errore, mantieni uploading=false ma NON resettare uploadProgress
      // così la barra resta visibile all'ultimo valore
      setUploading(false);
      event.target.value = '';
    }
  };

  const handleRemove = async (index: number) => {
    if (!value) return;
    const paths = value.split(',').map(p => p.trim()).filter(Boolean);
    const pathToDelete = paths[index];
    
    // Cancella dal server prima di aggiornare lo stato
    if (pathToDelete) {
      try {
        setUploading(true);
        const response = await fetch('/api/admin/uploads/image', {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            'x-telegram-init-data': localStorage.getItem('telegram-init-data') || '',
          },
          credentials: 'include',
          body: JSON.stringify({ path: pathToDelete }),
        });

        if (!response.ok) {
          const error = await response.json().catch(() => ({ error: 'Errore eliminazione' }));
          throw new Error(error.error || 'Errore eliminazione server');
        }
        
        // Solo dopo successo, rimuovi dalla UI
        paths.splice(index, 1);
        onChange(paths.length > 0 ? paths.join(', ') : null);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Errore eliminazione';
        console.error('Delete error:', error);
        onUploadError?.(message);
      } finally {
        setUploading(false);
      }
    }
  };

  const handleClear = async () => {
    if (!value) return;
    
    const paths = value.split(',').map(p => p.trim()).filter(Boolean);
    if (paths.length === 0) {
      onChange(null);
      setPreviewUrls([]);
      return;
    }

    try {
      setUploading(true);
      
      // Traccia successi e fallimenti separatamente
      const results = await Promise.allSettled(
        paths.map(async (path) => {
          const response = await fetch('/api/admin/uploads/image', {
            method: 'DELETE',
            headers: {
              'Content-Type': 'application/json',
              'x-telegram-init-data': localStorage.getItem('telegram-init-data') || '',
            },
            credentials: 'include',
            body: JSON.stringify({ path }),
          });
          
          if (!response.ok) {
            const error = await response.json().catch(() => ({ error: 'Errore eliminazione' }));
            throw new Error(error.error || 'Errore eliminazione');
          }
          
          return path;
        })
      );
      
      // Identifica successi e fallimenti
      const deletedPaths = new Set<string>();
      const failedPaths: string[] = [];
      
      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          deletedPaths.add(result.value);
        } else {
          failedPaths.push(paths[index]);
        }
      });
      
      // Aggiorna stato rimuovendo solo i path cancellati con successo
      const remainingPaths = paths.filter(p => !deletedPaths.has(p));
      onChange(remainingPaths.length > 0 ? remainingPaths.join(', ') : null);
      
      // Riporta errori solo se ci sono stati fallimenti
      if (failedPaths.length > 0) {
        const errorMsg = `Errore eliminazione: ${failedPaths.length} file non rimossi (${deletedPaths.size} rimossi con successo)`;
        onUploadError?.(errorMsg);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Errore eliminazione file';
      console.error('Delete error:', error);
      onUploadError?.(message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className={`space-y-3 ${className}`}>
      <div className="space-y-2">
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
        
        {(uploading || uploadProgress > 0) && (
          <div className="space-y-1">
            <Progress value={uploadProgress} className="h-2" data-testid={`${testId}-progress`} />
            <p className="text-xs text-muted-foreground text-center">
              {uploadProgress}% {!uploading && uploadProgress > 0 && uploadProgress < 100 && '(interrotto)'}
            </p>
          </div>
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
