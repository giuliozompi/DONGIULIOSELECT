import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { useTelegramBackButton } from '@/hooks/useTelegramBackButton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ArrowLeft, Save, User as UserIcon, MapPin, Plus, Trash2, MapPinned, Edit } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { Badge } from '@/components/ui/badge';
import { AddressAutocomplete, type AddressSuggestion } from '@/components/AddressAutocomplete';
import { normalizePhoneNumber } from '@/lib/utils';
import type { User, UserAddress } from '@shared/schema';

export default function MyDataPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  const { data: user, isLoading } = useQuery<User>({
    queryKey: ['/api/user']
  });

  const { data: addresses = [] } = useQuery<UserAddress[]>({
    queryKey: ['/api/user/addresses']
  });

  const [formData, setFormData] = useState({
    customerName: '',
    phone: '',
    email: '',
    address: '',
    city: '',
    building: '',
    apartment: '',
    addressNotes: ''
  });

  const [isEditing, setIsEditing] = useState(false);
  const [addressInput, setAddressInput] = useState('');
  const [showAddAddressDialog, setShowAddAddressDialog] = useState(false);
  const [newAddress, setNewAddress] = useState({
    label: '',
    fullAddress: '',
    city: '',
    street: '',
    building: '',
    flat: '',
    postalCode: '',
    dadataFiasId: '',
    latitude: '',
    longitude: '',
    phone: ''
  });
  const [newAddressInput, setNewAddressInput] = useState('');
  const [showEditAddressDialog, setShowEditAddressDialog] = useState(false);
  const [editingAddress, setEditingAddress] = useState<UserAddress | null>(null);
  const [editAddress, setEditAddress] = useState({
    label: '',
    fullAddress: '',
    city: '',
    street: '',
    building: '',
    flat: '',
    postalCode: '',
    dadataFiasId: '',
    latitude: '',
    longitude: '',
    phone: ''
  });
  const [editAddressInput, setEditAddressInput] = useState('');

  // Update form when user data loads
  useEffect(() => {
    if (user) {
      setFormData({
        customerName: user.customerName || '',
        phone: user.phone || '',
        email: user.email || '',
        address: user.address || '',
        city: user.city || '',
        building: user.building || '',
        apartment: user.apartment || '',
        addressNotes: user.addressNotes || ''
      });
      // Set the full address for the autocomplete input
      if (user.address || user.city) {
        const fullAddr = [user.city, user.address, user.building].filter(Boolean).join(', ');
        setAddressInput(fullAddr);
      }
    }
  }, [user]);

  const handleAddressSelect = (fullAddress: string, suggestion?: AddressSuggestion) => {
    setAddressInput(fullAddress);
    // Salva solo l'indirizzo completo e pulisce i campi separati obsoleti
    setFormData(prev => ({
      ...prev,
      address: fullAddress,
      city: '',
      building: '',
      apartment: ''
    }));
  };

  useTelegramBackButton(() => {
    setLocation('/lk');
  });

  const updateMutation = useMutation({
    mutationFn: async (data: { 
      customerName?: string | null; 
      phone?: string | null; 
      email?: string | null;
      address?: string | null;
      city?: string | null;
      building?: string | null;
      apartment?: string | null;
      addressNotes?: string | null;
    }) => {
      return await apiRequest('PUT', '/api/user', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/user'] });
      setIsEditing(false);
      toast({
        title: 'Данные сохранены',
        description: 'Ваша информация успешно обновлена'
      });
    },
    onError: () => {
      toast({
        title: 'Ошибка',
        description: 'Не удалось сохранить данные',
        variant: 'destructive'
      });
    }
  });

  const deleteAddressMutation = useMutation({
    mutationFn: async (addressId: string) => {
      return await apiRequest('DELETE', `/api/user/addresses/${addressId}`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/user/addresses'] });
      toast({
        title: 'Адрес удален',
        description: 'Адрес успешно удален'
      });
    },
    onError: () => {
      toast({
        title: 'Ошибка',
        description: 'Не удалось удалить адрес',
        variant: 'destructive'
      });
    }
  });

  const setDefaultAddressMutation = useMutation({
    mutationFn: async (addressId: string) => {
      return await apiRequest('POST', `/api/user/addresses/${addressId}/set-default`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/user/addresses'] });
      toast({
        title: 'Адрес по умолчанию обновлен',
        description: 'Этот адрес теперь используется по умолчанию'
      });
    },
    onError: () => {
      toast({
        title: 'Ошибка',
        description: 'Не удалось установить адрес по умолчанию',
        variant: 'destructive'
      });
    }
  });

  const addAddressMutation = useMutation({
    mutationFn: async (addressData: typeof newAddress) => {
      return await apiRequest('POST', '/api/user/addresses', addressData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/user/addresses'] });
      toast({
        title: 'Адрес добавлен',
        description: 'Новый адрес успешно добавлен'
      });
      setShowAddAddressDialog(false);
      setNewAddress({
        label: '',
        fullAddress: '',
        city: '',
        street: '',
        building: '',
        flat: '',
        postalCode: '',
        dadataFiasId: '',
        latitude: '',
        longitude: '',
        phone: ''
      });
      setNewAddressInput('');
    },
    onError: () => {
      toast({
        title: 'Ошибка',
        description: 'Не удалось добавить адрес',
        variant: 'destructive'
      });
    }
  });

  const updateAddressMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof editAddress }) => {
      return await apiRequest('PATCH', `/api/user/addresses/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/user/addresses'] });
      toast({
        title: 'Адрес обновлен',
        description: 'Адрес успешно обновлен'
      });
      setShowEditAddressDialog(false);
      setEditingAddress(null);
      setEditAddress({
        label: '',
        fullAddress: '',
        city: '',
        street: '',
        building: '',
        flat: '',
        postalCode: '',
        dadataFiasId: '',
        latitude: '',
        longitude: '',
        phone: ''
      });
      setEditAddressInput('');
    },
    onError: () => {
      toast({
        title: 'Ошибка',
        description: 'Не удалось обновить адрес',
        variant: 'destructive'
      });
    }
  });

  const handleNewAddressSelect = (fullAddress: string, suggestion?: AddressSuggestion) => {
    setNewAddressInput(fullAddress);
    if (suggestion) {
      setNewAddress(prev => ({
        ...prev,
        fullAddress,
        city: suggestion.city || '',
        street: suggestion.street || '',
        building: suggestion.building || '',
        flat: suggestion.flat || '',
        postalCode: suggestion.postalCode || '',
        dadataFiasId: suggestion.fiasId,
        latitude: suggestion.geoLat || '',
        longitude: suggestion.geoLon || ''
      }));
    } else {
      setNewAddress(prev => ({
        ...prev,
        fullAddress
      }));
    }
  };

  const handleAddAddress = () => {
    if (!newAddress.label.trim()) {
      toast({
        title: 'Ошибка',
        description: 'Введите название адреса',
        variant: 'destructive'
      });
      return;
    }
    if (!newAddress.fullAddress.trim()) {
      toast({
        title: 'Ошибка',
        description: 'Выберите адрес из списка',
        variant: 'destructive'
      });
      return;
    }
    
    const normalizedAddress = {
      ...newAddress,
      phone: newAddress.phone ? normalizePhoneNumber(newAddress.phone) : ''
    };
    
    addAddressMutation.mutate(normalizedAddress);
  };

  const handleEditAddressClick = (address: UserAddress) => {
    setEditingAddress(address);
    setEditAddress({
      label: address.label,
      fullAddress: address.fullAddress,
      city: address.city || '',
      street: address.street || '',
      building: address.building || '',
      flat: address.flat || '',
      postalCode: address.postalCode || '',
      dadataFiasId: address.dadataFiasId || '',
      latitude: address.latitude || '',
      longitude: address.longitude || '',
      phone: address.phone || ''
    });
    setEditAddressInput(address.fullAddress);
    setShowEditAddressDialog(true);
  };

  const handleEditAddressSelect = (fullAddress: string, suggestion?: AddressSuggestion) => {
    setEditAddressInput(fullAddress);
    if (suggestion) {
      setEditAddress(prev => ({
        ...prev,
        fullAddress,
        city: suggestion.city || '',
        street: suggestion.street || '',
        building: suggestion.building || '',
        flat: suggestion.flat || '',
        postalCode: suggestion.postalCode || '',
        dadataFiasId: suggestion.fiasId,
        latitude: suggestion.geoLat || '',
        longitude: suggestion.geoLon || ''
      }));
    } else {
      setEditAddress(prev => ({
        ...prev,
        fullAddress
      }));
    }
  };

  const handleUpdateAddress = () => {
    if (!editingAddress) return;
    
    if (!editAddress.label.trim()) {
      toast({
        title: 'Ошибка',
        description: 'Введите название адреса',
        variant: 'destructive'
      });
      return;
    }
    if (!editAddress.fullAddress.trim()) {
      toast({
        title: 'Ошибка',
        description: 'Выберите адрес из списка',
        variant: 'destructive'
      });
      return;
    }
    
    const normalizedAddress = {
      ...editAddress,
      phone: editAddress.phone ? normalizePhoneNumber(editAddress.phone) : ''
    };
    
    updateAddressMutation.mutate({ id: editingAddress.id, data: normalizedAddress });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Normalizza campi vuoti a null per permettere la cancellazione nel DB
    // Impostiamo city, building, apartment a null per pulire i vecchi dati
    const normalizedData = {
      customerName: formData.customerName.trim() || null,
      phone: formData.phone.trim() ? normalizePhoneNumber(formData.phone.trim()) : null,
      email: formData.email.trim() || null,
      address: formData.address.trim() || null,
      addressNotes: formData.addressNotes.trim() || null,
      city: null,
      building: null,
      apartment: null,
    };
    
    updateMutation.mutate(normalizedData);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Загрузка...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-20 bg-background">
      <div className="sticky top-0 z-40 bg-background border-b">
        <div className="flex items-center gap-3 p-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setLocation('/lk')}
            data-testid="button-back"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-xl font-bold" data-testid="text-page-title">Мои данные</h1>
        </div>
      </div>

      <div className="p-4 space-y-4">
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Personal Information Card */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-lg bg-primary/10">
                    <UserIcon className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <CardTitle>Личная информация</CardTitle>
                    <CardDescription>Управляйте вашими контактными данными</CardDescription>
                  </div>
                </div>
                {!isEditing && (
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={() => setIsEditing(true)}
                    data-testid="button-edit-profile"
                  >
                    <Edit className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="telegram-info">Telegram</Label>
                <div className="p-3 rounded-md bg-muted" data-testid="text-telegram-info">
                  {user?.firstName && user?.lastName ? `${user.firstName} ${user.lastName}` : user?.username || 'Не указано'}
                  {user?.username && <span className="text-muted-foreground ml-2">@{user.username}</span>}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="customerName">Полное имя</Label>
                <Input
                  id="customerName"
                  type="text"
                  dir="ltr"
                  placeholder="Введите ваше имя"
                  value={formData.customerName}
                  onChange={(e) => setFormData({ ...formData, customerName: e.target.value })}
                  data-testid="input-customer-name"
                  disabled={!isEditing}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">Телефон</Label>
                <Input
                  id="phone"
                  type="tel"
                  dir="ltr"
                  placeholder="+7 (___) ___-__-__"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  data-testid="input-phone"
                  disabled={!isEditing}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  dir="ltr"
                  placeholder="example@email.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  data-testid="input-email"
                  disabled={!isEditing}
                />
              </div>
            </CardContent>
          </Card>

          {/* Primary Address Card */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-lg bg-primary/10">
                    <MapPin className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <CardTitle>Адрес доставки</CardTitle>
                    <CardDescription>Основной адрес для доставки заказов</CardDescription>
                  </div>
                </div>
                {!isEditing && (
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={() => setIsEditing(true)}
                    data-testid="button-edit-address"
                  >
                    <Edit className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="address-autocomplete">Адрес доставки</Label>
                <AddressAutocomplete
                  value={addressInput}
                  onChange={handleAddressSelect}
                  placeholder="Начните вводить адрес: город, улица, дом, квартира..."
                  testId="input-address-autocomplete"
                  disabled={!isEditing}
                />
                <p className="text-xs text-muted-foreground">
                  Выберите адрес из списка для автоматического заполнения
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="addressNotes">Примечания к адресу</Label>
                <Textarea
                  id="addressNotes"
                  placeholder="Этаж, домофон, подъезд..."
                  value={formData.addressNotes}
                  onChange={(e) => setFormData({ ...formData, addressNotes: e.target.value })}
                  rows={3}
                  data-testid="input-address-notes"
                  disabled={!isEditing}
                />
              </div>
            </CardContent>
          </Card>

          {isEditing && (
            <Button
              type="submit"
              className="w-full"
              disabled={updateMutation.isPending}
              data-testid="button-save-all"
            >
              <Save className="w-4 h-4 mr-2" />
              {updateMutation.isPending ? 'Сохранение...' : 'Сохранить все данные'}
            </Button>
          )}
        </form>

        {/* Alternative Addresses Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-lg bg-primary/10">
                  <MapPinned className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <CardTitle>Альтернативные адреса</CardTitle>
                  <CardDescription>Дополнительные адреса для доставки</CardDescription>
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowAddAddressDialog(true)}
                data-testid="button-add-address"
              >
                <Plus className="w-4 h-4 mr-1" />
                Добавить
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {addresses.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground" data-testid="text-no-addresses">
                У вас нет дополнительных адресов
              </div>
            ) : (
              <div className="space-y-3">
                {addresses.map((address) => (
                  <Card key={address.id} data-testid={`card-address-${address.id}`}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="font-semibold" data-testid={`text-address-label-${address.id}`}>
                              {address.label}
                            </h4>
                            {address.isDefault && (
                              <Badge variant="default" data-testid={`badge-default-${address.id}`}>
                                По умолчанию
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground" data-testid={`text-address-full-${address.id}`}>
                            {address.fullAddress}
                          </p>
                          {address.phone && (
                            <p className="text-sm text-muted-foreground mt-1" data-testid={`text-address-phone-${address.id}`}>
                              Тел: {address.phone}
                            </p>
                          )}
                        </div>
                        <div className="flex gap-2">
                          {!address.isDefault && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setDefaultAddressMutation.mutate(address.id)}
                              disabled={setDefaultAddressMutation.isPending}
                              data-testid={`button-set-default-${address.id}`}
                            >
                              Основной
                            </Button>
                          )}
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => handleEditAddressClick(address)}
                            data-testid={`button-edit-address-${address.id}`}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => deleteAddressMutation.mutate(address.id)}
                            disabled={deleteAddressMutation.isPending}
                            data-testid={`button-delete-address-${address.id}`}
                          >
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Add Address Dialog */}
      <Dialog open={showAddAddressDialog} onOpenChange={setShowAddAddressDialog}>
        <DialogContent data-testid="dialog-add-address">
          <DialogHeader>
            <DialogTitle>Добавить новый адрес</DialogTitle>
            <DialogDescription>
              Добавьте альтернативный адрес для доставки
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new-address-label">Название адреса *</Label>
              <Input
                id="new-address-label"
                type="text"
                dir="ltr"
                placeholder="Дом, Работа, Дача..."
                value={newAddress.label}
                onChange={(e) => setNewAddress({ ...newAddress, label: e.target.value })}
                data-testid="input-new-address-label"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="new-address-autocomplete">Адрес *</Label>
              <AddressAutocomplete
                value={newAddressInput}
                onChange={handleNewAddressSelect}
                placeholder="Начните вводить адрес..."
                testId="input-new-address-autocomplete"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-2">
                <Label>Город</Label>
                <Input
                  type="text"
                  dir="ltr"
                  value={newAddress.city}
                  disabled
                  className="bg-muted"
                  data-testid="input-new-address-city"
                />
              </div>

              <div className="space-y-2">
                <Label>Улица и дом</Label>
                <Input
                  type="text"
                  dir="ltr"
                  value={`${newAddress.street || ''} ${newAddress.building || ''}`.trim()}
                  disabled
                  className="bg-muted"
                  data-testid="input-new-address-street"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="new-address-flat">Квартира</Label>
                <Input
                  id="new-address-flat"
                  type="text"
                  dir="ltr"
                  placeholder="кв. 25"
                  value={newAddress.flat}
                  onChange={(e) => setNewAddress({ ...newAddress, flat: e.target.value })}
                  data-testid="input-new-address-flat"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="new-address-phone">Телефон</Label>
              <Input
                id="new-address-phone"
                type="tel"
                dir="ltr"
                placeholder="+7 (999) 123-45-67"
                value={newAddress.phone}
                onChange={(e) => setNewAddress({ ...newAddress, phone: e.target.value })}
                data-testid="input-new-address-phone"
              />
            </div>

            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                onClick={() => setShowAddAddressDialog(false)}
                data-testid="button-cancel-add-address"
              >
                Отмена
              </Button>
              <Button
                onClick={handleAddAddress}
                disabled={addAddressMutation.isPending}
                data-testid="button-save-new-address"
              >
                {addAddressMutation.isPending ? 'Сохранение...' : 'Сохранить'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Address Dialog */}
      <Dialog open={showEditAddressDialog} onOpenChange={setShowEditAddressDialog}>
        <DialogContent data-testid="dialog-edit-address">
          <DialogHeader>
            <DialogTitle>Изменить адрес</DialogTitle>
            <DialogDescription>
              Измените альтернативный адрес для доставки
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-address-label">Название адреса *</Label>
              <Input
                id="edit-address-label"
                type="text"
                dir="ltr"
                placeholder="Дом, Работа, Дача..."
                value={editAddress.label}
                onChange={(e) => setEditAddress({ ...editAddress, label: e.target.value })}
                data-testid="input-edit-address-label"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-address-autocomplete">Адрес *</Label>
              <AddressAutocomplete
                value={editAddressInput}
                onChange={handleEditAddressSelect}
                placeholder="Начните вводить адрес..."
                testId="input-edit-address-autocomplete"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-2">
                <Label>Город</Label>
                <Input
                  type="text"
                  dir="ltr"
                  value={editAddress.city}
                  disabled
                  className="bg-muted"
                  data-testid="input-edit-address-city"
                />
              </div>

              <div className="space-y-2">
                <Label>Улица и дом</Label>
                <Input
                  type="text"
                  dir="ltr"
                  value={`${editAddress.street || ''} ${editAddress.building || ''}`.trim()}
                  disabled
                  className="bg-muted"
                  data-testid="input-edit-address-street"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-address-flat">Квартира</Label>
                <Input
                  id="edit-address-flat"
                  type="text"
                  dir="ltr"
                  placeholder="кв. 25"
                  value={editAddress.flat}
                  onChange={(e) => setEditAddress({ ...editAddress, flat: e.target.value })}
                  data-testid="input-edit-address-flat"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-address-phone">Телефон</Label>
              <Input
                id="edit-address-phone"
                type="tel"
                dir="ltr"
                placeholder="+7 (999) 123-45-67"
                value={editAddress.phone}
                onChange={(e) => setEditAddress({ ...editAddress, phone: e.target.value })}
                data-testid="input-edit-address-phone"
              />
            </div>

            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                onClick={() => setShowEditAddressDialog(false)}
                data-testid="button-cancel-edit-address"
              >
                Отмена
              </Button>
              <Button
                onClick={handleUpdateAddress}
                disabled={updateAddressMutation.isPending}
                data-testid="button-save-edit-address"
              >
                {updateAddressMutation.isPending ? 'Сохранение...' : 'Сохранить'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
