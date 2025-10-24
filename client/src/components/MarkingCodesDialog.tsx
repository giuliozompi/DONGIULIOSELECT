import { useState, useEffect, useRef } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { CheckCircle2, AlertCircle, Loader2, Scan } from 'lucide-react';
import type { Order, Product } from '@shared/schema';
import { DuplicateCodeDialog } from './DuplicateCodeDialog';

interface MarkingCodesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: Order;
  onComplete: () => void;
}

interface MarkingCodeUnit {
  unitIndex: number;
  code: string;
  validated: boolean; // Validato localmente (verificato come corretto)
  saved: boolean; // Già salvato nel database
  logId: string | null; // ID del log nel database (se esiste)
  error: string | null;
}

interface ProductWithMarkingStatus {
  product: Product;
  orderItem: Order['items'][0];
  units: MarkingCodeUnit[];
}

interface DuplicateCodeState {
  productId: string;
  unitIndex: number;
  code: string;
  existingLog: any;
}

export function MarkingCodesDialog({
  open,
  onOpenChange,
  order,
  onComplete,
}: MarkingCodesDialogProps) {
  const { toast } = useToast();
  const [productsWithMarking, setProductsWithMarking] = useState<ProductWithMarkingStatus[]>([]);
  const [initialized, setInitialized] = useState(false);
  const [currentFocusIndex, setCurrentFocusIndex] = useState<{ productId: string; unitIndex: number } | null>(null);
  const [duplicateDialog, setDuplicateDialog] = useState<DuplicateCodeState | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  
  // Refs per gestire focus automatico e tracking prodotto
  const inputRefs = useRef<Map<string, HTMLInputElement>>(new Map());
  const previousProductIdRef = useRef<string | null>(null);

  // Fetch all products to check which ones require marking
  const { data: allProducts = [], isLoading: productsLoading } = useQuery<Product[]>({
    queryKey: ['/api/products'],
    enabled: open,
  });

  // Fetch existing marking logs for this order
  const { data: existingLogs = [], isLoading: logsLoading } = useQuery({
    queryKey: ['/api/admin/marking-logs', order.id],
    enabled: open,
    queryFn: async () => {
      const response = await fetch(`/api/admin/marking-logs/${order.id}`);
      if (!response.ok) throw new Error('Failed to fetch marking logs');
      return response.json();
    },
  });

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setInitialized(false);
      setProductsWithMarking([]);
      setCurrentFocusIndex(null);
      setDuplicateDialog(null);
      inputRefs.current.clear();
    }
  }, [open]);

  // Funzione per sintesi vocale in russo con voce maschile caratteristica
  const speakInRussian = (text: string) => {
    if (!window.speechSynthesis) return;
    
    // Cancella qualsiasi messaggio in corso
    window.speechSynthesis.cancel();
    
    const speak = () => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'ru-RU';
      
      // Cerca una voce maschile russa disponibile
      const voices = window.speechSynthesis.getVoices();
      console.log('🎤 Available voices:', voices.map(v => `${v.name} (${v.lang})`));
      
      // Prova a trovare una voce maschile russa
      const russianVoice = 
        // Cerca esplicitamente voci maschili russe
        voices.find(v => v.lang.startsWith('ru') && (
          v.name.toLowerCase().includes('yuri') ||
          v.name.toLowerCase().includes('dmitri') ||
          v.name.toLowerCase().includes('male')
        )) ||
        // Fallback: qualsiasi voce russa
        voices.find(v => v.lang.startsWith('ru')) ||
        // Ultimo fallback: voce di default
        voices[0];
      
      if (russianVoice) {
        console.log('🎤 Selected voice:', russianVoice.name, russianVoice.lang);
        utterance.voice = russianVoice;
      }
      
      // Parametri per voce più caratteristica e profonda
      utterance.rate = 0.85; // Velocità più lenta per enfasi
      utterance.pitch = 0.75; // Tono ancora più basso per voce maschile profonda
      utterance.volume = 1.0;
      
      window.speechSynthesis.speak(utterance);
    };
    
    // Se le voci non sono ancora caricate, aspetta
    const voices = window.speechSynthesis.getVoices();
    if (voices.length === 0) {
      // Aspetta che le voci siano caricate
      window.speechSynthesis.addEventListener('voiceschanged', speak, { once: true });
    } else {
      speak();
    }
  };

  // Initialize products with marking ONLY ONCE when data loads
  useEffect(() => {
    if (!allProducts.length || !order || initialized) return;

    const productsNeedingMarking: ProductWithMarkingStatus[] = [];

    for (const item of order.items) {
      const product = allProducts.find(p => p.id === item.productId);
      
      // IMPORTANTE: Маркировка attiva SOLO per prodotti a pezzo (шт)
      const isUnitProduct = item.unit === 'шт';
      
      if (product?.requiresMarking && isUnitProduct) {
        // Get all existing logs for this product
        const productLogs = existingLogs.filter((log: any) => log.productId === item.productId);
        
        // Create units array based on quantity (for шт, quantity is always integer)
        const quantity = Math.ceil(item.quantity);
        const units: MarkingCodeUnit[] = [];
        
        for (let i = 0; i < quantity; i++) {
          const existingLog = productLogs[i];
          units.push({
            unitIndex: i,
            code: existingLog?.markingCode || '',
            validated: !!existingLog, // Già salvati = già validati
            saved: !!existingLog, // Marca come già salvato se esiste nel DB
            logId: existingLog?.id || null, // Traccia l'ID del log per eventuali modifiche
            error: null,
          });
        }
        
        productsNeedingMarking.push({
          product,
          orderItem: item,
          units,
        });
      }
    }

    setProductsWithMarking(productsNeedingMarking);
    setInitialized(true);
    
    // Auto-focus sul primo campo non validato, oppure sul primo campo se tutti sono validati
    if (productsNeedingMarking.length > 0) {
      const firstProduct = productsNeedingMarking[0];
      const firstUnvalidated = firstProduct.units.findIndex(u => !u.validated);
      const focusIndex = firstUnvalidated !== -1 ? firstUnvalidated : 0; // Se tutti validati, focus sul primo
      
      setCurrentFocusIndex({
        productId: firstProduct.product.id,
        unitIndex: focusIndex,
      });
      
      // Annuncio vocale solo se ci sono campi da validare
      if (firstUnvalidated !== -1) {
        const productNameShort = firstProduct.product.name.split('-')[0].trim();
        const unitsRemaining = firstProduct.units.filter(u => !u.validated).length;
        const announcement = `${productNameShort}. ${unitsRemaining} ${unitsRemaining === 1 ? 'код' : unitsRemaining < 5 ? 'кода' : 'кодов'}.`;
        
        // Ritarda leggermente per dare tempo al dialog di aprirsi
        setTimeout(() => speakInRussian(announcement), 500);
      }
    }
  }, [allProducts, order, existingLogs, initialized]);

  // Auto-focus sul campo attivo + annuncio vocale quando si passa a nuovo prodotto
  useEffect(() => {
    if (currentFocusIndex) {
      const key = `${currentFocusIndex.productId}-${currentFocusIndex.unitIndex}`;
      const input = inputRefs.current.get(key);
      if (input) {
        setTimeout(() => input.focus(), 100);
      }
      
      // Controlla se siamo passati a un nuovo prodotto
      const currentProductId = currentFocusIndex.productId;
      const previousProductId = previousProductIdRef.current;
      
      if (previousProductId !== null && previousProductId !== currentProductId) {
        // Siamo passati a un nuovo prodotto - annuncio vocale
        const product = productsWithMarking.find(p => p.product.id === currentProductId);
        if (product) {
          const productNameShort = product.product.name.split('-')[0].trim();
          const unitsRemaining = product.units.filter(u => !u.validated).length;
          const announcement = `${productNameShort}. ${unitsRemaining} ${unitsRemaining === 1 ? 'код' : unitsRemaining < 5 ? 'кода' : 'кодов'}.`;
          
          // Breve ritardo per evitare sovrapposizioni vocali
          setTimeout(() => speakInRussian(announcement), 300);
        }
      }
      
      // Aggiorna il tracking del prodotto corrente
      previousProductIdRef.current = currentProductId;
    }
  }, [currentFocusIndex, productsWithMarking]);

  // Validate marking code in real-time
  const validateCodeMutation = useMutation({
    mutationFn: async (code: string) => {
      const res = await apiRequest('POST', '/api/admin/marking-logs/validate', {
        markingCode: code,
      });
      return await res.json();
    },
  });

  const handleCodeChange = (productId: string, unitIndex: number, code: string) => {
    setProductsWithMarking(prev =>
      prev.map(p =>
        p.product.id === productId
          ? {
              ...p,
              units: p.units.map((u, idx) =>
                idx === unitIndex
                  ? { 
                      ...u, 
                      code, 
                      error: null,
                      // Se modifichiamo un codice già salvato, dobbiamo ri-validarlo
                      validated: false,
                      saved: false,
                      // Manteniamo il logId per poterlo cancellare dopo
                    }
                  : u
              ),
            }
          : p
      )
    );
  };

  const handleKeyDown = async (
    e: React.KeyboardEvent,
    productId: string,
    unitIndex: number,
    code: string
  ) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    
    await handleValidateCode(productId, unitIndex, code);
  };

  const handleValidateCode = async (productId: string, unitIndex: number, code: string) => {
    if (!code.trim()) {
      setProductsWithMarking(prev =>
        prev.map(p =>
          p.product.id === productId
            ? {
                ...p,
                units: p.units.map((u, idx) =>
                  idx === unitIndex
                    ? { ...u, error: 'Код не может быть пустым' }
                    : u
                ),
              }
            : p
        )
      );
      return;
    }

    // Check for duplicates within this product
    const product = productsWithMarking.find(p => p.product.id === productId);
    if (product) {
      const isDuplicate = product.units.some(
        (u, idx) => idx !== unitIndex && u.code.trim() === code.trim() && u.code.trim() !== ''
      );
      
      if (isDuplicate) {
        setProductsWithMarking(prev =>
          prev.map(p =>
            p.product.id === productId
              ? {
                  ...p,
                  units: p.units.map((u, idx) =>
                    idx === unitIndex
                      ? { ...u, error: 'Этот код уже используется для другой единицы этого продукта' }
                      : u
                  ),
                }
              : p
          )
        );
        return;
      }
    }

    // Validate against database
    try {
      const result = await validateCodeMutation.mutateAsync(code.trim());
      
      if (result.isUsed) {
        // Codice duplicato - apri dialog per sostituzione
        setDuplicateDialog({
          productId,
          unitIndex,
          code: code.trim(),
          existingLog: result.existingLog,
        });
      } else {
        // Codice valido - marca come validated ma NON saved (sarà salvato con handleSaveAll)
        setProductsWithMarking(prev =>
          prev.map(p =>
            p.product.id === productId
              ? {
                  ...p,
                  units: p.units.map((u, idx) =>
                    idx === unitIndex
                      ? { ...u, validated: true, saved: false, error: null }
                      : u
                  ),
                }
              : p
          )
        );
        
        // Auto-focus sul prossimo campo
        moveToNextField(productId, unitIndex);
      }
    } catch (error: any) {
      setProductsWithMarking(prev =>
        prev.map(p =>
          p.product.id === productId
            ? {
                ...p,
                units: p.units.map((u, idx) =>
                  idx === unitIndex
                    ? { ...u, error: error.message || 'Ошибка валидации' }
                    : u
                ),
              }
            : p
        )
      );
    }
  };

  const moveToNextField = (currentProductId: string, currentUnitIndex: number) => {
    // Trova il prossimo campo non validato
    const allFields: { productId: string; unitIndex: number }[] = [];
    
    productsWithMarking.forEach(p => {
      p.units.forEach((u, idx) => {
        allFields.push({ productId: p.product.id, unitIndex: idx });
      });
    });
    
    const currentIndex = allFields.findIndex(
      f => f.productId === currentProductId && f.unitIndex === currentUnitIndex
    );
    
    // Cerca il prossimo non validato dopo il campo corrente
    for (let i = currentIndex + 1; i < allFields.length; i++) {
      const field = allFields[i];
      const product = productsWithMarking.find(p => p.product.id === field.productId);
      const unit = product?.units[field.unitIndex];
      
      if (unit && !unit.validated) {
        setCurrentFocusIndex(field);
        return;
      }
    }
    
    // Se non c'è nessun campo successivo non validato, focus sul primo non validato dall'inizio
    for (let i = 0; i < allFields.length; i++) {
      const field = allFields[i];
      const product = productsWithMarking.find(p => p.product.id === field.productId);
      const unit = product?.units[field.unitIndex];
      
      if (unit && !unit.validated) {
        setCurrentFocusIndex(field);
        return;
      }
    }
    
    // Tutti validati
    setCurrentFocusIndex(null);
  };

  const handleDuplicateReplace = () => {
    if (!duplicateDialog) return;
    
    // Resetta il codice e rendi il campo attivo per re-scan
    setProductsWithMarking(prev =>
      prev.map(p =>
        p.product.id === duplicateDialog.productId
          ? {
              ...p,
              units: p.units.map((u, idx) =>
                idx === duplicateDialog.unitIndex
                  ? { ...u, code: '', error: 'Отсканируйте новый код для замены', validated: false, saved: false }
                  : u
              ),
            }
          : p
      )
    );
    
    setCurrentFocusIndex({
      productId: duplicateDialog.productId,
      unitIndex: duplicateDialog.unitIndex,
    });
    
    setDuplicateDialog(null);
  };

  const handleDuplicateCancel = () => {
    if (!duplicateDialog) return;
    
    // Resetta il codice
    setProductsWithMarking(prev =>
      prev.map(p =>
        p.product.id === duplicateDialog.productId
          ? {
              ...p,
              units: p.units.map((u, idx) =>
                idx === duplicateDialog.unitIndex
                  ? { ...u, code: '', error: null, validated: false, saved: false }
                  : u
              ),
            }
          : p
      )
    );
    
    setDuplicateDialog(null);
  };

  const allCodesValidated = productsWithMarking.length > 0 && 
    productsWithMarking.every(p => p.units.every(u => u.validated));

  const getTotalUnits = () => {
    return productsWithMarking.reduce((sum, p) => sum + p.units.length, 0);
  };

  const getValidatedUnits = () => {
    return productsWithMarking.reduce(
      (sum, p) => sum + p.units.filter(u => u.validated).length,
      0
    );
  };

  const handleSaveAll = async () => {
    if (!allCodesValidated) {
      toast({
        title: 'Не все коды проверены',
        description: `Проверено ${getValidatedUnits()} из ${getTotalUnits()} кодов. Проверьте все коды маркировки перед сохранением.`,
        variant: 'destructive',
      });
      return;
    }

    setIsSaving(true);
    
    try {
      // Prima fase: identifica e cancella i vecchi log che sono stati modificati
      const deletePromises: Promise<any>[] = [];
      const logsToDelete: string[] = [];
      
      for (const product of productsWithMarking) {
        for (const unit of product.units) {
          // Se ha un logId ma NON è più saved, significa che è stato modificato
          if (unit.logId && !unit.saved) {
            logsToDelete.push(unit.logId);
            deletePromises.push(
              apiRequest('DELETE', `/api/admin/marking-logs/${unit.logId}`, {})
            );
          }
        }
      }
      
      // Esegui le cancellazioni se necessarie
      if (deletePromises.length > 0) {
        await Promise.all(deletePromises);
      }
      
      // Seconda fase: salva i codici nuovi o modificati (validated ma NON saved)
      const savePromises: Promise<any>[] = [];
      let newCodeCount = 0;
      
      for (const product of productsWithMarking) {
        for (const unit of product.units) {
          // Salva SOLO se è validato E NON ancora salvato nel DB
          if (unit.validated && !unit.saved && unit.code.trim()) {
            savePromises.push(
              apiRequest('POST', '/api/admin/marking-logs', {
                orderId: order.id,
                productId: product.product.id,
                markingCode: unit.code.trim(),
              })
            );
            newCodeCount++;
          }
        }
      }
      
      // Se non ci sono nuovi codici da salvare, chiudi semplicemente
      if (savePromises.length === 0) {
        toast({
          title: 'Nessuna modifica',
          description: 'Tutti i codici sono già stati salvati',
        });
        onComplete();
        onOpenChange(false);
        return;
      }
      
      await Promise.all(savePromises);
      
      // Invalida cache
      queryClient.invalidateQueries({ queryKey: ['/api/admin/marking-logs', order.id] });
      
      toast({
        title: 'Коды сохранены',
        description: `${newCodeCount} ${newCodeCount === 1 ? 'новый код' : newCodeCount < 5 ? 'новых кода' : 'новых кодов'} успешно сохранено`,
      });
      
      onComplete();
      onOpenChange(false);
    } catch (error: any) {
      toast({
        title: 'Ошибка сохранения',
        description: error.message || 'Failed to save marking codes',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (productsLoading || logsLoading) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin" />
            <span className="ml-2">Загрузка...</span>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Scan className="w-5 h-5" />
              Маркировка товаров (Режим сканирования)
            </DialogTitle>
            <DialogDescription>
              Заказ #{order.id.slice(0, 8)} - Отсканируйте коды последовательно.
              Нажмите Enter после каждого кода для проверки и перехода к следующему.
              {!allCodesValidated && (
                <span className="block mt-2 font-medium text-foreground">
                  Прогресс: {getValidatedUnits()} / {getTotalUnits()} проверено
                </span>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {productsWithMarking.length === 0 ? (
              <p className="text-muted-foreground">
                В этом заказе нет товаров, требующих маркировки.
              </p>
            ) : (
              productsWithMarking.map((item) => (
                <div 
                  key={item.product.id}
                  className="border rounded-md p-4 space-y-3"
                  data-testid={`marking-product-${item.product.id}`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium">{item.product.name}</p>
                      <p className="text-sm text-muted-foreground">
                        Количество: {item.orderItem.quantity} {item.orderItem.unit} ({item.units.length} {item.units.length === 1 ? 'единица' : 'единиц'})
                      </p>
                      <p className="text-sm font-medium mt-1">
                        Проверено: {item.units.filter(u => u.validated).length} / {item.units.length}
                      </p>
                    </div>
                    {item.units.every(u => u.validated) && (
                      <CheckCircle2 className="w-5 h-5 text-green-600" data-testid={`icon-all-validated-${item.product.id}`} />
                    )}
                  </div>

                  <div className="space-y-2">
                    {item.units.map((unit) => {
                      const isActive = currentFocusIndex?.productId === item.product.id && 
                                      currentFocusIndex?.unitIndex === unit.unitIndex;
                      const key = `${item.product.id}-${unit.unitIndex}`;
                      
                      return (
                        <div 
                          key={unit.unitIndex} 
                          className={`flex items-center gap-2 p-2 rounded-md transition-colors ${
                            isActive ? 'bg-accent' : ''
                          }`}
                        >
                          <div className="flex-1 space-y-1">
                            <Label 
                              htmlFor={key}
                              className="text-xs font-medium"
                            >
                              Единица {unit.unitIndex + 1}
                            </Label>
                            <div className="relative">
                              <Input
                                ref={(el) => {
                                  if (el) inputRefs.current.set(key, el);
                                  else inputRefs.current.delete(key);
                                }}
                                id={key}
                                value={unit.code}
                                onChange={(e) => handleCodeChange(item.product.id, unit.unitIndex, e.target.value)}
                                onKeyDown={(e) => handleKeyDown(e, item.product.id, unit.unitIndex, unit.code)}
                                onClick={() => {
                                  // Permetti di cliccare su qualsiasi campo per renderlo attivo
                                  setCurrentFocusIndex({ productId: item.product.id, unitIndex: unit.unitIndex });
                                }}
                                placeholder={isActive ? "Отсканируйте код и нажмите Enter" : "Клик для редактирования"}
                                readOnly={!isActive}
                                maxLength={24}
                                className={`text-xs cursor-pointer ${unit.validated ? 'bg-green-50 dark:bg-green-950' : ''} ${!isActive ? 'opacity-60' : ''}`}
                                data-testid={`input-marking-code-${item.product.id}-${unit.unitIndex}`}
                              />
                              {unit.validated && (
                                <CheckCircle2 className="w-4 h-4 text-green-600 absolute right-2 top-1/2 -translate-y-1/2" />
                              )}
                            </div>
                            {unit.error && (
                              <div className="flex items-center gap-1 text-xs text-destructive">
                                <AlertCircle className="w-3 h-3" />
                                <span>{unit.error}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSaving}
              data-testid="button-cancel-marking"
            >
              Отмена
            </Button>
            <Button
              onClick={handleSaveAll}
              disabled={!allCodesValidated || isSaving}
              data-testid="button-save-all-marking"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Сохранение...
                </>
              ) : allCodesValidated ? (
                'Сохранить всё'
              ) : (
                `Сохранить (${getValidatedUnits()}/${getTotalUnits()})`
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DuplicateCodeDialog
        open={!!duplicateDialog}
        onOpenChange={(open) => {
          if (!open) setDuplicateDialog(null);
        }}
        code={duplicateDialog?.code || ''}
        existingLog={duplicateDialog?.existingLog}
        onReplace={handleDuplicateReplace}
        onCancel={handleDuplicateCancel}
      />
    </>
  );
}
