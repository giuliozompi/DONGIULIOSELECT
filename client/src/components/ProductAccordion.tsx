import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

interface ProductAccordionProps {
  fullDescription?: string;
  nutrition?: {
    bju: { proteins: number; fats: number; carbs: number; calories: number };
    values: string[];
    composition: string;
  };
  consumptionTips?: string;
}

export default function ProductAccordion({
  fullDescription,
  nutrition,
  consumptionTips,
}: ProductAccordionProps) {
  return (
    <Accordion type="single" collapsible className="w-full" data-testid="accordion-product">
      {fullDescription && (
        <AccordionItem value="description">
          <AccordionTrigger data-testid="button-accordion-description">
            Полное описание
          </AccordionTrigger>
          <AccordionContent>
            <p className="text-sm leading-relaxed">{fullDescription}</p>
          </AccordionContent>
        </AccordionItem>
      )}

      {nutrition && (
        <AccordionItem value="nutrition">
          <AccordionTrigger data-testid="button-accordion-nutrition">
            Пищевая ценность
          </AccordionTrigger>
          <AccordionContent>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="flex justify-between p-2 bg-muted rounded">
                  <span>Белки:</span>
                  <span className="font-medium">{nutrition.bju.proteins} г</span>
                </div>
                <div className="flex justify-between p-2 bg-muted rounded">
                  <span>Жиры:</span>
                  <span className="font-medium">{nutrition.bju.fats} г</span>
                </div>
                <div className="flex justify-between p-2 bg-muted rounded">
                  <span>Углеводы:</span>
                  <span className="font-medium">{nutrition.bju.carbs} г</span>
                </div>
                <div className="flex justify-between p-2 bg-muted rounded">
                  <span>Калории:</span>
                  <span className="font-medium">{nutrition.bju.calories} ккал</span>
                </div>
              </div>
              {nutrition.values.length > 0 && (
                <div>
                  <p className="text-sm font-medium mb-2">Питательные ценности:</p>
                  <ul className="text-sm space-y-1 list-disc list-inside text-muted-foreground">
                    {nutrition.values.map((value, i) => (
                      <li key={i}>{value}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </AccordionContent>
        </AccordionItem>
      )}

      {nutrition?.composition && (
        <AccordionItem value="composition">
          <AccordionTrigger data-testid="button-accordion-composition">
            Состав
          </AccordionTrigger>
          <AccordionContent>
            <p className="text-sm text-muted-foreground">{nutrition.composition}</p>
          </AccordionContent>
        </AccordionItem>
      )}

      {consumptionTips && (
        <AccordionItem value="tips">
          <AccordionTrigger data-testid="button-accordion-tips">
            Применение и сочетания
          </AccordionTrigger>
          <AccordionContent>
            <p className="text-sm text-muted-foreground">{consumptionTips}</p>
          </AccordionContent>
        </AccordionItem>
      )}
    </Accordion>
  );
}
