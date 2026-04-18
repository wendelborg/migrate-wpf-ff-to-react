import { ContentPageA } from './pages/ContentPageA/ContentPageA';
import { ContentPageB } from './pages/ContentPageB/ContentPageB';
import { GroupableTable } from './pages/GroupableTable';

export const routes = [
  { path: '/content-a', element: <ContentPageA /> },
  { path: '/content-b/:orderId?', element: <ContentPageB /> },
  { path: '/groupable-table', element: <GroupableTable /> },
];
