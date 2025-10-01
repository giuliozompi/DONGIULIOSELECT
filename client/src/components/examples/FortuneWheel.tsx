import FortuneWheel from '../FortuneWheel';

export default function FortuneWheelExample() {
  const mockSpin = () => {
    return new Promise<any>((resolve) => {
      setTimeout(() => {
        resolve({
          id: '1',
          name: 'Скидка 10% на первый заказ',
          type: 'discount',
          value: '10',
        });
      }, 100);
    });
  };

  return (
    <div className="p-6">
      <FortuneWheel spinTokens={3} onSpin={mockSpin} />
    </div>
  );
}
