import { useState, useEffect, useCallback, useRef, forwardRef, useImperativeHandle, type InputHTMLAttributes } from 'react';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { MapPin } from 'lucide-react';

export interface AddressSuggestion {
  fullAddress: string;
  city: string | null;
  street: string | null;
  building: string | null;
  flat: string | null;
  postalCode: string | null;
  fiasId: string;
  geoLat: string | null;
  geoLon: string | null;
}

interface AddressAutocompleteProps extends Pick<InputHTMLAttributes<HTMLInputElement>, 'id' | 'onBlur' | 'aria-describedby' | 'aria-invalid'> {
  value: string;
  onChange: (value: string, suggestion?: AddressSuggestion) => void;
  onSelect?: (suggestion: AddressSuggestion) => void;
  placeholder?: string;
  testId?: string;
  disabled?: boolean;
  suggestOnFocus?: boolean;
}

export const AddressAutocomplete = forwardRef<HTMLInputElement, AddressAutocompleteProps>(function AddressAutocomplete({
  value,
  onChange,
  onSelect,
  placeholder = "Начните вводить адрес...",
  testId = "input-address-autocomplete",
  disabled = false,
  suggestOnFocus = false,
  ...inputProps
}, ref) {
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [hasUserInteracted, setHasUserInteracted] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const requestVersion = useRef(0);
  useImperativeHandle(ref, () => inputRef.current!);

  const fetchSuggestions = useCallback(async (query: string) => {
    const version = ++requestVersion.current;
    if (query.length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(`/api/address/suggest?query=${encodeURIComponent(query)}`);
      if (!response.ok) throw new Error('Address suggestions unavailable');
      const data = await response.json();
      if (version !== requestVersion.current) return;
      setSuggestions(data.suggestions || []);
      setShowSuggestions(true);
    } catch (error) {
      if (version === requestVersion.current) {
        console.error('Error fetching address suggestions:', error);
        setSuggestions([]);
      }
    } finally {
      if (version === requestVersion.current) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (disabled) {
      requestVersion.current++;
      setSuggestions([]);
      setShowSuggestions(false);
      setIsLoading(false);
      return;
    }

    // Mostra suggerimenti solo se l'utente ha interagito con il campo
    if (!hasUserInteracted) {
      return;
    }

    const handler = setTimeout(() => {
      if (value) {
        fetchSuggestions(value);
      } else {
        setSuggestions([]);
      }
    }, 300);

    return () => clearTimeout(handler);
  }, [value, fetchSuggestions, disabled, hasUserInteracted]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelectSuggestion = (suggestion: AddressSuggestion) => {
    requestVersion.current++;
    setHasUserInteracted(false);
    setIsLoading(false);
    onChange(suggestion.fullAddress, suggestion);
    if (onSelect) {
      onSelect(suggestion);
    }
    setShowSuggestions(false);
    setSuggestions([]);
  };

  return (
    <div className="relative">
      <Input
        {...inputProps}
        ref={inputRef}
        dir="ltr"
        value={value}
        onChange={(e) => {
          requestVersion.current++;
          setSuggestions([]);
          setShowSuggestions(false);
          setIsLoading(false);
          setHasUserInteracted(true);
          onChange(e.target.value);
        }}
        placeholder={placeholder}
        data-testid={testId}
        disabled={disabled}
        autoComplete="off"
        onFocus={() => {
          if (suggestOnFocus) setHasUserInteracted(true);
        }}
      />
      
      {!disabled && showSuggestions && suggestions.length > 0 && (
        <Card
          ref={suggestionsRef}
          className="absolute z-50 w-full mt-1 p-0 max-h-60 overflow-y-auto"
          data-testid="address-suggestions-list"
        >
          {suggestions.map((suggestion, index) => (
            <button
              key={`${suggestion.fiasId}-${index}`}
              type="button"
              onClick={() => handleSelectSuggestion(suggestion)}
              className="w-full px-3 py-2 text-left hover-elevate active-elevate-2 flex items-start gap-2 border-b last:border-b-0"
              data-testid={`address-suggestion-${index}`}
            >
              <MapPin className="w-4 h-4 mt-1 text-muted-foreground flex-shrink-0" />
              <span className="text-sm">{suggestion.fullAddress}</span>
            </button>
          ))}
        </Card>
      )}

      {isLoading && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      )}
    </div>
  );
});
