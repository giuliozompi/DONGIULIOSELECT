import { useEffect, useRef, useState, type ClipboardEvent, type DragEvent } from 'react';
import { ImagePlus, LoaderCircle, Upload, X } from 'lucide-react';
import { adminApi } from '../lib/adminApi';

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_PHOTOS = 12;
const ACCEPTED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

type FileStatus = 'queued' | 'uploading' | 'done' | 'error';
type UploadFile = {
  id: string;
  file: File;
  status: FileStatus;
  message?: string;
};

type EditorialPhotoUploadProps = {
  photos: string[];
  sessionKey: number;
  onAppendPhotos: (paths: string[], sessionKey: number) => void;
  onRemovePhoto: (index: number, sessionKey: number) => void;
  onUploadingChange: (uploading: boolean, sessionKey: number) => boolean;
  disabled: boolean;
};

function photoType(file: File) {
  const extension = file.name.toLowerCase().split('.').pop();
  const extensions = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif']);
  return ACCEPTED_TYPES.has(file.type) || (!file.type && extensions.has(extension || ''));
}
function normalizedMime(file: File) {
  if (file.type) return file;
  const extension = file.name.toLowerCase().split('.').pop();
  const type = extension === 'png' ? 'image/png'
    : extension === 'jpg' || extension === 'jpeg' ? 'image/jpeg'
      : extension === 'webp' ? 'image/webp'
        : extension === 'gif' ? 'image/gif' : '';
  return type ? new File([file], file.name, { type, lastModified: file.lastModified }) : file;
}

