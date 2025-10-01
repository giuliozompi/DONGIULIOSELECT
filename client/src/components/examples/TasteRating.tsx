import TasteRating from '../TasteRating';

export default function TasteRatingExample() {
  return (
    <div className="p-6">
      <TasteRating
        stats={{ tasty: 15, very_tasty: 25, super: 60 }}
        userRating="super"
        onRate={(rating) => console.log('Rating changed to:', rating)}
      />
    </div>
  );
}
