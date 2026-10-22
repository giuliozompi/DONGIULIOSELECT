import { useState, useEffect, useCallback, useRef, useId, forwardRef, useImperativeHandle, type InputHTMLAttributes } from 'react';
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
  const [activeIndex, setActiveIndex] = useState(-1);
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const requestVersion = useRef(0);
  useImperativeHandle(ref, () => inputRef.current!);
  const isOpen = !disabled && showSuggestions && suggestions.length > 0;

  const dismissSuggestions = useCallback(() => {
    requestVersion.current++;
    setHasUserInteracted(false);
    setShowSuggestions(false);
    setIsLoading(false);
    setActiveIndex(-1);
  }, []);

  useEffect(() => {
    // Dialogs listen for Escape on document capture, before React handlers.
    // Handle only this focused popup first, leaving a second Escape to the dialog.
    const handleEscape = (event: KeyboardEvent) => {
      if (event.target !== inputRef.current || event.key !== 'Escape' ||
        event.isComposing || event.keyCode === 229 || disabled ||
        !(isOpen || hasUserInteracted || isLoading)) return;
      event.preventDefault();
      event.stopPropagation();
      dismissSuggestions();
    };
    window.addEventListener('keydown', handleEscape, true);
    return () => window.removeEventListener('keydown', handleEscape, true);
  }, [isOpen, hasUserInteracted, isLoading, disabled, dismissSuggestions]);

  useEffect(() => {
    if (isOpen && activeIndex >= 0) {
      document.getElementById(`${listId}-${activeIndex}`)?.scrollIntoView({ block: 'nearest' });
    }
  }, [activeIndex, isOpen, listId]);

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
      setActiveIndex(-1);
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
      setActiveIndex(-1);
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
        dismissSuggestions();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [dismissSuggestions]);

  const handleSelectSuggestion = (suggestion: AddressSuggestion) => {
    dismissSuggestions();
    onChange(suggestion.fullAddress, suggestion);
    if (onSelect) {
      onSelect(suggestion);
    }
    setSuggestions([]);
  };

  return (
    <div className="relative">
      <Input
        {...inputProps}
        ref={inputRef}
        dir="ltr"
        value={value}
        role="combobox"
        aria-autocomplete="list"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={isOpen ? listId : undefined}
        aria-activedescendant={isOpen && activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing || event.keyCode === 229) return;
          if (isOpen && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
            event.preventDefault();
            setActiveIndex(index => event.key === 'ArrowDown'
              ? (index + 1) % suggestions.length
              : (index <= 0 ? suggestions.length : index) - 1);
          } else if (isOpen && event.key === 'Enter') {
            // An open popup must never implicitly submit the surrounding form.
            event.preventDefault();
            if (activeIndex >= 0) handleSelectSuggestion(suggestions[activeIndex]);
          }
        }}
        onBlur={(event) => {
          dismissSuggestions();
          inputProps.onBlur?.(event);
        }}
        onChange={(e) => {
          requestVersion.current++;
          setSuggestions([]);
          setShowSuggestions(false);
          setIsLoading(false);
          setActiveIndex(-1);
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
      
      {isOpen && (
        <Card
          ref={suggestionsRef}
          id={listId}
          role="listbox"
          aria-label="Подсказки адресов"
          className="absolute z-50 w-full mt-1 p-0 max-h-60 overflow-y-auto"
          data-testid="address-suggestions-list"
        >
          {suggestions.map((suggestion, index) => (
            <button
              key={`${suggestion.fiasId}-${index}`}
              id={`${listId}-${index}`}
              type="button"
              role="option"
              aria-selected={activeIndex === index}
              tabIndex={-1}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => handleSelectSuggestion(suggestion)}
              className={`w-full px-3 py-2 text-left hover-elevate active-elevate-2 flex items-start gap-2 border-b last:border-b-0 ${activeIndex === index ? 'bg-accent text-accent-foreground' : ''}`}
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
