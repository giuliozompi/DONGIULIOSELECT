import { Button } from '@/components/ui/button';
import { cheeseEditorialStages, type CheeseEditorialStage } from '@shared/editorial-stages';

const sections: Record<CheeseEditorialStage, { label: string; description: string }> = {
  drafts: {
    label: 'К подготовке',
    description: 'Статьи в редакции и ожидающие подтверждения. Одобрение и публикация выполняются отдельно.',
  },
  approved: {
    label: 'Одобренные',
    description: 'Проверенные статьи, которые ещё не опубликованы.',
  },
  published: {
    label: 'Опубликованные',
    description: 'Статьи, доступные читателям. Здесь остаются и статьи с изменениями, ещё не опубликованными.',
  },
};

export default function CheeseEditorialMenu({ value, onChange }: {
  value: CheeseEditorialStage; onChange: (value: CheeseEditorialStage) => void;
}) {
  return (
    <div className="mb-6" data-testid="cheese-editorial-menu">
      <nav aria-label="Разделы сырной энциклопедии" className="flex flex-wrap gap-2">
        {cheeseEditorialStages.map(stage => (
          <Button key={stage} type="button" variant="outline" aria-pressed={value === stage}
            data-testid={`cheese-stage-${stage}`} onClick={() => onChange(stage)}
            className={value === stage
              ? 'border-[#315647] bg-[#315647] text-[#f7f4e9] hover:bg-[#244537] hover:text-[#f7f4e9]'
              : 'border-[#c9cbbf] bg-[#fbfaf6] text-[#486252] hover:bg-[#e6ebe4]'}>
            {sections[stage].label}
          </Button>
        ))}
      </nav>
      <p className="mt-3 text-sm leading-5 text-[#68746b]">{sections[value].description}</p>
    </div>
  );
}
