import { type ColumnDef } from '@tanstack/react-table';
import { GroupableTable } from '../../components/GroupableTable';

// ---------------------------------------------------------------------------
// Types & data
// ---------------------------------------------------------------------------

interface Order extends Record<string, unknown> {
  id: number;
  customer: string;
  category: 'Electronics' | 'Clothing' | 'Food' | 'Home';
  status: 'Active' | 'Pending' | 'Closed';
  region: 'North' | 'South' | 'East' | 'West';
  amount: number;
}

const CUSTOMERS = ['Acme Corp', 'Globex', 'Initech', 'Umbrella', 'Waystar', 'Contoso', 'Fabrikam', 'Northwind'] as const;
const CATEGORIES = ['Electronics', 'Clothing', 'Food', 'Home'] as const;
const STATUSES = ['Active', 'Pending', 'Closed'] as const;
const REGIONS = ['North', 'South', 'East', 'West'] as const;

// Deterministic Fisher-Yates shuffle so the table loads in a non-sequential
// order, making it immediately obvious that no sort is applied by default.
function deterministicShuffle<T>(arr: readonly T[], seed: number): T[] {
  const result = [...arr];
  let s = seed;
  for (let i = result.length - 1; i > 0; i--) {
    s = (Math.imul(s, 1664525) + 1013904223) | 0;
    const j = (s >>> 0) % (i + 1);
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}

const ORDER_DATA: Order[] = deterministicShuffle(
  Array.from({ length: 500 }, (_, i) => ({
    id: i + 1,
    customer: CUSTOMERS[i % CUSTOMERS.length]!,
    category: CATEGORIES[i % CATEGORIES.length]!,
    status: STATUSES[i % STATUSES.length]!,
    region: REGIONS[i % REGIONS.length]!,
    amount: Math.round((50 + ((i * 379) % 9950)) * 100) / 100,
  })),
  42,
);

const COLUMNS: ColumnDef<Order>[] = [
  { accessorKey: 'id',       header: 'ID',       id: 'id',       enableGrouping: false, enableSorting: true, filterFn: 'includesString' },
  { accessorKey: 'customer', header: 'Customer', id: 'customer', enableSorting: true, filterFn: 'includesString' },
  { accessorKey: 'category', header: 'Category', id: 'category', enableSorting: true, filterFn: 'includesString' },
  { accessorKey: 'status',   header: 'Status',   id: 'status',   enableSorting: true, filterFn: 'includesString' },
  { accessorKey: 'region',   header: 'Region',   id: 'region',   enableSorting: true, filterFn: 'includesString' },
  {
    accessorKey: 'amount',
    header: 'Amount',
    id: 'amount',
    enableGrouping: false,
    enableSorting: true,
    cell: (info) => `$${info.getValue<number>().toFixed(2)}`,
    aggregationFn: 'sum',
    aggregatedCell: ({ getValue }) => `$${getValue<number>().toFixed(2)}`,
  },
];

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export function OrdersTable() {
  return (
    <GroupableTable<Order>
      data={ORDER_DATA}
      columns={COLUMNS}
      title="Orders"
      description="Expand the panel below to group and filter. Click column headers to sort."
    />
  );
}
