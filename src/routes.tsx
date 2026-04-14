import { ContentPageA } from './pages/ContentPageA/ContentPageA';
import { ContentPageB } from './pages/ContentPageB/ContentPageB';

export const routes = [
  { path: '/content-a', element: <ContentPageA /> },
  { path: '/content-b/:orderId', element: <ContentPageB /> },
  { path: '/content-b', element: <ContentPageB /> },
];
