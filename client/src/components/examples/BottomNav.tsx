import BottomNav from '../BottomNav';

export default function BottomNavExample() {
  return (
    <div className="h-screen flex flex-col">
      <div className="flex-1 bg-muted flex items-center justify-center">
        <p className="text-muted-foreground">Контент страницы</p>
      </div>
      <BottomNav />
    </div>
  );
}
