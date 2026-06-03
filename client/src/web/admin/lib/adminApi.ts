import { webApi } from '../../lib/webApi';

const A = '/admin';

export const adminApi = {
  check: () => webApi.get<{ ok: boolean; isMasterAdmin: boolean }>(`${A}/check`),

  // Analytics
  analyticsSummary: (startDate: string, endDate: string) =>
    webApi.get<any>(`${A}/analytics/summary?startDate=${startDate}&endDate=${endDate}`),
  analyticsTimeseries: (startDate: string, endDate: string) =>
    webApi.get<any[]>(`${A}/analytics/timeseries?startDate=${startDate}&endDate=${endDate}`),
  analyticsTopProducts: (startDate: string, endDate: string) =>
    webApi.get<any[]>(`${A}/analytics/top-products?startDate=${startDate}&endDate=${endDate}`),

  // Categories
  getCategories: () => webApi.get<any[]>(`${A}/categories`),
  createCategory: (data: any) => webApi.post<any>(`${A}/categories`, data),
  updateCategory: (id: string, data: any) => webApi.patch<any>(`${A}/categories/${id}`, data),
  deleteCategory: (id: string) => webApi.delete<void>(`${A}/categories/${id}`),

  // Products
  getProducts: (categoryId?: string) =>
    webApi.get<any[]>(`${A}/products${categoryId ? `?categoryId=${categoryId}` : ''}`),
  createProduct: (data: any) => webApi.post<any>(`${A}/products`, data),
  updateProduct: (id: string, data: any) => webApi.patch<any>(`${A}/products/${id}`, data),
  toggleStock: (id: string, inStock: boolean) =>
    webApi.patch<any>(`${A}/products/${id}/stock`, { inStock }),
  toggleVisibility: (id: string, isVisible: boolean) =>
    webApi.patch<any>(`${A}/products/${id}/visibility`, { isVisible }),
  deleteProduct: (id: string) => webApi.delete<void>(`${A}/products/${id}`),

  // Orders
  getOrders: (status?: string, search?: string) => {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (search) params.set('search', search);
    const qs = params.toString();
    return webApi.get<any[]>(`${A}/orders${qs ? `?${qs}` : ''}`);
  },
  getOrder: (id: string) => webApi.get<any>(`${A}/orders/${id}`),
  updateOrderStatus: (id: string, status: string) =>
    webApi.patch<any>(`${A}/orders/${id}/status`, { status }),
  updateQuantity: (id: string, productId: string, newQuantity: number) =>
    webApi.post<any>(`${A}/orders/${id}/update-quantity`, { productId, newQuantity }),
  addProduct: (id: string, productId: string, quantity?: number) =>
    webApi.post<any>(`${A}/orders/${id}/add-product`, { productId, quantity }),
  removeProduct: (id: string, productId: string) =>
    webApi.post<any>(`${A}/orders/${id}/remove-product`, { productId }),
  applyDiscount: (id: string, discountType: string, discountValue: string) =>
    webApi.post<any>(`${A}/orders/${id}/apply-discount`, { discountType, discountValue }),
  deleteOrder: (id: string) => webApi.delete<void>(`${A}/orders/${id}`),

  // Clients
  getClients: () => webApi.get<any[]>(`${A}/clients`),
  getClient: (id: string) => webApi.get<any>(`${A}/clients/${id}`),

  // Logs
  getActionLogs: () => webApi.get<any[]>(`${A}/action-logs`),
  getOrderNotifLogs: () => webApi.get<any[]>(`${A}/notification-logs/order`),

  // Pickup Addresses
  getPickupAddresses: () => webApi.get<any[]>(`${A}/pickup-addresses`),
  createPickupAddress: (data: any) => webApi.post<any>(`${A}/pickup-addresses`, data),
  updatePickupAddress: (id: string, data: any) =>
    webApi.patch<any>(`${A}/pickup-addresses/${id}`, data),
  deletePickupAddress: (id: string) => webApi.delete<void>(`${A}/pickup-addresses/${id}`),

  // Product Associations
  getAssociations: () => webApi.get<any[]>(`${A}/product-associations`),
  createAssociation: (sourceProductId: string, targetProductId: string) =>
    webApi.post<any>(`${A}/product-associations`, { sourceProductId, targetProductId }),
  deleteAssociation: (id: string) => webApi.delete<void>(`${A}/product-associations/${id}`),

  // Admin Management
  getAdmins: () => webApi.get<any[]>(`${A}/admins`),
  promoteAdmin: (email: string, isMasterAdmin?: boolean) =>
    webApi.post<any>(`${A}/admins/promote`, { email, isMasterAdmin }),
  demoteAdmin: (id: string) => webApi.delete<void>(`${A}/admins/${id}`),
};
