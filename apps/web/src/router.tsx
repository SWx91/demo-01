import { createBrowserRouter } from 'react-router';
import { RequireAuth } from '@/components/require-auth';
import { StoresPage } from '@/components/stores-page';
import { HomePage } from '@/routes/home';
import { LoginPage } from '@/routes/login';
import { RootLayout } from '@/routes/root-layout';

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    // Everything below requires a signed-in user.
    element: <RequireAuth />,
    children: [
      {
        path: '/',
        element: <RootLayout />,
        children: [
          { index: true, element: <HomePage /> },
          { path: 'stores', element: <StoresPage /> },
        ],
      },
    ],
  },
]);
