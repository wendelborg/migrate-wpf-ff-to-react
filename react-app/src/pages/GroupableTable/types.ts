export interface Order extends Record<string, unknown> {
  id: number;
  customer: string;
  category: 'Electronics' | 'Clothing' | 'Food' | 'Home';
  status: 'Active' | 'Pending' | 'Closed';
  region: 'North' | 'South' | 'East' | 'West';
  amount: number;
}
