import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

interface DuplicateCodeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  code: string;
  existingLog?: {
    orderId: string;
    productName?: string;
    orderDate?: string;
  };
  onReplace: () => void;
  onCancel: () => void;
}

export function DuplicateCodeDialog({
  open,
  onOpenChange,
  code,
  existingLog,
  onReplace,
  onCancel,
}: DuplicateCodeDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]" data-testid="dialog-duplicate-code">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-500" />
            <DialogTitle>Код уже использован</DialogTitle>
          </div>
        </DialogHeader>
        
        <div className="space-y-4">
          <div className="bg-muted p-4 rounded-md">
            <p className="text-sm font-medium mb-2">Код маркировки:</p>
            <code className="text-xs bg-background p-2 rounded block break-all">
              {code}
            </code>
          </div>
          
          {existingLog && (
            <div className="text-sm space-y-1">
              <p className="font-medium">Этот код уже зарегистрирован:</p>
              <ul className="list-disc list-inside text-muted-foreground space-y-1">
                {existingLog.productName && (
                  <li>Продукт: {existingLog.productName}</li>
                )}
                <li>Заказ: {existingLog.orderId.slice(0, 8)}</li>
                {existingLog.orderDate && (
                  <li>Дата: {new Date(existingLog.orderDate).toLocaleString('ru-RU')}</li>
                )}
              </ul>
            </div>
          )}
          
          <div className="bg-yellow-50 dark:bg-yellow-950 p-3 rounded-md border border-yellow-200 dark:border-yellow-800">
            <p className="text-sm text-yellow-800 dark:text-yellow-200">
              <strong>Внимание:</strong> Отсканируйте другой код маркировки для замены.
            </p>
          </div>
        </div>
        
        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={onCancel}
            data-testid="button-cancel-replacement"
          >
            Отмена
          </Button>
          <Button
            onClick={onReplace}
            data-testid="button-replace-code"
          >
            Заменить код
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
