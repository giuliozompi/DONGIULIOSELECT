import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Printer, Package, Loader2, AlertTriangle } from 'lucide-react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import type { Order } from '@shared/schema';
import { DELIVERY_METHOD_LABELS } from '@shared/schema';

interface MarkingLog {
  id: string;
  orderId: string;
  productId: string;
  markingCode: string;
  scannedAt: string;
  operatorId: string | null;
}

interface OrderViewDialogProps {
  order: Order;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function OrderViewDialog({ order, open, onOpenChange }: OrderViewDialogProps) {
  const { toast } = useToast();
  const [showRefundDialog, setShowRefundDialog] = useState<boolean>(false);
  
  // Fetch marking codes if order has products requiring marking
  const { data: markingLogs = [], isLoading: isLoadingMarking, isError: isErrorMarking } = useQuery<MarkingLog[]>({
    queryKey: [`/api/admin/marking-logs/${order.id}`],
    enabled: open,
  });

  // Refund form schema
  const refundFormSchema = z.object({
    reason: z.string().trim().min(10, 'Причина возврата должна содержать минимум 10 символов'),
  });
  
  // Refund form
  const refundForm = useForm<z.infer<typeof refundFormSchema>>({
    resolver: zodResolver(refundFormSchema),
    mode: 'onChange',
    defaultValues: {
      reason: '',
    },
  });
  
  // Refund order mutation
  const refundOrderMutation = useMutation({
    mutationFn: async (values: z.infer<typeof refundFormSchema>) => {
      const res = await apiRequest('POST', `/api/admin/orders/${order.id}/refund`, { reason: values.reason });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to process refund');
      }
      return await res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/orders'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/orders', order.id] });
      setShowRefundDialog(false);
      refundForm.reset();
      toast({ 
        title: 'Возврат оформлен', 
        description: `Возврат средств успешно инициирован. ID: ${data.refund.id}`,
      });
    },
    onError: (error: any) => {
      toast({ 
        title: 'Ошибка возврата', 
        description: error.message || 'Не удалось оформить возврат',
        variant: 'destructive' 
      });
    },
  });

  // Determina se il rimborso è possibile
  const canRefund = order.paymentMethod === 'yookassa' && 
                    (order.status === 'ОПЛАЧЕН' || order.status === 'ВЫЗВАН КУРЬЕР' || order.status === 'ПОЛУЧЕН') &&
                    !order.refundStatus;

  const handlePrint = () => {
    window.print();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto print:max-w-full print:max-h-full" data-testid="dialog-order-view">
        <DialogHeader className="print:mb-4">
          <div className="flex items-center justify-between gap-4">
            <DialogTitle className="text-2xl">
              Заказ {order.id.slice(0, 8)}
            </DialogTitle>
            <Button
              onClick={handlePrint}
              variant="outline"
              size="sm"
              className="print:hidden"
              data-testid="button-print-order"
            >
              <Printer className="w-4 h-4 mr-2" />
              Печать
            </Button>
          </div>
        </DialogHeader>

        <div className="space-y-6 print:space-y-4">
          {/* Order Status */}
          <div className="flex items-center gap-4 print:gap-2">
            <span className="font-semibold">Статус:</span>
            <Badge variant="outline" className="print:border print:border-gray-300">
              {order.status}
            </Badge>
          </div>

          <Separator className="print:border-t print:border-gray-300" />

          {/* Customer Information */}
          <div className="space-y-2">
            <h3 className="font-semibold text-lg">Информация о клиенте</h3>
            <div className="grid grid-cols-2 gap-4 print:gap-2">
              <div>
                <span className="text-muted-foreground print:text-gray-600">Имя:</span>
                <p className="font-medium">{order.customerName}</p>
              </div>
              <div>
                <span className="text-muted-foreground print:text-gray-600">Телефон:</span>
                <p className="font-medium">{order.customerPhone}</p>
              </div>
              <div className="col-span-2">
                <span className="text-muted-foreground print:text-gray-600">Адрес доставки:</span>
                <p className="font-medium">{order.deliveryAddress}</p>
              </div>
            </div>
          </div>

          <Separator className="print:border-t print:border-gray-300" />

          {/* Order Items */}
          <div className="space-y-3">
            <h3 className="font-semibold text-lg">Товары</h3>
            <div className="space-y-2">
              {order.items.map((item, index) => (
                <div key={index} className="p-3 border rounded-md print:border-gray-300 print:p-2">
                  <div className="flex justify-between items-start gap-4">
                    <div className="flex-1">
                      <p className="font-medium">{item.productName}</p>
                      <div className="text-sm text-muted-foreground print:text-gray-600 mt-1">
                        <span>Количество: {item.quantity} {item.unit}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold">{item.price}₽</p>
                      <p className="text-sm text-muted-foreground print:text-gray-600">
                        {(parseFloat(item.price) * item.quantity).toFixed(2)}₽ всего
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Marking Codes */}
          {isLoadingMarking && (
            <>
              <Separator className="print:border-t print:border-gray-300" />
              <div className="space-y-3">
                <h3 className="font-semibold text-lg flex items-center gap-2">
                  <Package className="w-5 h-5" />
                  Коды маркировки
                </h3>
                <div className="flex items-center gap-2 text-sm text-muted-foreground print:hidden">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Загрузка кодов маркировки...
                </div>
              </div>
            </>
          )}
          {isErrorMarking && (
            <>
              <Separator className="print:border-t print:border-gray-300" />
              <div className="space-y-3">
                <h3 className="font-semibold text-lg flex items-center gap-2">
                  <Package className="w-5 h-5" />
                  Коды маркировки
                </h3>
                <div className="p-3 border border-destructive/50 rounded-md bg-destructive/10 print:hidden">
                  <div className="flex items-center gap-2 text-sm text-destructive">
                    <AlertTriangle className="w-4 h-4" />
                    <p>Ошибка загрузки кодов маркировки. Распечатка может быть неполной.</p>
                  </div>
                </div>
              </div>
            </>
          )}
          {!isLoadingMarking && !isErrorMarking && markingLogs.length > 0 && (
            <>
              <Separator className="print:border-t print:border-gray-300" />
              <div className="space-y-3">
                <h3 className="font-semibold text-lg flex items-center gap-2">
                  <Package className="w-5 h-5" />
                  Коды маркировки
                </h3>
                <div className="space-y-2">
                  {markingLogs.map((log, index) => (
                    <div key={log.id} className="p-3 border rounded-md print:border-gray-300 print:p-2 bg-muted/30 print:bg-gray-50">
                      <div className="flex justify-between items-center gap-4">
                        <div className="flex-1">
                          <p className="font-mono text-sm break-all">{log.markingCode}</p>
                          <p className="text-xs text-muted-foreground print:text-gray-600 mt-1">
                            Отсканировано: {new Date(log.scannedAt).toLocaleString('ru-RU')}
                          </p>
                        </div>
                        <Badge variant="secondary" className="print:border print:border-gray-300">
                          #{index + 1}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          <Separator className="print:border-t print:border-gray-300" />

          {/* Order Summary */}
          <div className="space-y-2 bg-muted/30 print:bg-gray-50 p-4 rounded-md print:p-3">
            <div className="flex justify-between items-center">
              <span className="font-semibold">Общая сумма:</span>
              <span className="font-bold text-xl">{order.amount}₽</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground print:text-gray-600">Способ оплаты:</span>
              <span className="font-medium">{order.paymentMethod === 'cash' ? 'Наличные' : 'Онлайн'}</span>
            </div>
            {order.deliveryMethod && (
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground print:text-gray-600">Метод доставки:</span>
                <span className="font-medium" data-testid="order-delivery-method-print">
                  {DELIVERY_METHOD_LABELS[order.deliveryMethod as keyof typeof DELIVERY_METHOD_LABELS] || order.deliveryMethod}
                </span>
              </div>
            )}
          </div>

          {/* Delivery Information */}
          {(order.yandexClaimId || order.yandexGoClaimId) && (
            <>
              <Separator className="print:border-t print:border-gray-300" />
              <div className="space-y-3">
                <h3 className="font-semibold text-lg">Информация о доставке</h3>
                {order.yandexClaimId && (
                  <div className="p-3 border rounded-md print:border-gray-300 print:p-2">
                    <p className="font-medium">Yandex Dostavka</p>
                    <div className="text-sm text-muted-foreground print:text-gray-600 mt-1">
                      <p>Статус: {order.yandexDeliveryStatus || 'в обработке'}</p>
                      {order.yandexDeliveryPrice && <p>Стоимость: {order.yandexDeliveryPrice}₽</p>}
                      <p className="font-mono text-xs mt-1">ID: {order.yandexClaimId}</p>
                    </div>
                  </div>
                )}
                {order.yandexGoClaimId && (
                  <div className="p-3 border rounded-md print:border-gray-300 print:p-2">
                    <p className="font-medium">Yandex Go</p>
                    <div className="text-sm text-muted-foreground print:text-gray-600 mt-1">
                      <p>Статус: {order.yandexGoStatus || 'в обработке'}</p>
                      {order.yandexGoPrice && <p>Стоимость: {order.yandexGoPrice}₽</p>}
                      <p className="font-mono text-xs mt-1">ID: {order.yandexGoClaimId}</p>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {/* Order Metadata */}
          <div className="text-xs text-muted-foreground print:text-gray-600 space-y-1 pt-4 border-t print:border-gray-300">
            <p>ID заказа: <span className="font-mono">{order.id}</span></p>
            <p>Создан: {new Date(order.createdAt).toLocaleString('ru-RU')}</p>
          </div>

          {/* Refund section - only for YooKassa paid orders */}
          {canRefund && (
            <div className="border-t pt-4 print:hidden">
              {!showRefundDialog ? (
                <Button
                  variant="destructive"
                  onClick={() => setShowRefundDialog(true)}
                  className="w-full"
                  data-testid="button-request-refund"
                >
                  <AlertTriangle className="w-4 h-4 mr-2" />
                  Оформить возврат средств
                </Button>
              ) : (
                <div className="space-y-3 bg-muted p-4 rounded-md">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="font-semibold text-sm">Подтверждение возврата</p>
                      <p className="text-sm text-muted-foreground mb-3">
                        Полный возврат средств для заказа на сумму {order.amount}₽ через YooKassa.
                      </p>
                      <Form {...refundForm}>
                        <form className="space-y-2">
                          <FormField
                            control={refundForm.control}
                            name="reason"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Причина возврата (минимум 10 символов)</FormLabel>
                                <FormControl>
                                  <Textarea
                                    {...field}
                                    placeholder="Укажите причину возврата средств..."
                                    className="min-h-[100px] resize-none"
                                    data-testid="textarea-refund-reason"
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </form>
                      </Form>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="destructive"
                      onClick={refundForm.handleSubmit((values) => refundOrderMutation.mutate(values))}
                      disabled={refundOrderMutation.isPending || !refundForm.formState.isValid}
                      className="flex-1"
                      data-testid="button-confirm-refund"
                    >
                      {refundOrderMutation.isPending ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Обработка...
                        </>
                      ) : (
                        'Да, оформить возврат'
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setShowRefundDialog(false);
                        refundForm.reset();
                      }}
                      disabled={refundOrderMutation.isPending}
                      className="flex-1"
                      data-testid="button-cancel-refund"
                    >
                      Отмена
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