export default function EditorialPhotoUpload({
  photos,
  sessionKey,
  onAppendPhotos,
  onRemovePhoto,
  onUploadingChange,
  disabled,
}: EditorialPhotoUploadProps) {
  const [dragging, setDragging] = useState(false);
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [progress, setProgress] = useState<{ complete: number; total: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const busyRef = useRef(false);
  const ownsBusyClaimRef = useRef(false);
  const mountedRef = useRef(false);
  const onUploadingChangeRef = useRef(onUploadingChange);
  onUploadingChangeRef.current = onUploadingChange;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (ownsBusyClaimRef.current) {
        busyRef.current = false;
        ownsBusyClaimRef.current = false;
        onUploadingChangeRef.current(false, sessionKey);
      }
    };
  }, [sessionKey]);

  async function importFiles(incoming: File[]) {
    if (!incoming.length) return;
    if (disabled) return;
    if (busyRef.current) {
      setFiles(current => [...current, {
        id: `busy-${Date.now()}`,
        file: incoming[0],
        status: 'error',
        message: 'Загрузка уже выполняется. Дождитесь её завершения.',
      }]);
      return;
    }

    const available = Math.max(0, MAX_PHOTOS - photos.length);
    const accepted: UploadFile[] = [];
    const rejected: UploadFile[] = [];
    incoming.forEach((file, index) => {
      const id = `${Date.now()}-${index}-${file.name}`;
      if (!photoType(file)) {
        rejected.push({ id, file, status: 'error', message: 'Формат не поддерживается. Допустимы PNG, JPEG, WebP и GIF.' });
      } else if (file.size > MAX_FILE_BYTES) {
        rejected.push({ id, file, status: 'error', message: 'Файл больше 5 МиБ. Выберите изображение меньшего размера.' });
      } else if (accepted.length >= available) {
        rejected.push({ id, file, status: 'error', message: `Можно добавить не более ${MAX_PHOTOS} фотографий к одной статье.` });
      } else {
        accepted.push({ id, file, status: 'queued' });
      }
    });
    setFiles([...rejected, ...accepted]);
    if (!accepted.length) return;

    // Claim synchronously before the first await; the editor can reject a same-tick conflict.
    if (!onUploadingChange(true, sessionKey)) {
      setFiles(current => [...current, {
        id: `locked-${Date.now()}`,
        file: accepted[0].file,
        status: 'error',
        message: 'Сначала дождитесь завершения текущего действия в редакторе.',
      }]);
      return;
    }
    ownsBusyClaimRef.current = true;
    busyRef.current = true;
    setProgress({ complete: 0, total: accepted.length });
    let complete = 0;
    try {
      for (const item of accepted) {
        if (!mountedRef.current) break;
        setFiles(current => current.map(file => file.id === item.id ? { ...file, status: 'uploading' } : file));
        try {
          const uploaded = await adminApi.uploadImage(normalizedMime(item.file));
          if (!mountedRef.current) break;
          onAppendPhotos([uploaded.path], sessionKey);
          setFiles(current => current.map(file => file.id === item.id ? { ...file, status: 'done' } : file));
        } catch (error) {
          if (!mountedRef.current) break;
          const message = error instanceof Error ? error.message : 'Не удалось загрузить файл.';
          setFiles(current => current.map(file => file.id === item.id
            ? { ...file, status: 'error', message: `Загрузка не удалась: ${message}` }
            : file));
        }
        complete += 1;
        if (mountedRef.current) setProgress({ complete, total: accepted.length });
      }
    } finally {
      busyRef.current = false;
      if (mountedRef.current) {
        setProgress(null);
        if (ownsBusyClaimRef.current) {
          ownsBusyClaimRef.current = false;
          onUploadingChange(false, sessionKey);
        }
      }
    }
  }

  function handlePaste(event: ClipboardEvent<HTMLDivElement>) {
    const clipboardFiles = Array.from(event.clipboardData.items)
      .filter(item => item.kind === 'file')
      .map(item => item.getAsFile())
      .filter((file): file is File => Boolean(file));
    if (clipboardFiles.length) {
      event.preventDefault();
      if (disabled) return;
      void importFiles(clipboardFiles);
    }
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    if (disabled) return;
    void importFiles(Array.from(event.dataTransfer.files));
  }

  return (
    <div className="space-y-3">
      <div
        data-testid="editorial-photo-dropzone"
        role="region"
        aria-label="Добавление фотографий к статье"
        aria-disabled={disabled}
        tabIndex={disabled ? -1 : 0}
        onPaste={handlePaste}
        onDragEnter={event => { event.preventDefault(); if (!disabled) setDragging(true); }}
        onDragOver={event => { event.preventDefault(); if (!disabled) setDragging(true); }}
        onDragLeave={event => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
        }}
        onDrop={handleDrop}
        className={`rounded-md border border-dashed px-4 py-4 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#315647] ${
          dragging ? 'border-[#315647] bg-[#e7eee5]' : 'border-[#bfc9bc] bg-[#fbfaf6]'
        }`}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#e8ede5] text-[#315647]">
            <ImagePlus className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-[#3c5144]">Добавить фотографии</p>
            <p className="mt-1 text-xs leading-5 text-[#718075]">Перетащите файлы сюда или сфокусируйте эту область и нажмите Ctrl+V / Cmd+V, чтобы вставить изображение из буфера.</p>
            <p className="text-xs text-[#8a9188]">PNG, JPEG, WebP или GIF · до 5 МиБ на файл · всего до 12 фотографий</p>
          </div>
          <button
            type="button"
            data-testid="cheese-photo-file-chooser"
            disabled={disabled || busyRef.current}
            onClick={() => inputRef.current?.click()}
            className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-md border border-[#c8cec3] bg-[#f5f3eb] px-3 text-sm font-medium text-[#43574a] hover:bg-[#e9eee7] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Upload className="h-4 w-4" aria-hidden="true" />
            Выбрать файлы
          </button>
          <input
            ref={inputRef}
            data-testid="editorial-photo-file"
            className="sr-only"
            type="file"
            disabled={disabled || busyRef.current}
            accept="image/png,image/jpeg,image/webp,image/gif"
            multiple
            onChange={event => {
              void importFiles(Array.from(event.currentTarget.files || []));
              event.currentTarget.value = '';
            }}
          />
        </div>
      </div>

      {progress && <div data-testid="editorial-photo-progress" className="space-y-1" aria-live="polite">
        <div className="flex items-center justify-between text-xs text-[#526158]">
          <span className="inline-flex items-center gap-2"><LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />Загрузка фотографий…</span>
          <span>{progress.complete} из {progress.total}</span>
        </div>
        <div role="progressbar" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.complete} className="h-1.5 overflow-hidden rounded-full bg-[#e0e4dc]">
          <div className="h-full rounded-full bg-[#66836c] transition-[width]" style={{ width: `${Math.max(5, (progress.complete / progress.total) * 100)}%` }} />
        </div>
      </div>}

      {files.length > 0 && <ul className="space-y-1.5" aria-live="polite">
        {files.map(item => <li key={item.id} data-testid="cheese-photo-upload-file" className={`flex items-start justify-between gap-3 rounded border px-2.5 py-2 text-xs ${
          item.status === 'error' ? 'border-[#e0b7aa] bg-[#faeee9] text-[#8b4535]' :
            item.status === 'done' ? 'border-[#cbd4c8] bg-[#edf1e9] text-[#43574a]' : 'border-[#d9d7ca] bg-[#f5f3eb] text-[#59645d]'
        }`}>
          <span className="min-w-0 break-all">
            <strong>{item.file.name}</strong>
            <span className="ml-2">{item.message || (item.status === 'done' ? 'Добавлено в черновик' : item.status === 'uploading' ? 'Загрузка…' : item.status === 'queued' ? 'Ожидает загрузки' : '')}</span>
          </span>
          {item.status === 'uploading' && <LoaderCircle className="h-4 w-4 shrink-0 animate-spin" aria-label="Загрузка" />}
        </li>)}
      </ul>}

      {photos.length > 0 && <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {photos.map((photo, index) => {
          const isLocalPath = photo.startsWith('/') && !photo.startsWith('//');
          return <li key={`${photo}-${index}`} className="group relative overflow-hidden rounded border border-[#d9d7ca] bg-[#fbfaf6]">
            {isLocalPath
              ? <img src={photo} alt={`Фотография ${index + 1}`} loading="lazy" className="h-24 w-full object-cover" />
              : <div className="flex h-24 items-center justify-center gap-2 px-2 text-xs text-[#718075]"><ImagePlus className="h-4 w-4 shrink-0" aria-hidden="true" /><span className="max-w-full truncate">Внешняя ссылка</span></div>}
            <div className="flex min-w-0 items-center justify-between gap-1 border-t border-[#e5e2d8] px-2 py-1.5">
              <span className="min-w-0 truncate text-[10px] text-[#718075]" title={photo}>{photo}</span>
              <button
                type="button"
                data-testid={`editorial-photo-remove-${index}`}
                aria-label={`Убрать фотографию ${index + 1} из черновика`}
                onClick={() => { if (!disabled) onRemovePhoto(index, sessionKey); }}
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded text-[#8b5142] hover:bg-[#f5e7e1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a05d41]"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </li>;
        })}
      </ul>}
    </div>
  );
}
