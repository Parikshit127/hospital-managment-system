'use client';

import { createContext, useContext } from 'react';

export const AdminPortalContext = createContext(false);
export const useAdminPortal = () => useContext(AdminPortalContext);
